const store = createLearningStore(lessons);
const runPython = createPythonRunner();
const ANSWER_BUTTON_READY_TEXT = '参考答案';
const ANSWER_BUTTON_CANCEL_TEXT = '收起答案';
let editor = null;
let currentLessonIndex = 0;
let completedLessons = store.completed();
let isSoundEnabled = store.preference('sound') !== 'off';
let pendingConfirmResolve = null;
let answerPanelInitialized = false;

// Web Audio API sound generator (no external files required!)
const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
try {
  audioCtx = AudioContextCtor ? new AudioContextCtor() : null;
} catch (err) {
  console.warn('音频环境初始化失败，音效将保持静默。', err);
}

function playSound(type) {
  if (!isSoundEnabled || !audioCtx) return;
  
  // Resume AudioContext if suspended (browser security autoplay policies)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === 'success') {
    // Happy Arpeggio: C4, E4, G4, C5
    const now = audioCtx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25];
    notes.forEach((freq, index) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      o.frequency.setValueAtTime(freq, now + index * 0.1);
      g.gain.setValueAtTime(0.1, now + index * 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, now + index * 0.1 + 0.3);
      o.start(now + index * 0.1);
      o.stop(now + index * 0.1 + 0.3);
    });
  } else if (type === 'fail') {
    // Sad double buzz
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.setValueAtTime(110, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
}

// Custom Toast notification system
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✓' : '!';
  const iconEl = document.createElement('span');
  iconEl.className = 'toast-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.innerText = icon;

  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.innerText = message;

  toast.appendChild(iconEl);
  toast.appendChild(messageEl);
  
  container.replaceChildren(toast);
  
  // Play sound if applicable
  if (type === 'success') playSound('success');
  if (type === 'error') playSound('fail');

  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Particle Canvas Confetti Effect
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function createParticles() {
  particles = [];
  const colors = ['#94714D', '#D4A373', '#528062', '#E8C547', '#E0A96D', '#B5838D'];
  const compact = canvas.width <= 640;
  const count = compact ? 30 : 120;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2 - 50,
      radius: compact ? Math.random() * 2 + 2 : Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 15,
      vy: (Math.random() - 0.6) * 15 - 5,
      gravity: 0.3,
      alpha: 1,
      decay: Math.random() * 0.015 + 0.01
    });
  }
}

function animateParticles() {
  if (particles.length === 0) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.vy += p.gravity;
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;
    
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    
    if (p.alpha <= 0 || p.y > canvas.height) {
      particles.splice(i, 1);
      i--;
    }
  }
  
  if (particles.length > 0) {
    requestAnimationFrame(animateParticles);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function triggerConfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  createParticles();
  animateParticles();
}

// Console helper functions
function getConsoleTarget(target) {
  if (target && typeof target.appendChild === 'function') return target;
  if (typeof target === 'string') return document.getElementById(target);
  return document.getElementById('console-log');
}

function clearConsole(target) {
  const consoleLog = getConsoleTarget(target);
  if (consoleLog) consoleLog.innerHTML = '';
}

const pendingConsoleScroll = new WeakSet();

function appendConsole(text, type = 'output', target) {
  const consoleLog = getConsoleTarget(target);
  if (!consoleLog) return;
  if (!pendingConsoleScroll.has(consoleLog)) {
    pendingConsoleScroll.add(consoleLog);
    const atBottom = consoleLog.scrollHeight - consoleLog.clientHeight - consoleLog.scrollTop < 16;
    requestAnimationFrame(() => {
      pendingConsoleScroll.delete(consoleLog);
      if (atBottom) consoleLog.scrollTop = consoleLog.scrollHeight;
    });
  }
  const line = document.createElement('div');
  line.className = `console-line ${type}`;
  
  line.textContent = text;
  
  consoleLog.appendChild(line);
}

let activeRun = null;

function stopExecution() { activeRun?.abort(); }

function setRunControls(running) {
  for (const id of ['btn-run', 'btn-focus-run']) document.getElementById(id).hidden = running;
  document.querySelectorAll('.stop-run').forEach(button => { button.hidden = !running; });
}

