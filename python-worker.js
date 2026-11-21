// HTTP deployments use a normal, cacheable worker entry point. Each worker
// handles one run, so its Python globals and virtual files are isolated.
importScripts('runtime.js?v=3');

function lessonForSubmission(id) {
  importScripts('lessons.js?v=47', 'advanced_lessons.js?v=4');
  return lessons[id - 1];
}

self.onmessage = event => runWorker(event, lessonForSubmission);
