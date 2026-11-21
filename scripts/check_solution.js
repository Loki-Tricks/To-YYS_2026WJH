// Run one lesson in its own process, matching the browser worker's lifetime.
const path = require("node:path");
const { loadLessons } = require("./validate_lessons.js");
const { loadPyodide } = require("../pyodide/pyodide.js");
const { executeLesson } = require("../runtime.js");

async function main() {
  const [index, ...paths] = process.argv.slice(2);
  const lesson = loadLessons(paths)[Number(index)];
  const runtime = await loadPyodide({ indexURL: path.resolve(__dirname, "../pyodide") + path.sep });
  const check = code => executeLesson(runtime, lesson, { code, stdin: [], submit: true }, () => {});
  const empty = await check("pass");
  if (empty.success) throw new Error("An empty answer passed validation.");
  const result = await check(lesson.solution);
  if (!result.success) throw new Error(result.message);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