async function runCode(options = {}) {
  if (activeRun || !editor) return;
  const lesson = lessons[currentLessonIndex];
  const consoleTarget = getConsoleTarget(options.consoleTarget);
  const stdin = (options.stdinInput || document.getElementById('stdin-input')).value;
  const input = {
    code: options.sourceCode ?? editor.getValue(),
    stdin: stdin === '' ? [] : stdin.replace(/\r\n/g, '\n').split('\n'),
    submit: Boolean(options.submit),
    level: lesson.level,
    lessonId: lesson.id
  };
  const buttons = ['btn-run', 'btn-focus-run', 'btn-submit', 'btn-reset-progress', 'btn-focus-code', 'btn-lock'];
  activeRun = new AbortController();
  for (const id of buttons) document.getElementById(id).disabled = true;
  setRunControls(true);
  clearConsole(consoleTarget);
  appendConsole('正在准备 Python 运行环境…', 'system', consoleTarget);
  try {
    const result = await runPython(input, {
      signal: activeRun.signal,
      onReady: () => appendConsole(input.submit ? '正在执行并验证答案…' : '正在执行代码…', 'system', consoleTarget),
      onOutput: (text, type) => appendConsole(text, type, consoleTarget)
    });
    if (result.error) throw new Error(result.error);
    if (!result.success) {
      appendConsole(result.message, 'error', consoleTarget);
      showToast(result.message, 'error');
      return;
    }
    if (input.submit) {
      if (!completedLessons.includes(lesson.id)) {
        completedLessons.push(lesson.id);
        store.saveCompleted(completedLessons);
      }
      updateUI();
      appendConsole('验证通过：' + lesson.title, 'success', consoleTarget);
      triggerConfetti();
      showSuccessModal(result.message);
    } else {
      appendConsole('执行完成，退出码 0', 'system', consoleTarget);
    }
  } catch (error) {
    appendConsole(error.message, 'error', consoleTarget);
  } finally {
    activeRun = null;
    for (const id of buttons) document.getElementById(id).disabled = false;
    setRunControls(false);
    if (consoleTarget.id === 'focus-console-log' &&
        !document.getElementById('focus-modal').classList.contains('active')) syncFocusConsoleToMain();
  }
}

// Show validation completion Modal
function showSuccessModal(message) {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-custom-text').innerText = message;
  document.querySelector('.app-container').inert = true;
  modal.classList.add('active');
  const next = document.getElementById('btn-close-modal');
  next.textContent = currentLessonIndex === lessons.length - 1 ? '完成学习' : '继续下一关';
  next.focus();
  playSound('success');
}

function hideSuccessModal() {
  const modal = document.getElementById('modal-overlay');
  document.querySelector('.app-container').inert = false;
  modal.classList.remove('active');
  playSound('click');
  
  // Auto-advance to next lesson if available
  if (currentLessonIndex < lessons.length - 1) {
    loadLesson(currentLessonIndex + 1);
    document.getElementById('lesson-detail-title').focus({ preventScroll: true });
  } else {
    document.getElementById('btn-submit').focus();
  }
}

// Course titles can include a parenthetical topic after the lesson name.
function lessonHeading(lesson) {
  const title = lesson.title.replace(/^\d+\.\s*/, '');
  const parts = title.match(/^(.+?)\s+\((.+)\)$/);
  return parts ? { name: parts[1], topic: parts[2] } : { name: title, topic: '' };
}

