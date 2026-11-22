// Test a fresh temporary origin. Only the local test server opens this page.
(async function testSafari() {
  const frame = document.querySelector('iframe');
  const read = expression => frame.contentWindow.eval(expression);
  const element = id => frame.contentDocument.getElementById(id);
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const report = data => fetch('/result', { method: 'POST', body: JSON.stringify(data) });

  function check(condition, message) {
    if (!condition) throw new Error(message);
  }

  function click(id) {
    const button = element(id);
    check(button && !button.disabled, 'Unavailable button: ' + id);
    button.click();
  }

  function verifyPalette() {
    const tokens = frame.contentWindow.getComputedStyle(frame.contentDocument.body);
    function luminance(token) {
      const hex = tokens.getPropertyValue(token).trim().slice(1);
      const rgb = hex.match(/../g).map(channel => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }
    for (const [text, background] of [['--ink', '--surface'], ['--muted', '--soft'],
      ['--code-string', '--soft'], ['--code-number', '--soft'], ['--ink', '--selection'],
      ['--success', '--surface'], ['--primary', '--tint'], ['--action-ink', '--primary'], ['--danger', '--error-bg']]) {
      const [low, high] = [luminance(text), luminance(background)].sort((a, b) => a - b);
      check((high + 0.05) / (low + 0.05) >= 4.5, 'Low contrast: ' + text + ' on ' + background);
    }
  }

  async function verifyEditorSurface() {
    const content = frame.contentWindow.getComputedStyle(element('content-panel')).backgroundColor;
    await wait(() => {
      const surface = frame.contentDocument.querySelector('.monaco-editor-background');
      return surface && frame.contentWindow.getComputedStyle(surface).backgroundColor === content;
    }, 'Editor and reading panel theme mismatch', 4000);
  }

  async function wait(predicate, message, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await delay(80);
    }
    throw new Error(message);
  }

  async function navigate(reload = false) {
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    if (reload) frame.contentWindow.location.reload();
    else frame.src = '/index.html';
    await loaded;
    await wait(() => read("!!document.querySelector('#monaco-editor-body .monaco-editor')"), 'Monaco did not initialize');
  }

  async function submit(code, expectedCount) {
    read('editor.setValue(' + JSON.stringify(code) + ')');
    click('btn-submit');
    await wait(() => !read('activeRun'), 'Submission timed out');
    check(read('completedLessons.length') === expectedCount, element('console-log').textContent);
  }

  // Exercise the keyboard layout with synthetic visual viewport metrics in desktop Safari.
  async function verifyEditingViewport() {
    const win = frame.contentWindow;
    const viewport = win.visualViewport;
    const editor = read('monaco.editor.getEditors()[0]');
    const initialSize = frame.style.cssText;
    const originalCode = editor.getValue();
    try {
      frame.style.width = '390px';
      win.document.querySelector('.mobile-nav [data-view="code"]').click();
      editor.setValue('# line\n'.repeat(25) + 'print(26)');
      const last = editor.getModel().getLineCount();
      editor.focus();
      editor.setPosition({ lineNumber: last, column: 1 });
      editor.revealLine(last);
      for (const [width, height, visible, top] of [[390, 780, 370, 40], [320, 568, 258, 0], [844, 390, 185, 12]]) {
        frame.style.width = width + 'px';
        frame.style.height = height + 'px';
        Object.defineProperty(viewport, 'height', { configurable: true, value: visible });
        Object.defineProperty(viewport, 'offsetTop', { configurable: true, value: top });
        viewport.dispatchEvent(new win.Event('resize'));
        await delay(150);
        check(editor.getVisibleRanges().some(r => r.startLineNumber <= last && r.endLineNumber >= last),
          'Caret hidden after viewport shrink');
        for (const id of ['btn-run', 'btn-submit']) {
          const button = element(id);
          const r = button.getBoundingClientRect();
          const hit = win.document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          check(r.height >= 44 && r.top >= top && r.bottom <= top + visible && button.contains(hit),
            'Action outside keyboard viewport: ' + id);
        }
      }
    } finally {
      delete viewport.height;
      delete viewport.offsetTop;
      viewport.dispatchEvent(new win.Event('resize'));
      frame.style.cssText = initialSize;
      editor.setValue(originalCode);
    }
    await wait(() => !win.document.body.classList.contains('editing-viewport'), 'Keyboard layout stuck');
  }

  async function verifyAnswerLayout() {
    const doc = frame.contentDocument;
    const originalSize = frame.style.cssText;
    read('loadLesson(25)');
    check(element('lesson-detail-title').querySelector('small')?.textContent.includes('super()'),
      'Nested parentheses lost from lesson subtitle');
    doc.querySelector('.mobile-nav [data-view="code"]').click();
    const originalOutput = element('console-log').textContent;
    click('btn-reveal-solution');
    for (const [width, height] of [[320, 568], [844, 320]]) {
      frame.style.width = width + 'px';
      frame.style.height = height + 'px';
      await delay(100);
      const answer = doc.querySelector('.answer-panel-body').getBoundingClientRect();
      const editor = element('monaco-editor-body').getBoundingClientRect();
      const submit = element('btn-submit').getBoundingClientRect();
      check(answer.height >= 72 && editor.height >= 48 && submit.bottom <= element('coding-panel').getBoundingClientRect().bottom + 1,
        'Answer, editor or submit clipped at ' + width + 'x' + height);
      check(answer.right <= editor.left || answer.bottom <= editor.top, 'Answer covers editor');
    }
    click('btn-answer-panel-close');
    check(element('console-log').textContent === originalOutput, 'Answer toggle changed program output');
    frame.style.cssText = originalSize;
  }

  try {
    await report({ message: navigator.userAgent });
    await navigate();
    const cover = frame.contentDocument.querySelector('.gift-cover');
    check(cover.complete && cover.naturalWidth > 0, 'Missing offline cover illustration');
    element('lock-password-input').value = ' yys ';
    click('lock-submit-btn');
    verifyPalette();
    await verifyEditorSurface();
    click('btn-theme');
    verifyPalette();
    await verifyEditorSurface();
    click('btn-sound');
    for (const width of [320, 360, 375, 390, 720, 1024, 1025, 1181, 1440]) {
      frame.style.width = width + 'px';
      await delay(80);
      const nav = frame.contentDocument.querySelector('.mobile-nav');
      check(frame.contentDocument.documentElement.scrollWidth <= width + 1, 'Page overflows at ' + width);
      if (width <= 1024) {
        nav.querySelector('[data-view="map"]').click();
        check(element('sidebar-lessons').offsetWidth > 0, 'Directory unavailable at ' + width);
        nav.querySelector('[data-view="lesson"]').click();
        check(element('content-panel').offsetWidth > 0, 'Lesson unavailable at ' + width);
        const task = element('task-text').getBoundingClientRect();
        check(task.top < element('lesson-detail-body').getBoundingClientRect().top, 'Task below tutorial');
        nav.querySelector('[data-view="code"]').click();
      }
      const bounds = element('coding-panel').getBoundingClientRect();
      for (const id of ['btn-focus-code', 'btn-reveal-solution', 'btn-run', 'btn-clear-stdin', 'btn-clear-console']) {
        const control = element(id).getBoundingClientRect();
        check(control.width > 0 && control.left >= bounds.left && control.right <= bounds.right + 1,
          'Workspace control clipped: ' + id + ' at ' + width);
      }
      const editorOptions = read('monaco.editor.getEditors()[0].getRawOptions()');
      check(editorOptions.wordWrap === (width <= 640 ? 'on' : 'off') &&
        editorOptions.fontSize === (width <= 640 ? 16 : 15), 'Editor sizing did not follow viewport at ' + width);
      if (width <= 640) {
        const run = element('btn-run').getBoundingClientRect();
        const submit = element('btn-submit').getBoundingClientRect();
        const focus = element('btn-focus-code').getBoundingClientRect();
        const answer = element('btn-reveal-solution').getBoundingClientRect();
        check(run.height >= 44 && submit.height >= 44 && run.top === submit.top && submit.left - run.right >= 8,
          'Mobile run and submit actions misaligned at ' + width);
        check(focus.height >= 44 && answer.height >= 44 && focus.top === answer.top && answer.left - focus.right >= 6,
          'Mobile editor tools crowded at ' + width);
        for (const id of ['btn-clear-stdin', 'btn-clear-console']) {
          const target = element(id).getBoundingClientRect();
          check(target.width >= 44 && target.height >= 44, 'Small mobile clear button: ' + id);
        }
        check(element('editor-lesson-number').offsetWidth > 0, 'Mobile editor missing lesson number');
        check(frame.contentWindow.getComputedStyle(element('stdin-input')).fontSize === '16px',
          'Mobile input font too small');
      } else {
        check(!!element('btn-run').closest('.editor-actions'), 'Run missing from desktop toolbar');
      }
      const submitRect = element('btn-submit').getBoundingClientRect();
      check(submitRect.width > 0 && submitRect.right <= width + 1, 'Submit clipped or hidden at ' + width);
      click('btn-reveal-solution');
      const rect = element('answer-panel').getBoundingClientRect();
      check(rect.left >= 0 && rect.right <= width + 1 && rect.width > 120, 'Drawer clipped at ' + width);
      const editorBounds = element('monaco-editor-body').getBoundingClientRect();
      if (width <= 1024) {
        const submit = element('btn-submit').getBoundingClientRect();
        check((rect.bottom <= editorBounds.top || rect.right <= editorBounds.left) &&
          (rect.bottom <= submit.top || rect.right <= submit.left), 'Answer covers editor or submit at ' + width);
      } else {
        check(rect.right <= editorBounds.left, 'Answer overlaps desktop editor at ' + width);
      }
      click('btn-answer-panel-close');
    }
    await verifyEditingViewport();
    frame.style.width = '100%';
    click('btn-focus-code');
    element('focus-code-editor').value = "print(input(), end='')";
    element('focus-stdin-input').value = '中文末行';
    const runRect = element('btn-focus-run').getBoundingClientRect();
    click('btn-focus-run');
    const stopRect = element('focus-modal').querySelector('.stop-run').getBoundingClientRect();
    check(Math.abs(runRect.left - stopRect.left) < 2 && Math.abs(runRect.width - stopRect.width) < 2,
      'Run/stop controls shift position');
    await wait(() => !read('activeRun'), 'Focused run timed out');
    click('btn-focus-close');
    const output = element('console-log').textContent;
    check(output.includes('中文末行'), 'Output without newline lost');
    click('btn-focus-code');
    click('btn-focus-close');
    check(element('console-log').textContent === output, 'Opening focus mode discarded output');
    await navigate(true);
    check(element('stdin-input').value === '中文末行', 'stdin lost on reload');
    check(read("editor.getValue() === \"print(input(), end='')\" && !isSoundEnabled && document.body.classList.contains('dark-mode')"), 'Settings or draft lost');
    read("editor.setValue('while True: pass')");
    click('btn-run');
    await wait(() => element('console-log').textContent.includes('正在执行代码'), 'Interpreter never became ready');
    frame.contentDocument.querySelector('.stop-run').click();
    await wait(() => !read('activeRun'), 'Cancellation timed out');
    check(element('console-log').textContent.includes('已停止'), 'Cancellation status missing');
    await submit('pass', 0);
    // These incomplete answers used to pass despite violating the lesson contract.
    const regressions = new Map([
      [35, () => 'def normalize_score(score):\n    assert True\n    return score / 100'],
      [90, solution => solution.replace('return a / b', 'return 2')],
      [97, solution => solution.replace('if key not in self.cache:', 'if True:')],
      [100, solution => solution + '\nproject_plan["features"] = "abc"']
    ]);
    for (let index = 0; index < 100; index++) {
      check(read('currentLessonIndex') === index, 'Wrong active lesson ' + (index + 1));
      const solution = read('lessons[currentLessonIndex].solution');
      const mutation = regressions.get(index + 1);
      if (mutation) {
        const incorrect = mutation(solution);
        check(incorrect !== solution, 'Outdated regression fixture at lesson ' + (index + 1));
        await submit(incorrect, index);
      }
      await submit(solution, index + 1);
      click('btn-close-modal');
      if (index < 99) check(frame.contentDocument.activeElement === element('lesson-detail-title'), 'Focus missed next lesson');
      if ((index + 1) % 20 === 0) await report({ message: 'Passed ' + (index + 1) + ' lessons' });
    }
    await navigate(true);
    check(read('completedLessons.length === 100 && currentLessonIndex === 99'), 'Graduation lost');
    await verifyAnswerLayout();
    const directory = frame.contentDocument.querySelector('.mobile-nav [data-view="map"]');
    if (directory.offsetWidth) directory.click();
    const firstChapter = frame.contentDocument.querySelector('.level-group');
    if (!firstChapter.open) firstChapter.querySelector('summary').click();
    firstChapter.querySelector('.lesson-item').click();
    await navigate(true);
    check(read('currentLessonIndex === 0') && element('stdin-input').value === '中文末行', 'Review position or lesson input lost');
    click('btn-reset-progress');
    click('btn-confirm-cancel');
    check(read('completedLessons.length === 100'), 'Cancel reset lost progress');
    click('btn-reset-progress');
    click('btn-confirm-accept');
    await wait(() => read('completedLessons.length === 0'), 'Reset failed');
    document.body.textContent = 'Safari 验证完成，100 关全部通过。';
    await report({ success: true, message: document.body.textContent });
  } catch (error) {
    document.body.textContent = 'Safari 验证失败：' + error.message;
    await report({ success: false, message: document.body.textContent });
  }
})();
