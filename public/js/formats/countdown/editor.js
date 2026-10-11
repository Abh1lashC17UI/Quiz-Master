/**
 * public/js/formats/countdown/editor.js
 *
 * Countdown Quiz editor.
 *
 * Structure: flat list of questions + default timer + buzzer config.
 */

const CountdownEditor = (() => {
  let quiz, folderName, callbacks;
  let root;

  // ── Mount ─────────────────────────────────────────────────────────────────────

  function mount(_root, _quiz, _folderName, _callbacks) {
    root       = _root;
    quiz       = _quiz;
    folderName = _folderName;
    callbacks  = _callbacks;

    if (!quiz.questions) quiz.questions = [];
    if (!quiz.settings)  quiz.settings  = { defaultTimerSeconds: 30 };
    if (!quiz.buzzer)    quiz.buzzer     = { required: true, embedUrl: '' };

    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  function render() {
    root.innerHTML = `
    <div class="page" style="max-width:900px;margin:0 auto;">

      <!-- Quiz name -->
      <div class="card">
        <div class="form-group" style="margin-bottom:0;">
          <label>Quiz Name</label>
          <input type="text" id="cd-name" value="${escAttr(quiz.name)}" maxlength="120">
        </div>
      </div>

      <!-- Timer settings -->
      <div class="card">
        <h2>Timer Settings</h2>
        <div class="form-group">
          <label>Default Timer (seconds)</label>
          <input type="number" id="cd-default-timer" value="${quiz.settings.defaultTimerSeconds || 30}" min="5" max="600" style="max-width:120px;">
          <div class="hint">Applied to any question that doesn't have its own timer override.</div>
        </div>
      </div>

      <!-- Buzzer embed config -->
      <div class="card">
        <h2>Buzzer Display</h2>
        <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:16px;">
          A Countdown Quiz <strong>requires a buzzer display to host</strong>.<br>
          You can save the quiz without a buzzer, but hosting will be blocked until one is configured.<br>
          The embed URL is available from the <strong>Trivia Night Buzzer</strong> terminal output.
        </p>
        <div class="form-group">
          <label>Buzzer Embed URL</label>
          <div class="input-row">
            <input type="url" id="cd-buzzer-url" value="${escAttr(quiz.buzzer.embedUrl || '')}"
                   placeholder="http://192.168.x.x:3000/embed/<displayToken>">
            <button class="btn btn-secondary btn-sm" id="cd-test-buzzer">Test Connection</button>
          </div>
          <div class="hint" id="cd-buzzer-hint">
            The buzzer app prints this URL when it starts. Look for the "Embed URL" line.
          </div>
        </div>
        <div id="cd-buzzer-status"></div>
      </div>

      <!-- Questions -->
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <h2 style="flex:1;">Questions (${(quiz.questions||[]).length})</h2>
          <button class="btn btn-primary" id="cd-add-q">+ Add Question</button>
        </div>
        <div id="cd-questions-list"></div>
      </div>

    </div>`;

    // Events
    bind('cd-name', 'input', e => { quiz.name = e.target.value; notify(); });
    bind('cd-default-timer', 'change', e => {
      quiz.settings.defaultTimerSeconds = parseInt(e.target.value) || 30;
      notify();
    });
    bind('cd-buzzer-url', 'input', e => {
      quiz.buzzer.embedUrl = e.target.value.trim();
      notify();
    });

    document.getElementById('cd-test-buzzer')?.addEventListener('click', testBuzzer);
    document.getElementById('cd-add-q')?.addEventListener('click', addQuestion);

    renderQuestions();
  }

  // ── Buzzer test ───────────────────────────────────────────────────────────────

  async function testBuzzer() {
    const url = document.getElementById('cd-buzzer-url')?.value.trim();
    const statusEl = document.getElementById('cd-buzzer-status');
    if (!url) {
      statusEl.innerHTML = `<div class="alert alert-warning">Please enter a buzzer embed URL first.</div>`;
      return;
    }

    statusEl.innerHTML = `<div class="alert alert-info"><span class="spinner"></span> Testing connection…</div>`;

    // Test the health endpoint (derived from embed URL: replace /embed/... with /api/health)
    let healthUrl;
    try {
      const parsed = new URL(url);
      healthUrl = `${parsed.protocol}//${parsed.host}/api/health`;
    } catch (e) {
      statusEl.innerHTML = `<div class="alert alert-error">Invalid URL: ${e.message}</div>`;
      return;
    }

    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        statusEl.innerHTML = `<div class="alert alert-success">✓ Buzzer server is reachable at ${healthUrl}</div>`;
      } else {
        statusEl.innerHTML = `<div class="alert alert-warning">Server responded with HTTP ${res.status}. It may not be the buzzer app.</div>`;
      }
    } catch (e) {
      statusEl.innerHTML = `<div class="alert alert-error">Cannot reach buzzer: ${e.message}<br>
        Make sure the Trivia Night Buzzer is running and the URL is correct.</div>`;
    }
  }

  // ── Questions ─────────────────────────────────────────────────────────────────

  function renderQuestions() {
    const listEl = document.getElementById('cd-questions-list');
    if (!listEl) return;
    const qs = quiz.questions || [];

    if (qs.length === 0) {
      listEl.innerHTML = `<div class="alert alert-info">No questions yet. Click "Add Question" to start.</div>`;
      return;
    }

    listEl.innerHTML = qs.map((q, qi) => questionCard(q, qi)).join('');

    // Attach handlers
    listEl.querySelectorAll('[data-cdqid]').forEach(card => {
      const qid = card.dataset.cdqid;
      const q   = qs.find(x => x.id === qid);
      if (!q) return;
      const g = sel => card.querySelector(sel);

      g('[data-field="question"]')?.addEventListener('input',     e => { q.question  = e.target.value; notify(); });
      g('[data-field="answer"]')?.addEventListener('input',       e => { q.answer    = e.target.value; notify(); });
      g('[data-field="explanation"]')?.addEventListener('input',  e => { q.explanation = e.target.value; notify(); });
      g('[data-field="hostNotes"]')?.addEventListener('input',    e => { q.hostNotes = e.target.value; notify(); });
      g('[data-field="timeLimitSeconds"]')?.addEventListener('change', e => {
        const val = e.target.value.trim();
        q.timeLimitSeconds = val === '' ? null : (parseInt(val) || null);
        notify();
      });

      g('[data-action="q-up"]')?.addEventListener('click', () => {
        const i = qs.indexOf(q);
        if (i > 0) { [qs[i-1], qs[i]] = [qs[i], qs[i-1]]; notify(); renderQuestions(); }
      });
      g('[data-action="q-down"]')?.addEventListener('click', () => {
        const i = qs.indexOf(q);
        if (i < qs.length-1) { [qs[i], qs[i+1]] = [qs[i+1], qs[i]]; notify(); renderQuestions(); }
      });
      g('[data-action="q-dup"]')?.addEventListener('click', async () => {
        const newQ = await API.newQuestion({ format: 'COUNTDOWN', ...q });
        qs.splice(qs.indexOf(q)+1, 0, newQ);
        notify(); renderQuestions();
      });
      g('[data-action="q-del"]')?.addEventListener('click', () => {
        callbacks.showModal({
          title: 'Delete Question', message: 'Delete this question?',
          confirmLabel: 'Delete', confirmClass: 'btn-danger',
          onConfirm: () => { quiz.questions = quiz.questions.filter(x => x.id !== q.id); notify(); renderQuestions(); },
        });
      });

      // Media
      g('[data-mediaupload="question"]')?.addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try { const r = await API.uploadMedia(folderName, file); q.mediaFile = r.relPath; notify(); renderQuestions(); }
        catch (err) { callbacks.showToast('Upload failed: ' + err.message, 'error'); }
      });
      g('[data-mediaupload="answer"]')?.addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try { const r = await API.uploadMedia(folderName, file); q.answerMediaFile = r.relPath; notify(); renderQuestions(); }
        catch (err) { callbacks.showToast('Upload failed: ' + err.message, 'error'); }
      });
      g('[data-mediaclear="question"]')?.addEventListener('click', () => { q.mediaFile = null; notify(); renderQuestions(); });
      g('[data-mediaclear="answer"]')?.addEventListener('click',   () => { q.answerMediaFile = null; notify(); renderQuestions(); });
    });
  }

  function questionCard(q, qi) {
    const defaultTimer = quiz.settings.defaultTimerSeconds || 30;
    const timerVal = q.timeLimitSeconds !== null && q.timeLimitSeconds !== undefined ? q.timeLimitSeconds : '';

    const qMedia = q.mediaFile
      ? `<img src="${API.mediaUrl(folderName, q.mediaFile)}" style="max-height:70px;border-radius:4px;display:block;margin-top:6px;">
         <button class="btn btn-danger btn-sm" style="margin-top:4px;" data-mediaclear="question">✕ Remove</button>`
      : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;margin-top:4px;">
           📎 Image <input type="file" data-mediaupload="question" accept="image/*" style="display:none">
         </label>`;

    const aMedia = q.answerMediaFile
      ? `<img src="${API.mediaUrl(folderName, q.answerMediaFile)}" style="max-height:70px;border-radius:4px;display:block;margin-top:6px;">
         <button class="btn btn-danger btn-sm" style="margin-top:4px;" data-mediaclear="answer">✕ Remove</button>`
      : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;margin-top:4px;">
           📎 Image <input type="file" data-mediaupload="answer" accept="image/*" style="display:none">
         </label>`;

    return `
    <div class="card" data-cdqid="${q.id}" style="margin-bottom:12px;padding:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:0.75rem;color:var(--text-muted);">Q${qi+1}</span>
        <span class="badge" style="background:var(--countdown);color:#000;">
          ⏱ ${q.timeLimitSeconds !== null && q.timeLimitSeconds !== undefined ? q.timeLimitSeconds + 's' : `${defaultTimer}s (default)`}
        </span>
        <div style="flex:1;"></div>
        <button class="btn btn-ghost btn-icon" data-action="q-up">↑</button>
        <button class="btn btn-ghost btn-icon" data-action="q-down">↓</button>
        <button class="btn btn-ghost btn-icon" data-action="q-dup">⧉</button>
        <button class="btn btn-danger btn-icon" data-action="q-del">🗑</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Question</label>
          <textarea data-field="question" rows="2">${escHtml(q.question)}</textarea>
          ${qMedia}
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Answer</label>
          <textarea data-field="answer" rows="2">${escHtml(q.answer)}</textarea>
          ${aMedia}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:120px 1fr 1fr;gap:12px;margin-top:12px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Timer Override (s)</label>
          <input type="number" data-field="timeLimitSeconds" value="${timerVal}" min="5" max="600" placeholder="${defaultTimer}">
          <div class="hint">Blank = default</div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Explanation (optional)</label>
          <input type="text" data-field="explanation" value="${escAttr(q.explanation||'')}" placeholder="Extra context after answer">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Host Notes (private)</label>
          <input type="text" data-field="hostNotes" value="${escAttr(q.hostNotes||'')}" placeholder="Notes only you see">
        </div>
      </div>
    </div>`;
  }

  async function addQuestion() {
    try {
      const q = await API.newQuestion({ format: 'COUNTDOWN', order: (quiz.questions||[]).length });
      if (!quiz.questions) quiz.questions = [];
      quiz.questions.push(q);
      notify(); renderQuestions();
      setTimeout(() => {
        const cards = document.querySelectorAll('[data-cdqid]');
        if (cards.length) cards[cards.length-1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } catch (e) { callbacks.showToast('Failed to add question: ' + e.message, 'error'); }
  }

  function notify() { callbacks.onChange(quiz); }
  function bind(id, event, fn) { const el = document.getElementById(id); if (el) el.addEventListener(event, fn); }
  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escAttr(s) { return escHtml(s); }

  function unmount() {}
  return { mount, unmount };
})();