// Load Lesson content
function loadLesson(index) {
  if (activeRun || !lessons[index] || index > completedLessons.length) return;
  currentLessonIndex = index;
  const lesson = lessons[index];
  store.setPreference('lesson', String(lesson.id));
  document.getElementById('stdin-input').value = store.stdin(lesson.id);
  closeAnswerPanel();
  
  // Set active sidebar item
  document.querySelectorAll('.lesson-item').forEach((item, idx) => {
    item.classList.toggle('active', idx === index);
    if (idx === index) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  
  selectWorkspace('lesson');
  const chapter = document.querySelector(`.level-group[data-level="${lesson.level}"]`);
  if (chapter) {
    document.querySelectorAll('.level-group[open]').forEach(group => {
      if (group !== chapter) group.open = false;
    });
    chapter.open = true;
    if (document.getElementById('sidebar-lessons').offsetWidth) revealActiveLesson();
  }
  document.getElementById('lesson-location').textContent = chapterNames[lesson.level] + '　/　第 ' + lesson.id + ' 关';
  document.getElementById('editor-lesson-number').textContent = `第 ${lesson.id} 关`;
  const heading = document.getElementById('lesson-detail-title');
  const { name, topic } = lessonHeading(lesson);
  heading.textContent = name;
  if (topic) {
    const subtitle = document.createElement('small');
    subtitle.textContent = topic;
    heading.append(' ', subtitle);
  }
  document.getElementById('lesson-detail-body').innerHTML = marked.parse(lesson.description);
  const task = document.getElementById('task-text');
  task.replaceChildren();
  lesson.task.split(/(`[^`]+`)/g).forEach(part => {
    if (!part.startsWith('`') || !part.endsWith('`')) return task.append(part);
    const code = document.createElement('code');
    code.textContent = part.slice(1, -1);
    task.append(code);
  });
  document.getElementById('hint-content').innerText = lesson.hint;
  
  // Close hint
  document.getElementById('hint-content').classList.remove('active');
  document.getElementById('btn-hint-text').innerText = '查看提示';
  document.getElementById('btn-hint').setAttribute('aria-expanded', 'false');
  
  // Load code in Editor
  if (editor) {
    editor.setValue(store.draft(lessons[currentLessonIndex]));
  }
  
  // Scroll content panel back to top
  document.getElementById('content-panel').scrollTop = 0;
  clearConsole();
  appendConsole(`第 ${lesson.id} 关已就绪。`, "system");
}

// Generate the sidebar dynamically
const chapterNames = ['', '启程', '分支与循环', '数据结构', '函数与模块', '实战炼金',
  '工程化与调试', '数据文件处理', '命令行工具', 'Web 与 API', 'SQLite 数据库', '软件设计与测试', '综合项目'];

function revealActiveLesson() {
  const sidebar = document.getElementById('sidebar-lessons');
  const item = sidebar.querySelector('[aria-current="step"]');
  if (!item) return;
  const bounds = sidebar.getBoundingClientRect();
  const row = item.getBoundingClientRect();
  const top = bounds.top + sidebar.querySelector('h2').offsetHeight;
  if (row.top < top) sidebar.scrollTop += row.top - top;
  else if (row.bottom > bounds.bottom) sidebar.scrollTop += row.bottom - bounds.bottom;
}

function selectWorkspace(view) {
  document.querySelector('.dashboard-main').dataset.view = view;
  if (view === 'map') revealActiveLesson();
  document.querySelectorAll('.mobile-nav button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.view === view));
  });
}

function renderSidebar() {
  const sidebar = document.getElementById('chapter-list');
  sidebar.replaceChildren();
  const levelNumbers = Array.from(new Set(lessons.map(lesson => lesson.level))).sort((a, b) => a - b);

  levelNumbers.forEach((lvl) => {
    const groupLessons = lessons.filter(l => l.level === lvl);
    if (groupLessons.length === 0) return;

    const groupDiv = document.createElement('details');
    groupDiv.className = 'level-group';
    groupDiv.dataset.level = lvl;
    
    const groupTitle = document.createElement('summary');
    groupTitle.className = 'level-group-title';
    groupTitle.innerHTML = `<small>${String(lvl).padStart(2, '0')}</small><span>${chapterNames[lvl] || `阶段 ${lvl}`}</span>`;
    groupDiv.appendChild(groupTitle);
    
    const ul = document.createElement('ul');
    ul.className = 'lesson-list';

    groupLessons.forEach((lesson) => {
      const row = document.createElement('li');
      const li = document.createElement('button');
      li.type = 'button';
      li.className = 'lesson-item';
      const title = document.createElement('span');
      const { name, topic } = lessonHeading(lesson);
      title.textContent = name;
      if (topic) {
        const detail = document.createElement('small');
        detail.textContent = topic;
        title.append(detail);
      }
      li.title = lesson.title;
      const status = document.createElement('span');
      status.className = 'lesson-status';
      status.setAttribute('aria-hidden', 'true');
      li.append(title, status);
      li.addEventListener('click', () => {
        if (activeRun) return;
        if (lesson.id === lessons[currentLessonIndex].id) { selectWorkspace('lesson'); return; }
        playSound('click');
        loadLesson(lesson.id - 1);
      });
      row.appendChild(li);
      ul.appendChild(row);
    });
    
    groupDiv.appendChild(ul);
    sidebar.appendChild(groupDiv);
  });
}

// Refresh overall progress values
function updateUI() {

  if (!document.querySelector('.lesson-item')) renderSidebar();
  document.querySelectorAll('.lesson-item').forEach((button, index) => {
    const completed = index < completedLessons.length;
    button.disabled = index > completedLessons.length;
    button.classList.toggle('locked', button.disabled);
    button.classList.toggle('completed', completed);
    const state = completed ? '已通关' : button.disabled ? '未解锁' : '可练习';
    button.setAttribute('aria-label', lessons[index].title + '，' + state);
  });
  
  // Calculate percentage
  const total = lessons.length;
  const completed = completedLessons.length;
  const percent = Math.round((completed / total) * 100);
  
  document.getElementById('progress-bar').style.width = `${percent}%`;
  document.getElementById('progress-pct').innerText = `${percent}%`;
  document.getElementById('progress-header-label').innerText = `已通关 ${completed} / ${total}`;
}

// Reset all levels progress
async function resetProgress() {
  const confirmed = await showConfirmDialog({
    icon: '🔄',
    title: '重置学习进度',
    message: '确定要清空所有已通关记录吗？这个操作无法恢复。',
    confirmText: '重置进度',
    trigger: document.getElementById('btn-reset-progress'),
    danger: true
  });

  if (confirmed) {
    completedLessons = [];
    store.saveCompleted([]);
    playSound('fail');
    showToast("进度已被完全重置！", 'error');
    updateUI();
    loadLesson(0);
  }
}

function showConfirmDialog({ trigger, icon = '⚠️', title, message, confirmText = '确认', cancelText = '取消', danger = false }) {
  const overlay = document.getElementById('confirm-modal-overlay');
  const iconEl = document.getElementById('confirm-modal-icon');
  const titleEl = document.getElementById('confirm-modal-title');
  const textEl = document.getElementById('confirm-modal-text');
  const acceptBtn = document.getElementById('btn-confirm-accept');
  const cancelBtn = document.getElementById('btn-confirm-cancel');

  if (!overlay || !iconEl || !titleEl || !textEl || !acceptBtn || !cancelBtn) {
    return Promise.resolve(false);
  }

  iconEl.innerText = icon;
  titleEl.innerText = title;
  textEl.innerText = message;
  acceptBtn.innerText = confirmText;
  cancelBtn.innerText = cancelText;
  acceptBtn.classList.toggle('btn-danger', danger);
  acceptBtn.classList.toggle('btn-primary', !danger);

  document.querySelector('.app-container').inert = true;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  cancelBtn.focus();

  return new Promise((resolve) => {
    pendingConfirmResolve = result => {
      trigger.focus();
      resolve(result);
    };
  });
}

function closeConfirmDialog(result) {
  const overlay = document.getElementById('confirm-modal-overlay');
  if (overlay) {
    document.querySelector('.app-container').inert = false;
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }

  if (pendingConfirmResolve) {
    pendingConfirmResolve(result);
    pendingConfirmResolve = null;
  }
}

function syncAnswerPanelBounds() {
  const sidebar = document.getElementById('sidebar-lessons');
  const workspace = document.querySelector('.workspace-panel');
  const panel = document.getElementById('answer-panel');

  if (!sidebar || !workspace || !panel) return;

  const sidebarRect = sidebar.getBoundingClientRect();
  const workspaceRect = workspace.getBoundingClientRect();

  const left = sidebarRect.left;
  if (window.innerWidth <= 1024) {
    panel.style.cssText = '';
    return;
  }
  const top = sidebarRect.top;
  const bottom = sidebarRect.bottom;

  panel.style.left = `${left}px`;
  panel.style.width = `${workspaceRect.left - 10 - left}px`;
  panel.style.top = `${top}px`;
  panel.style.height = `${bottom - top}px`;
}

function updateAnswerButton(isOpen) {
  const btn = document.getElementById('btn-reveal-solution');
  if (!btn) return;
  btn.innerText = isOpen ? ANSWER_BUTTON_CANCEL_TEXT : ANSWER_BUTTON_READY_TEXT;
  btn.classList.toggle('active', isOpen);
  btn.setAttribute('aria-expanded', String(isOpen));
}

function closeAnswerPanel() {
  const panel = document.getElementById('answer-panel');
  if (!panel) return;
  panel.classList.remove('active', 'dragging', 'resizing');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('answer-panel-moving');
  updateAnswerButton(false);
}

function openAnswerPanel() {
  const panel = document.getElementById('answer-panel');
  const codeView = document.getElementById('answer-code-view');
  const titleText = document.getElementById('answer-panel-title-text');
  if (!panel || !codeView || !titleText) return;

  const lesson = lessons[currentLessonIndex];
  titleText.textContent = `第 ${lesson.id} 关 · 参考答案`;
  codeView.textContent = lesson.solution;
  panel.classList.add('active');
  panel.setAttribute('aria-hidden', 'false');
  syncAnswerPanelBounds();
  updateAnswerButton(true);
  playSound('click');
}

// Toggle readonly floating answer viewer
function revealSolution() {
  const panel = document.getElementById('answer-panel');
  if (panel && panel.classList.contains('active')) {
    closeAnswerPanel();
    playSound('click');
  } else {
    openAnswerPanel();
  }
}

function initAnswerPanelControls() {
  if (answerPanelInitialized) return;
  const panel = document.getElementById('answer-panel');
  const closeBtn = document.getElementById('btn-answer-panel-close');
  if (!panel || !closeBtn) return;

  answerPanelInitialized = true;

  closeBtn.addEventListener('click', () => {
    closeAnswerPanel();
    document.getElementById('btn-reveal-solution').focus();
    playSound('click');
  });

  window.addEventListener('resize', () => {
    if (panel.classList.contains('active')) {
      syncAnswerPanelBounds();
    }
  });
}

function getEditorValue() {
  return editor && typeof editor.getValue === 'function' ? editor.getValue() : '';
}

function setEditorValue(value) {
  if (editor && editor.getValue() !== value) {
    editor.setValue(value);
    store.saveDraft(lessons[currentLessonIndex], value);
  }
}

function syncFocusToMain() {
  const focusEditor = document.getElementById('focus-code-editor');
  const focusStdin = document.getElementById('focus-stdin-input');
  const mainStdin = document.getElementById('stdin-input');
  if (focusEditor) setEditorValue(focusEditor.value);
  if (focusStdin && mainStdin) {
    mainStdin.value = focusStdin.value;
    store.saveStdin(lessons[currentLessonIndex].id, focusStdin.value);
  }
}

function syncFocusConsoleToMain() {
  const focusConsole = document.getElementById('focus-console-log');
  const mainConsole = document.getElementById('console-log');
  if (!focusConsole || !mainConsole || !focusConsole.childElementCount) return;
  mainConsole.innerHTML = focusConsole.innerHTML;
  mainConsole.scrollTop = mainConsole.scrollHeight;
}

function openFocusMode() {
  const modal = document.getElementById('focus-modal');
  const focusEditor = document.getElementById('focus-code-editor');
  const focusStdin = document.getElementById('focus-stdin-input');
  const mainStdin = document.getElementById('stdin-input');
  const focusConsole = document.getElementById('focus-console-log');
  if (!modal || !focusEditor || !focusStdin || !focusConsole) return;

  if (activeRun) return;
  closeAnswerPanel();
  const lesson = lessons[currentLessonIndex];
  document.getElementById('focus-lesson-name').textContent = `第 ${lesson.id} 关 · ${lessonHeading(lesson).name}`;
  focusEditor.value = getEditorValue();
  focusStdin.value = mainStdin ? mainStdin.value : '';
  focusConsole.innerHTML = document.getElementById('console-log').innerHTML;
  document.querySelector('.app-container').inert = true;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('focus-mode-open');
  playSound('click');
  focusEditor.focus();
  focusConsole.scrollTop = focusConsole.scrollHeight;
}

function closeFocusMode() {
  const modal = document.getElementById('focus-modal');
  if (!modal) return;
  syncFocusToMain();
  syncFocusConsoleToMain();
  document.querySelector('.app-container').inert = false;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('focus-mode-open');
  document.getElementById('btn-focus-code').focus();
  playSound('click');
}

async function runFocusCode() {
  const focusEditor = document.getElementById('focus-code-editor');
  const focusStdin = document.getElementById('focus-stdin-input');
  const focusConsole = document.getElementById('focus-console-log');
  if (!focusEditor || !focusConsole) return;

  syncFocusToMain();
  await runCode({
    sourceCode: focusEditor.value,
    consoleTarget: focusConsole,
    stdinInput: focusStdin
  });
}

function insertTextAtSelection(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  textarea.selectionStart = start + text.length;
  textarea.selectionEnd = start + text.length;
}

function bindFocusEditorShortcuts() {
  const focusEditor = document.getElementById('focus-code-editor');
  if (!focusEditor) return;

  focusEditor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      insertTextAtSelection(focusEditor, '    ');
      store.saveDraft(lessons[currentLessonIndex], focusEditor.value);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runFocusCode();
    }
  });
}

// Toggle sound control
function toggleSound() {
  isSoundEnabled = !isSoundEnabled;
  store.setPreference('sound', isSoundEnabled ? 'on' : 'off');
  const btn = document.getElementById('btn-sound');
  btn.setAttribute('aria-pressed', String(isSoundEnabled));
  if (isSoundEnabled) {
    btn.classList.remove('active');
    showToast("音效已开启", 'success');
  } else {
    btn.classList.add('active');
  }
}

function bindRunButtonLayout() {
  const phone = window.matchMedia('(max-width: 640px)');
  const toolbar = document.querySelector('.editor-actions');
  const footer = document.querySelector('.submit-action-row');
  const run = document.getElementById('btn-run');
  const stop = toolbar.querySelector('.stop-run');
  function arrange() {
    const focused = document.activeElement;
    if (phone.matches) footer.prepend(run, stop);
    else toolbar.append(run, stop);
    if (focused === run || focused === stop) focused.focus({ preventScroll: true });
  }
  arrange();
  phone.addEventListener('change', arrange);
}

// The on-screen keyboard can shrink and pan the visual viewport while the layout viewport stays tall.
function bindEditingViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const body = document.body;
  const narrow = window.matchMedia('(max-width: 1024px)');
  let frame = 0;

  function update() {
    frame = 0;
    const focused = document.activeElement;
    const inEditor = focused?.closest('#coding-panel, #focus-modal') &&
      (focused.matches('textarea, input') || focused.isContentEditable);
    const editing = inEditor || body.classList.contains('editing-viewport');
    const codeVisible = document.querySelector('.dashboard-main').dataset.view === 'code' ||
      body.classList.contains('focus-mode-open');
    const active = narrow.matches && editing && codeVisible && viewport.scale === 1 &&
      document.documentElement.clientHeight - viewport.height > 100;
    body.classList.toggle('editing-viewport', Boolean(active));
    if (active) {
      body.style.setProperty('--editing-height', viewport.height + 'px');
      body.style.setProperty('--editing-top', viewport.offsetTop + 'px');
    } else {
      body.style.removeProperty('--editing-height');
      body.style.removeProperty('--editing-top');
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', schedule);
  // Keep a keyboard dismissal from moving these buttons between press and click.
  document.addEventListener('mousedown', event => {
    if (body.classList.contains('editing-viewport') &&
        event.target.closest('#btn-run, #btn-submit, #btn-focus-run, .stop-run')) event.preventDefault();
  });
}

// Event Bindings on DOM load
document.addEventListener("DOMContentLoaded", async () => {
  const lockOverlay = document.getElementById('lock-overlay');
  const lockInput = document.getElementById('lock-password-input');
  const lockError = document.getElementById('lock-error-msg');
  const lockBtnHeader = document.getElementById('btn-lock');

  function checkLockStatus() {
    const isUnlocked = store.preference('unlocked') === 'true';
    document.querySelector('.app-container').inert = !isUnlocked;
    if (isUnlocked) {
      if (lockOverlay) lockOverlay.classList.add('hidden');
    } else {
      if (lockOverlay) lockOverlay.classList.remove('hidden');
      if (lockInput) {
        setTimeout(() => lockInput.focus(), 100);
      }
    }
  }

  function handleUnlock() {
    if (!lockInput) return;
    const value = lockInput.value.trim().toUpperCase();
    if (value === 'YYS') {
      store.setPreference('unlocked', 'true');
      document.querySelector('.app-container').inert = false;
      if (lockOverlay) lockOverlay.classList.add('hidden');
      lockInput.removeAttribute('aria-invalid');
      if (lockError) lockError.style.display = 'none';
      const mobileTab = document.querySelector('.mobile-nav [aria-pressed="true"]');
      const target = mobileTab.offsetWidth ? mobileTab : document.getElementById('lesson-detail-title');
      target.focus();
      try {
        playSound('success');
        triggerConfetti();
      } catch (soundErr) {
        console.warn(soundErr);
      }
      showToast("修炼手册已解锁，生日快乐！", 'success');
    } else {
      try {
        playSound('fail');
      } catch (soundErr) {
        console.warn(soundErr);
      }
      if (lockError) {
        lockError.style.display = 'block';
      }
      lockInput.setAttribute('aria-invalid', 'true');
      lockInput.select();
      lockInput.focus();
    }
  }

  document.getElementById('unlock-form').addEventListener('submit', event => {
    event.preventDefault();
    handleUnlock();
  });

  if (lockBtnHeader) {
    lockBtnHeader.addEventListener('click', async () => {
      const confirmed = await showConfirmDialog({
        icon: '🔐',
        title: '锁定修炼场',
        message: '锁定后需要重新输入暗号才能进入。',
        trigger: lockBtnHeader,
        confirmText: '重新锁定'
      });

      if (confirmed) {
        store.setPreference('unlocked', null);
        window.location.reload();
      }
    });
  }

  document.querySelectorAll('.mobile-nav button').forEach(button => {
    button.addEventListener('click', () => {
      closeAnswerPanel();
      selectWorkspace(button.dataset.view);
    });
  });
  checkLockStatus();
  const soundButton = document.getElementById('btn-sound');
  soundButton.classList.toggle('active', !isSoundEnabled);
  soundButton.setAttribute('aria-pressed', String(isSoundEnabled));
  document.getElementById('focus-code-editor').addEventListener('input', event => store.saveDraft(lessons[currentLessonIndex], event.target.value));
  for (const id of ['stdin-input', 'focus-stdin-input']) {
    document.getElementById(id).addEventListener('input', event => store.saveStdin(lessons[currentLessonIndex].id, event.target.value));
  }
  initAnswerPanelControls();
  bindFocusEditorShortcuts();
  bindRunButtonLayout();
  bindEditingViewport();

  // Theme toggle button action
  const btnTheme = document.getElementById('btn-theme');
  
  function updateThemeButtonState() {
    if (!btnTheme) return;
    const isDark = document.body.classList.contains('dark-mode');
    btnTheme.title = isDark ? '切换浅色主题' : '切换深色主题';
    btnTheme.classList.toggle('active', isDark);
    btnTheme.setAttribute('aria-pressed', String(isDark));
  }
  
  // Initialize theme button icon based on current state
  updateThemeButtonState();
  
  if (btnTheme) {
    btnTheme.addEventListener('click', () => {
      playSound('click');
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      store.setPreference('theme', isDark ? 'dark' : 'light');
      updateThemeButtonState();
      
      editor?.refreshTheme();
      
      showToast(isDark ? '已切换至深色主题' : '已切换至浅色主题', 'success');
    });
  }

  // Action listeners
  document.getElementById('btn-run').addEventListener('click', () => runCode());
  document.getElementById('btn-submit').addEventListener('click', () => runCode({ submit: true }));
  document.getElementById('btn-focus-code').addEventListener('click', openFocusMode);
  document.getElementById('btn-focus-run').addEventListener('click', runFocusCode);
  document.getElementById('btn-focus-close').addEventListener('click', closeFocusMode);
  document.getElementById('btn-reveal-solution').addEventListener('click', revealSolution);
  document.getElementById('btn-close-modal').addEventListener('click', hideSuccessModal);
  document.getElementById('btn-reset-progress').addEventListener('click', resetProgress);
  document.getElementById('btn-sound').addEventListener('click', toggleSound);
  document.getElementById('btn-clear-console').addEventListener('click', clearConsole);
  document.getElementById('btn-clear-stdin').addEventListener('click', () => {
    const stdinInput = document.getElementById('stdin-input');
    if (stdinInput) stdinInput.value = '';
    store.saveStdin(lessons[currentLessonIndex].id, '');
  });

  const confirmOverlay = document.getElementById('confirm-modal-overlay');
  const confirmAccept = document.getElementById('btn-confirm-accept');
  const confirmCancel = document.getElementById('btn-confirm-cancel');

  if (confirmAccept) {
    confirmAccept.addEventListener('click', () => closeConfirmDialog(true));
  }

  if (confirmCancel) {
    confirmCancel.addEventListener('click', () => closeConfirmDialog(false));
  }

  if (confirmOverlay) {
    confirmOverlay.addEventListener('click', (event) => {
      if (event.target === confirmOverlay) {
        closeConfirmDialog(false);
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && pendingConfirmResolve) {
      closeConfirmDialog(false);
    } else if (event.key === 'Escape' && document.getElementById('answer-panel').classList.contains('active')) {
      closeAnswerPanel();
      document.getElementById('btn-reveal-solution').focus();
    } else if (event.key === 'Escape') {
      const focusModal = document.getElementById('focus-modal');
      if (focusModal && focusModal.classList.contains('active')) {
        closeFocusMode();
      }
    }
  });

  const focusModal = document.getElementById('focus-modal');
  if (focusModal) {
    focusModal.addEventListener('click', (event) => {
      if (event.target === focusModal) {
        closeFocusMode();
      }
    });
  }

  // Toggle Hint content visibility
  document.getElementById('btn-hint').addEventListener('click', () => {
    playSound('click');
    const content = document.getElementById('hint-content');
    const text = document.getElementById('btn-hint-text');
    const isActive = content.classList.contains('active');
    document.getElementById('btn-hint').setAttribute('aria-expanded', String(!isActive));
    
    if (isActive) {
      content.classList.remove('active');
      text.innerText = '查看提示';
    } else {
      content.classList.add('active');
      text.innerText = '隐藏提示';
    }
  });

  marked.use({ breaks: true, gfm: true });
  updateUI();
  const firstIncomplete = lessons.findIndex(lesson => !completedLessons.includes(lesson.id));
  const savedIndex = Number(store.preference('lesson')) - 1;
  const resume = lessons[savedIndex] && savedIndex <= completedLessons.length;
  loadLesson(resume ? savedIndex : (firstIncomplete < 0 ? lessons.length - 1 : firstIncomplete));
  editor = createCodeEditor(document.getElementById('monaco-editor-body'), {
    value: store.draft(lessons[currentLessonIndex]),
    onEdit: text => store.saveDraft(lessons[currentLessonIndex], text),
    onRun: () => runCode()
  });
  document.querySelectorAll('.stop-run').forEach(button => button.addEventListener('click', stopExecution));
});
