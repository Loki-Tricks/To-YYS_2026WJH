// Classic scripts also work when the course is opened directly from disk.
function createLearningStore(course) {
  const fallback = new Map();
  const keys = {
    completed: 'python_lessons_completed',
    unlocked: 'python_learning_hub_unlocked',
    lesson: 'python_learning_hub_current_lesson',
    sound: 'python_learning_hub_sound',
    theme: 'python_learning_hub_theme'
  };

  function read(key) {
    if (fallback.has(key)) return fallback.get(key);
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      fallback.delete(key);
    } catch {
      // Safari may deny persistent storage. Editing still works within this tab.
      fallback.set(key, value);
    }
  }

  function completed() {
    try {
      const saved = JSON.parse(read(keys.completed) || '[]');
      const ids = new Set(Array.isArray(saved) ? saved.map(Number) : []);
      const end = course.findIndex(lesson => !ids.has(lesson.id));
      return course.slice(0, end < 0 ? course.length : end).map(lesson => lesson.id);
    } catch {
      write(keys.completed, null);
      return [];
    }
  }

  return {
    completed,
    saveCompleted: ids => write(keys.completed, ids.length ? JSON.stringify(ids) : null),
    preference: name => read(keys[name]),
    setPreference: (name, value) => write(keys[name], value),
    draft: lesson => read('python_lesson_draft_' + lesson.id) ?? lesson.defaultCode,
    saveDraft: (lesson, value) => write('python_lesson_draft_' + lesson.id, value === lesson.defaultCode ? null : value),
    stdin: id => read('python_lesson_stdin_' + id) ?? '',
    saveStdin: (id, value) => write('python_lesson_stdin_' + id, value || null)
  };
}
