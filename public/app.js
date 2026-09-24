'use strict';

(() => {
  const MAX_DIGITS = 10;
  const SYMBOLS = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
  const KEY_TO_OP = { '+': 'add', '-': 'subtract', '*': 'multiply', 'x': 'multiply', '/': 'divide' };
  const ERROR_TEXT = {
    LIMIT_OVER: ['Limit Over', 'Result is more than 10 digits'],
    DIVIDE_BY_ZERO: ["Can't ÷ 0", 'Division by zero is undefined'],
  };

  const els = {
    display: document.getElementById('display'),
    value: document.getElementById('value'),
    expression: document.getElementById('expression'),
    notice: document.getElementById('notice'),
    meter: document.getElementById('digitMeter'),
    keys: document.getElementById('keys'),
    historyList: document.getElementById('historyList'),
    historyEmpty: document.getElementById('historyEmpty'),
    historyClear: document.getElementById('historyClear'),
  };

  const state = {
    current: '0',       // number being typed / shown
    stored: null,       // left operand
    op: null,           // pending operation
    waiting: false,     // next digit starts a fresh number
    error: null,        // error code while an error is shown
    expression: '',
    busy: false,
  };

  const history = [];

  const digitCount = (s) => s.replace(/[^0-9]/g, '').length;
  const pretty = (s) => s.replace(/^-/, '−');

  // ---------- Backend ----------

  async function compute(a, b, operation) {
    const res = await fetch('/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a, b, operation }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'SERVER_ERROR', message: 'Bad server response' }));
    return data;
  }

  // ---------- Rendering ----------

  function render(notice = '') {
    const { display, value, expression, meter } = els;

    display.classList.toggle('error', Boolean(state.error));
    if (state.error) {
      const [title, detail] = ERROR_TEXT[state.error] || ['Error', 'Something went wrong'];
      value.textContent = title;
      els.notice.textContent = detail;
    } else {
      value.textContent = pretty(state.current);
      els.notice.textContent = notice;
    }
    expression.innerHTML = state.expression ? escapeHtml(state.expression) : '&nbsp;';

    const len = value.textContent.length;
    value.classList.toggle('small', len > 9 && len <= 11);
    value.classList.toggle('tiny', len > 11);

    const used = state.error ? 0 : digitCount(state.current);
    meter.textContent = `${used}/${MAX_DIGITS}`;
    meter.classList.toggle('full', used >= MAX_DIGITS);

    els.keys.querySelectorAll('.key-op').forEach((k) => {
      k.classList.toggle('active', state.waiting && k.dataset.op === state.op);
    });
  }

  function renderHistory() {
    els.historyList.innerHTML = '';
    history.forEach((entry) => {
      const li = document.createElement('li');
      li.className = 'history-item' + (entry.error ? ' is-error' : '');
      li.innerHTML = `<div class="h-expr">${escapeHtml(entry.expr)}</div><div class="h-result">${escapeHtml(entry.display)}</div>`;
      if (!entry.error) {
        li.title = 'Use this result';
        li.addEventListener('click', () => {
          resetAll();
          state.current = entry.result;
          state.waiting = true;
          render('Loaded from history');
        });
      }
      els.historyList.appendChild(li);
    });
    els.historyEmpty.hidden = history.length > 0;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function shake(message) {
    els.display.classList.remove('shake');
    void els.display.offsetWidth; // restart animation
    els.display.classList.add('shake');
    render(message);
  }

  // ---------- Input handling ----------

  function resetAll() {
    Object.assign(state, { current: '0', stored: null, op: null, waiting: false, error: null, expression: '' });
  }

  function clearErrorIfAny() {
    if (state.error) resetAll();
  }

  // Begin a new number. After "=" there is no pending op, so the old expression goes too.
  function startFresh(value) {
    state.current = value;
    state.waiting = false;
    if (!state.op) state.expression = '';
  }

  function inputDigit(d) {
    clearErrorIfAny();
    if (state.waiting) {
      startFresh(d);
    } else if (digitCount(state.current) >= MAX_DIGITS) {
      return shake('Max 10 digits per number');
    } else {
      state.current = state.current === '0' ? d : state.current === '-0' ? '-' + d : state.current + d;
    }
    render();
  }

  function inputDecimal() {
    clearErrorIfAny();
    if (state.waiting) {
      startFresh('0.');
    } else if (!state.current.includes('.')) {
      if (digitCount(state.current) >= MAX_DIGITS) return shake('Max 10 digits per number');
      state.current += '.';
    }
    render();
  }

  function backspace() {
    if (state.error) { resetAll(); return render(); }
    if (state.waiting) return;
    state.current = state.current.slice(0, -1);
    if (state.current === '' || state.current === '-') state.current = '0';
    render();
  }

  function toggleSign() {
    clearErrorIfAny();
    if (state.waiting) {
      // Right after an operator, ± starts a new negative number instead of flipping the old one.
      startFresh('-0');
      return render();
    }
    if (state.current === '0' || state.current === '0.') return render();
    state.current = state.current.startsWith('-') ? state.current.slice(1) : '-' + state.current;
    render();
  }

  // Normalise things like "12." before sending to the backend.
  const clean = (s) => s.replace(/\.$/, '');

  async function runPending() {
    const a = state.stored;
    const b = clean(state.current);
    const expr = `${pretty(a)} ${SYMBOLS[state.op]} ${pretty(b)}`;
    state.busy = true;
    let data;
    try {
      data = await compute(a, b, state.op);
    } catch {
      data = { ok: false, error: 'NETWORK', message: 'Cannot reach the server' };
    } finally {
      state.busy = false;
    }

    if (data.ok) {
      history.unshift({ expr: `${expr} =`, result: data.result, display: pretty(data.result) });
    } else {
      if (!ERROR_TEXT[data.error]) ERROR_TEXT[data.error] = ['Error', data.message || 'Something went wrong'];
      history.unshift({ expr: `${expr} =`, error: true, display: ERROR_TEXT[data.error][0] });
    }
    if (history.length > 50) history.pop();
    renderHistory();
    return { data, expr };
  }

  async function chooseOperator(op) {
    if (state.busy) return;
    clearErrorIfAny();

    if (state.op && !state.waiting) {
      const { data } = await runPending();
      if (!data.ok) return showError(data.error, '');
      state.current = data.result;
    }
    state.stored = clean(state.current);
    state.current = state.stored;
    state.op = op;
    state.waiting = true;
    state.expression = `${pretty(state.stored)} ${SYMBOLS[op]}`;
    render();
  }

  async function equals() {
    if (state.busy || state.error || !state.op) return;
    const { data, expr } = await runPending();
    if (!data.ok) return showError(data.error, `${expr} =`);
    state.expression = `${expr} =`;
    state.current = data.result;
    state.stored = null;
    state.op = null;
    state.waiting = true;
    render();
  }

  function showError(code, expr) {
    resetAll();
    state.error = code;
    state.expression = expr;
    render();
  }

  function handle(action) {
    if (state.busy) return; // ignore input while a calculation is in flight
    switch (action.type) {
      case 'digit': return inputDigit(action.value);
      case 'op': return chooseOperator(action.value);
      case 'decimal': return inputDecimal();
      case 'equals': return equals();
      case 'clear': resetAll(); return render();
      case 'backspace': return backspace();
      case 'sign': return toggleSign();
    }
  }

  function actionFromButton(btn) {
    if (btn.dataset.digit) return { type: 'digit', value: btn.dataset.digit };
    if (btn.dataset.op) return { type: 'op', value: btn.dataset.op };
    return { type: btn.dataset.action };
  }

  els.keys.addEventListener('click', (e) => {
    const btn = e.target.closest('.key');
    if (btn) handle(actionFromButton(btn));
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let selector = null;
    let action = null;
    const k = e.key;

    if (/^[0-9]$/.test(k)) { action = { type: 'digit', value: k }; selector = `[data-digit="${k}"]`; }
    else if (KEY_TO_OP[k]) { action = { type: 'op', value: KEY_TO_OP[k] }; selector = `[data-op="${KEY_TO_OP[k]}"]`; }
    else if (k === '.' || k === ',') { action = { type: 'decimal' }; selector = '[data-action="decimal"]'; }
    else if (k === 'Enter' || k === '=') { action = { type: 'equals' }; selector = '[data-action="equals"]'; }
    else if (k === 'Backspace') { action = { type: 'backspace' }; selector = '[data-action="backspace"]'; }
    else if (k === 'Escape' || k === 'Delete') { action = { type: 'clear' }; selector = '[data-action="clear"]'; }
    else if (k === 'F9') { action = { type: 'sign' }; selector = '[data-action="sign"]'; }

    if (!action) return;
    e.preventDefault();
    const btn = els.keys.querySelector(selector);
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 110);
    }
    handle(action);
  });

  els.historyClear.addEventListener('click', () => {
    history.length = 0;
    renderHistory();
  });

  render();
  renderHistory();
})();
