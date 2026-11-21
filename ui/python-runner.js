// Owns the worker lifecycle. Output and readiness are delivered to the caller.
function createPythonRunner() {
  let workerURL;
  let lastBase;

  function attempt(base, input, signal, onOutput, onReady) {
    return new Promise(resolve => {
      const worker = new Worker(workerURL);
      let timer;
      function finish(result) {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        worker.onmessage = worker.onerror = null;
        worker.terminate();
        resolve(result);
      }
      function stop() { finish({ error: '已停止运行。' }); }
      signal.addEventListener('abort', stop, { once: true });
      timer = setTimeout(() => finish({ loadError: '加载解释器超时' }), 15000);
      worker.onerror = event => finish({ loadError: event.message || '工作线程加载失败' });
      worker.onmessage = ({ data }) => {
        switch (data.kind) {
          case 'ready':
            lastBase = base;
            onReady();
            clearTimeout(timer);
            timer = setTimeout(() => finish({ error: '运行超过 30 秒，已停止。' }), 30000);
            worker.onerror = event => finish({ error: event.message || '运行中断' });
            break;
          case 'output': onOutput(data.text, data.type); break;
          case 'load-error': finish({ loadError: data.message }); break;
          case 'error': finish({ error: data.message }); break;
          case 'done': finish(data.result); break;
        }
      };
      worker.postMessage({ base, ...input });
    });
  }

  return async function run(input, { signal, onOutput, onReady }) {
    workerURL ||= createLessonWorkerURL();
    const bases = new Set([lastBase, new URL('pyodide/', document.baseURI).href,
      'https://gcore.jsdelivr.net/pyodide/v0.25.0/full/', 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/']);
    let result;
    for (const base of bases) {
      if (!base) continue;
      if (signal.aborted) return { error: '已停止运行。' };
      result = await attempt(base, input, signal, onOutput, onReady);
      if (!result.loadError) return result;
    }
    return { error: 'Python 运行环境加载失败：' + result.loadError };
  };
}
