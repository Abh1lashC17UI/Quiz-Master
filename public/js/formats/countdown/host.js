/**
 * public/js/formats/countdown/host.js
 *
 * Countdown Quiz host interface.
 *
 * Architecture note:
 *   - The buzzer embed (iframe) is DISPLAY ONLY.
 *   - QuizMaster owns question progression; the iframe shows what the buzzer
 *     is currently displaying (timer, team answers) independently.
 *   - Future integration will use WebSocket to send SET_QUESTION / START_QUESTION
 *     to the buzzer programmatically. That seam is clearly marked below.
 *   - Live session state is separate from quiz.json.
 */

const CountdownHost = (() => {
  let quiz, folderName, ctx, root;
  let session = { currentQuestionIndex: 0, answeredQuestions: [] };
  let view = 'QUESTION'; // 'QUESTION' | 'ANSWER'
  let activeIndex = 0;

  // ── Mount ─────────────────────────────────────────────────────────────────────

  async function mount(_root, _quiz, _folderName, _ctx) {
    root       = _root;
    quiz       = _quiz;
    folderName = _folderName;
    ctx        = _ctx;

    // Load session
    try {
      session = await API.getHostSession(quiz.id);
    } catch (e) {
      session = { currentQuestionIndex: 0, answeredQuestions: [] };
    }

    activeIndex = session.currentQuestionIndex || 0;
    view = 'QUESTION';
    render();
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  function render() {
    const qs = quiz.questions || [];
    if (qs.length === 0) {
      root.innerHTML = `<div class="page"><div class="alert alert-error">No questions in this quiz.</div></div>`;
      return;
    }

    if (activeIndex >= qs.length) activeIndex = qs.length - 1;
    if (activeIndex < 0) activeIndex = 0;

    const q = qs[activeIndex];
    const defaultTimer = (quiz.settings && quiz.settings.defaultTimerSeconds) || 30;
    const timerSecs = (q.timeLimitSeconds !== null && q.timeLimitSeconds !== undefined)
      ? q.timeLimitSeconds : defaultTimer;

    const buzzerUrl = quiz.buzzer && quiz.buzzer.embedUrl;
    const hasBuzzer = !!(buzzerUrl && buzzerUrl.trim());

    // Question list nav pills
    const navPills = qs.map((qItem, i) => {
      const answered = session.answeredQuestions && session.answeredQuestions.includes(qItem.id);
      const active   = i === activeIndex;
      return `<button class="btn btn-sm ${active ? 'btn-primary' : answered ? 'btn-success' : 'btn-ghost'}"
              data-qi="${i}" style="min-width:36px;">${i+1}</button>`;
    }).join('');

    const mediaHtml = q.mediaFile
      ? `<div class="question-media"><img src="${API.mediaUrl(folderName, q.mediaFile)}" alt="Question media"></div>`
      : '';
    const aMediaHtml = q.answerMediaFile
      ? `<div class="question-media"><img src="${API.mediaUrl(folderName, q.answerMediaFile)}" alt="Answer media" style="max-height:240px;"></div>`
      : '';

    const answerSection = view === 'ANSWER'
      ? `<div class="answer-text">${escHtml(q.answer)}</div>
         ${q.explanation ? `<div style="color:var(--text-muted);font-size:0.9rem;margin-top:-8px;margin-bottom:16px;">${escHtml(q.explanation)}</div>` : ''}
         ${aMediaHtml}
         ${q.hostNotes ? `<div class="alert alert-info" style="text-align:left;">📝 ${escHtml(q.hostNotes)}</div>` : ''}`
      : '';

    const actionBtn = view === 'ANSWER'
      ? `<div class="btn-group" style="justify-content:center;">
           <button class="btn btn-success btn-lg" id="cd-next">
             ${activeIndex < qs.length - 1 ? '→ Next Question' : '✓ Finish Quiz'}
           </button>
         </div>`
      : `<div class="btn-group" style="justify-content:center;">
           <button class="btn btn-primary btn-lg" id="cd-reveal">Reveal Answer</button>
           ${q.hostNotes ? `<div class="alert alert-info" style="text-align:left;">📝 ${escHtml(q.hostNotes)}</div>` : ''}
         </div>`;

    const buzzerPanel = hasBuzzer
      ? `<div class="countdown-buzzer-panel">
           <div style="padding:12px;border-bottom:1px solid var(--border);font-size:0.8rem;color:var(--text-muted);">
             BUZZER DISPLAY
             <div style="font-size:0.7rem;margin-top:2px;word-break:break-all;">${escHtml(buzzerUrl)}</div>
           </div>
           <div class="buzzer-iframe-container">
             <iframe src="${escAttr(buzzerUrl)}" sandbox="allow-scripts allow-same-origin" allowfullscreen></iframe>
           </div>
           <div style="padding:12px;border-top:1px solid var(--border);">
             <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">
               ⚠ The buzzer runs independently. Use the Buzzer app's host panel to start/stop the timer.<br>
               <em>Future versions will synchronise automatically.</em>
             </div>
             <div style="font-size:0.8rem;color:var(--accent2);">
               ⏱ This question: <strong>${timerSecs}s</strong>
             </div>
           </div>
         </div>`
      : '';

    root.innerHTML = `
    <div class="${hasBuzzer ? 'countdown-host-layout' : ''}">
      <div class="countdown-question-panel">

        <!-- Navigation bar -->
        <div style="margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <span style="font-size:0.8rem;color:var(--text-muted);">Question:</span>
            <div class="btn-group" id="cd-nav-pills" style="flex-wrap:wrap;">${navPills}</div>
            <div style="flex:1;"></div>
            <button class="btn btn-ghost btn-sm" id="cd-reset-session">🔄 Reset</button>
          </div>
        </div>

        <!-- Question display -->
        <div class="question-display" style="text-align:left;max-width:100%;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
            <span style="font-size:0.85rem;color:var(--text-muted);">Q${activeIndex+1} of ${qs.length}</span>
            <span class="badge" style="background:var(--countdown);color:#000;">⏱ ${timerSecs}s</span>
          </div>
          ${mediaHtml}
          <div class="question-text" style="text-align:left;">${escHtml(q.question)}</div>
          ${answerSection}
          ${actionBtn}
        </div>
      </div>
      ${buzzerPanel}
    </div>`;

    // Nav pill clicks
    document.getElementById('cd-nav-pills')?.querySelectorAll('[data-qi]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeIndex = parseInt(btn.dataset.qi);
        view = 'QUESTION';
        updateSession();
        render();
      });
    });

    document.getElementById('cd-reveal')?.addEventListener('click', () => { view = 'ANSWER'; render(); });

    document.getElementById('cd-next')?.addEventListener('click', () => {
      // Mark current as answered
      const q2 = qs[activeIndex];
      if (!session.answeredQuestions) session.answeredQuestions = [];
      if (!session.answeredQuestions.includes(q2.id)) session.answeredQuestions.push(q2.id);

      if (activeIndex < qs.length - 1) {
        activeIndex++;
        view = 'QUESTION';
        updateSession();
        render();
      } else {
        updateSession();
        root.innerHTML = `
          <div class="page" style="text-align:center;padding-top:60px;">
            <div style="font-size:3rem;margin-bottom:16px;">🎉</div>
            <h1>Quiz Complete!</h1>
            <p style="color:var(--text-muted);margin-bottom:24px;">All ${qs.length} questions have been covered.</p>
            <div class="btn-group" style="justify-content:center;">
              <a href="#library" class="btn btn-primary">← Back to Library</a>
              <button class="btn btn-ghost" id="cd-restart">↺ Start Over</button>
            </div>
          </div>`;
        document.getElementById('cd-restart')?.addEventListener('click', async () => {
          await API.resetHostSession(quiz.id);
          session = { currentQuestionIndex: 0, answeredQuestions: [] };
          activeIndex = 0; view = 'QUESTION'; render();
        });
      }
    });

    document.getElementById('cd-reset-session')?.addEventListener('click', () => {
      ctx.showModal({
        title: 'Reset Session', message: 'Reset to question 1 and clear all answered state?',
        confirmLabel: 'Reset', confirmClass: 'btn-danger',
        onConfirm: async () => {
          await API.resetHostSession(quiz.id);
          session = { currentQuestionIndex: 0, answeredQuestions: [] };
          activeIndex = 0; view = 'QUESTION'; render();
        },
      });
    });
  }

  function updateSession() {
    session.currentQuestionIndex = activeIndex;
    API.saveHostSession(quiz.id, session).catch(() => {});
  }

  // ── FUTURE INTEGRATION SEAM ───────────────────────────────────────────────────
  // When deep buzzer synchronisation is implemented, this function will:
  //   1. Connect to ws://<buzzerHost>:3000 using the host token
  //   2. Send: SELECT_FORMAT, SET_QUESTION, SET_TIMER_DURATION, START_QUESTION
  //   3. Listen for GAME_STATE to receive answerEvents
  //
  // async function sendQuestionToBuzzer(questionId, timerMs) {
  //   // TODO: open WS connection, send HOST_AUTH, SET_QUESTION, SET_TIMER_DURATION, START_QUESTION
  // }
  // ─────────────────────────────────────────────────────────────────────────────

  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escAttr(s) { return escHtml(s); }

  function unmount() {}
  return { mount, unmount };
})();
