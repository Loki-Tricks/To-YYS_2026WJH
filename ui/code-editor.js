function createCodeEditor(host, { value, onEdit, onRun }) {
  const field = document.createElement('textarea');
  field.className = 'fallback-code-editor';
  field.spellcheck = false;
  field.value = value;
  field.setAttribute('aria-label', 'Python 代码编辑器');
  field.addEventListener('input', () => onEdit(field.value));
  field.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onRun();
    }
  });
  host.replaceChildren(field);
  let enhanced;
  function defineCourseTheme() {
    const dark = document.body.classList.contains('dark-mode');
    const name = dark ? 'course-dark' : 'course-light';
    const palette = getComputedStyle(document.body);
    const color = token => palette.getPropertyValue('--' + token).trim();
    const syntax = (token, shade, fontStyle = '') => ({
      token, foreground: color(shade).slice(1), fontStyle
    });
    monaco.editor.defineTheme(name, {
      base: dark ? 'vs-dark' : 'vs',
      inherit: true,
      rules: [
        syntax('keyword', 'primary', 'bold'),
        syntax('string', 'code-string'),
        syntax('number', 'code-number'),
        syntax('comment', 'muted', 'italic'),
        syntax('delimiter', 'muted')
      ],
      colors: {
        'editor.background': color('surface'),
        'editor.foreground': color('ink'),
        'editor.lineHighlightBackground': color('soft'),
        'editor.lineHighlightBorder': '#00000000',
        'editorLineNumber.foreground': color('muted'),
        'editorLineNumber.activeForeground': color('primary'),
        'editor.selectionBackground': color('selection'),
        'editorCursor.foreground': color('primary'),
        'editorBracketHighlight.foreground1': color('primary'),
        'editorBracketHighlight.foreground2': color('code-number'),
        'editorBracketHighlight.foreground3': color('code-string')
      }
    });
    return name;
  }

  function upgrade() {
    const focused = document.activeElement === field;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    try {
      field.remove();
      enhanced = monaco.editor.create(host, {
        value: field.value, language: 'python', theme: defineCourseTheme(), automaticLayout: true,
        fontSize: 15, lineHeight: 25, fontFamily: "Menlo, Consolas, monospace",
        minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbersMinChars: 2,
        padding: { top: 16, bottom: 12 }, ariaLabel: 'Python 代码编辑器'
      });
      enhanced.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
      enhanced.onDidChangeModelContent(() => onEdit(enhanced.getValue()));
      if (focused) {
        const model = enhanced.getModel();
        enhanced.setSelection(monaco.Range.fromPositions(model.getPositionAt(start), model.getPositionAt(end)));
        enhanced.focus();
      }
    } catch (error) {
      enhanced?.dispose();
      enhanced = null;
      host.replaceChildren(field);
      console.warn('继续使用基础编辑器。', error);
    }
  }
  if (typeof require === 'function') {
    try {
      require.config({ paths: { vs: 'vendor/monaco/vs' } });
      require(['vs/editor/editor.main'], upgrade, error => console.warn('继续使用基础编辑器。', error));
    } catch (error) { console.warn('继续使用基础编辑器。', error); }
  }
  return {
    getValue: () => enhanced ? enhanced.getValue() : field.value,
    setValue(text) {
      if (enhanced) enhanced.setValue(text);
      else field.value = text;
    },
    refreshTheme() { if (enhanced) monaco.editor.setTheme(defineCourseTheme()); }
  };
}
