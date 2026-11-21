// Each worker owns one interpreter and one submission, including its virtual files.
async function executeLesson(runtime, lesson, { code, stdin, submit }, output) {
  let stdout = '';
  let lines = 0;
  let remaining = 65536;
  let limited = false;

  function stream(type) {
    const decoder = new TextDecoder();
    let tail = '';
    function append(text, final = false) {
      if (type === 'output' && stdout.length <= 65536) stdout += text.slice(0, 65537 - stdout.length);
      const visible = text.slice(0, remaining);
      remaining -= visible.length;
      const parts = (tail + visible).split('\n');
      tail = parts.pop();
      if ((final || !remaining) && tail) {
        parts.push(tail);
        tail = '';
      }
      for (const part of parts) {
        if (lines >= 500) break;
        output(part, type);
        lines++;
      }
      if ((lines >= 500 || !remaining) && !limited) {
        limited = true;
        output('已达到控制台输出上限。', 'system');
      }
    }
    return {
      write(bytes) {
        append(decoder.decode(bytes, { stream: true }));
        return bytes.length;
      },
      finish() { append(decoder.decode(), true); }
    };
  }

  const out = stream('output');
  const err = stream('error');
  runtime.setStdout({ write: out.write });
  runtime.setStderr({ write: err.write });
  let index = 0;
  runtime.setStdin({ stdin: () => stdin[index++] });
  if (lesson.level === 10 || /\bsqlite3\b/.test(code)) {
    await runtime.loadPackage('sqlite3');
  }
  const flush = runtime.runPython(`
import sys
def __flush_standard_streams(streams=(sys.stdout, sys.stderr)):
    for stream in streams:
        if not stream.closed:
            stream.flush()
__flush_standard_streams
`);
  try {
    const value = await runtime.runPythonAsync(code);
    value?.destroy?.();
    if (submit) {
      flush();
      return await lesson.validate(code, stdout, runtime.globals, runtime);
    }
    return { success: true };
  } finally {
    flush();
    out.finish();
    err.finish();
    flush.destroy();
  }
}

async function runWorker(event, getLesson) {
  const { base, lessonId, level, ...input } = event.data;
  let runtime;
  try {
    importScripts(base + 'pyodide.js');
    runtime = await loadPyodide({ indexURL: base });
  } catch (error) {
    postMessage({ kind: 'load-error', message: String(error) });
    return;
  }

  postMessage({ kind: 'ready' });
  try {
    const lesson = input.submit ? getLesson(lessonId) : { level };
    const result = await executeLesson(runtime, lesson, input,
      (text, type) => postMessage({ kind: 'output', text, type }));
    postMessage({ kind: 'done', result });
  } catch (error) {
    postMessage({ kind: 'error', message: String(error.message || error) });
  }
}

// A blob worker also works when index.html is opened directly and the browser
// forbids a file:// worker script. The Python binaries can then come from a CDN.
function createLessonWorkerURL() {
  if (location.protocol !== 'file:') return new URL('python-worker.js?v=1', document.baseURI).href;
  function lessonFromFile(id) {
    const course = createBaseLessons();
    appendAdvancedLessons(course);
    return course[id - 1];
  }
  const script = [createBaseLessons, appendAdvancedLessons, executeLesson, runWorker, lessonFromFile]
    .map(fn => fn.toString()).join('\n') + '\nself.onmessage = event => runWorker(event, lessonFromFile);';
  return URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
}

if (typeof module !== 'undefined') module.exports = { executeLesson };
