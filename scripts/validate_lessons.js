#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const REQUIRED_FIELDS = [
  "id",
  "level",
  "title",
  "description",
  "task",
  "hint",
  "defaultCode",
  "solution",
  "validate"
];

function usage() {
  console.log("Usage: node scripts/validate_lessons.js [--runtime] [path/to/lessons.js] [path/to/advanced_lessons.js]");
}

function loadLessons(lessonPaths) {
  const source = lessonPaths
    .map((lessonPath) => fs.readFileSync(lessonPath, "utf8"))
    .join("\n\n");
  const sandbox = {
    window: {},
    console
  };
  const exposeLessons = [
    "",
    ";globalThis.__validatedLessons =",
    "  typeof lessons !== 'undefined' ? lessons :",
    "  (typeof window !== 'undefined' ? window.lessons : undefined);"
  ].join("\n");

  vm.createContext(sandbox);
  new vm.Script(`${source}${exposeLessons}`, { filename: lessonPaths.join(", ") }).runInContext(sandbox, {
    timeout: 5000
  });

  return sandbox.__validatedLessons;
}

function findPython() {
  const candidates = process.platform === "win32"
    ? [
        { command: "python", args: [] },
        { command: "py", args: ["-3"] },
        { command: "python3", args: [] }
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] }
      ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.args, "--version"], {
      encoding: "utf8"
    });

    if (result.status === 0) {
      const version = `${result.stdout || result.stderr}`.trim();
      return { ...candidate, version };
    }
  }

  return null;
}

function addIssue(issues, lessonLabel, message) {
  issues.push({ lessonLabel, message });
}

function validateLessonShape(lessons, issues) {
  if (!Array.isArray(lessons)) {
    addIssue(issues, "global", "lessons is not an array.");
    return;
  }

  if (lessons.length === 0) {
    addIssue(issues, "global", "lessons array is empty.");
    return;
  }

  const seenIds = new Set();

  lessons.forEach((lesson, index) => {
    const lessonLabel = `lesson[${index}]`;

    if (!lesson || typeof lesson !== "object" || Array.isArray(lesson)) {
      addIssue(issues, lessonLabel, "lesson entry must be an object.");
      return;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(lesson, field)) {
        addIssue(issues, lessonLabel, `missing required field "${field}".`);
      }
    }

    const expectedId = index + 1;
    if (!Number.isInteger(lesson.id)) {
      addIssue(issues, lessonLabel, "id must be an integer.");
    } else {
      if (seenIds.has(lesson.id)) {
        addIssue(issues, `lesson id ${lesson.id}`, "duplicate id.");
      }
      seenIds.add(lesson.id);

      if (lesson.id !== expectedId) {
        addIssue(issues, `lesson id ${lesson.id}`, `id should be ${expectedId} at array position ${index}.`);
      }
    }

    if (!Number.isInteger(lesson.level)) {
      addIssue(issues, lesson.id ? `lesson id ${lesson.id}` : lessonLabel, "level must be an integer.");
    }

    for (const field of ["title", "description", "task", "hint", "defaultCode", "solution"]) {
      if (Object.prototype.hasOwnProperty.call(lesson, field) && typeof lesson[field] !== "string") {
        addIssue(issues, lesson.id ? `lesson id ${lesson.id}` : lessonLabel, `${field} must be a string.`);
      }
    }

    if (Object.prototype.hasOwnProperty.call(lesson, "validate") && typeof lesson.validate !== "function") {
      addIssue(issues, lesson.id ? `lesson id ${lesson.id}` : lessonLabel, "validate must be a function.");
    }
  });
}

function validateSolutionsCompile(lessons, python, issues) {
  if (!Array.isArray(lessons)) {
    return;
  }

  const sources = lessons.flatMap((lesson, index) => {
    if (typeof lesson?.solution !== "string") return [];
    return [{ id: Number.isInteger(lesson.id) ? lesson.id : index + 1, source: lesson.solution }];
  });
  const compiler = `
import json, sys
errors = []
for lesson in json.load(sys.stdin):
    try:
        compile(lesson["source"], f"<lesson {lesson['id']} solution>", "exec")
    except (SyntaxError, ValueError) as error:
        errors.append([lesson["id"], str(error)])
print(json.dumps(errors))
`;
  const result = spawnSync(python.command, [...python.args, "-c", compiler], {
    input: JSON.stringify(sources), encoding: "utf8", maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    addIssue(issues, "global", result.error?.message || result.stderr || "Python compilation failed.");
    return;
  }
  for (const [id, message] of JSON.parse(result.stdout)) {
    addIssue(issues, `lesson id ${id}`, `solution does not compile: ${message}`);
  }
}

function printReport({ lessons, lessonPaths, python, issues }) {
  const pythonCommand = python
    ? [python.command, ...python.args].join(" ")
    : null;

  console.log("Lesson validation report");
  console.log("========================");
  console.log(`Lessons files: ${lessonPaths.join(", ")}`);
  console.log(`Python: ${python ? `${pythonCommand} (${python.version})` : "not found"}`);
  console.log(`Lessons loaded: ${Array.isArray(lessons) ? lessons.length : "n/a"}`);
  console.log("");

  if (issues.length === 0) {
    console.log("[OK] Structure, ids, required fields, and Python solution compilation all passed.");
    return;
  }

  console.log(`[FAIL] Found ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.log(`- ${issue.lessonLabel}: ${issue.message}`);
  }
}

function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return 0;
  }

  const projectRoot = path.resolve(__dirname, "..");
  const defaultPaths = [path.join(projectRoot, "lessons.js")];
  const defaultAdvancedPath = path.join(projectRoot, "advanced_lessons.js");
  if (fs.existsSync(defaultAdvancedPath)) {
    defaultPaths.push(defaultAdvancedPath);
  }
  const runtimeCheck = process.argv.includes("--runtime");
  const paths = process.argv.slice(2).filter(arg => arg !== "--runtime");
  const lessonPaths = (paths.length ? paths : defaultPaths)
    .map((lessonPath) => path.resolve(lessonPath));
  const issues = [];
  let lessons;

  for (const lessonPath of lessonPaths) {
    if (!fs.existsSync(lessonPath)) {
      addIssue(issues, "global", `lessons file not found: ${lessonPath}`);
    }
  }

  if (issues.length === 0) {
    try {
      lessons = loadLessons(lessonPaths);
      validateLessonShape(lessons, issues);
    } catch (error) {
      addIssue(issues, "global", `failed to load lessons files: ${error.message}`);
    }
  }

  const python = findPython();
  if (!python) {
    addIssue(issues, "global", "local Python was not found. Tried python, py -3, and python3.");
  } else {
    validateSolutionsCompile(lessons, python, issues);
  }

  if (runtimeCheck && !issues.length) {
    const runner = path.join(__dirname, "check_solution.js");
    for (const [index, lesson] of lessons.entries()) {
      const result = spawnSync(process.execPath, [runner, String(index), ...lessonPaths], {
        timeout: 45000, encoding: "utf8"
      });
      if (result.status !== 0) {
        addIssue(issues, `lesson id ${lesson.id}`, result.error?.message || result.stderr || "Runtime check failed.");
      }
    }
    if (!issues.length) console.log(`[OK] ${lessons.length} reference solutions passed and empty answers were rejected in Pyodide.`);
  }

  printReport({ lessons, lessonPaths, python, issues });
  return issues.length === 0 ? 0 : 1;
}

module.exports = { loadLessons };
if (require.main === module) process.exitCode = main();
