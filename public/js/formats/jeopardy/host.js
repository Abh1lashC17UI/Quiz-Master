/**
 * public/js/formats/jeopardy/host.js
 *
 * Jeopardy host interface.
 *
 * Views: BOARD → QUESTION → ANSWER → BOARD
 *
 * Live session state is in-memory and saved to the server session endpoint.
 * It does NOT modify quiz.json.
 *
 * UUID-based tracking: questions are identified by their stable UUID.
 * The board always renders from quiz data; session tracks answered UUIDs.
 */

const JeopardyHost = (() => {
  let quiz, folderName, ctx;
  let session = { answeredQuestions: [], revealedSolutions: [], currentStageIndex: 0 };
  let view = 'BOARD'; // 'BOARD' | 'QUESTION' | 'ANSWER' | 'SOLUTION'
  let activeQuestion = null;
  let activeStageSolution = null;
  let root;

  // ── Mount ─────────────────────────────────────────────────────────────────────

  async function mount(_root, _quiz, _folderName, _ctx) {
    root       = _root;
    quiz       = _quiz;
    folderName = _folderName;
    ctx        = _ctx;

    // Load or init session
    try {
      session = await API.getHostSession(quiz.id);
    } catch (e) {
      session = { answeredQuestions: [], revealedSolutions: [], currentStageIndex: 0 };
    }

    view = 'BOARD';
    render();
  }

  // ── Render dispatcher ─────────────────────────────────────────────────────────

  function render() {
    switch (view) {
      case 'BOARD':    renderBoard();    break;
      case 'QUESTION': renderQuestion(); break;
      case 'ANSWER':   renderAnswer();   break;
      case 'SOLUTION': renderSolution(); break;
    }
  }

  // ── Board ─────────────────────────────────────────────────────────────────────

  function renderBoard() {
    const stages = quiz.stages || [];
    if (stages.length === 0) {
      root.innerHTML = `<div class="page"><div class="alert alert-error">No stages in this quiz.</div></div>`;
      return;
    }

    const stageIndex = Math.min(session.currentStageIndex || 0, stages.length - 1);
    const stage = stages[stageIndex];
    const cats = stage.categories || [];

    // Compute remaining points
    let totalPoints = 0, remainingPoints = 0;
    for (const cat of cats) {
      for (const q of (cat.questions || [])) {
        totalPoints += q.points || 0;
        if (!session.answeredQuestions.includes(q.id)) remainingPoints += q.points || 0;
      }
    }

    // Stage tabs
    const stageTabs = stages.map((s, i) => `
      <button class="btn ${i === stageIndex ? 'btn-primary' : 'btn-ghost'} btn-sm" data-stage-idx="${i}">
        ${escHtml(s.name || `Stage ${i+1}`)}
      </button>`).join('');

    // Build board grid (column per category, row per question)
    const maxQs = Math.max(...cats.map(c => (c.questions||[]).length), 0);

    let boardHtml = `<div class="jeopardy-board" style="grid-template-columns: repeat(${cats.length}, 1fr);">`;

    // Category headers
    cats.forEach(cat => {
      boardHtml += `<div class="board-category-header">${escHtml(cat.name)}</div>`;
    });

    // Question tiles
    for (let row = 0; row < maxQs; row++) {
      cats.forEach(cat => {
        const q = (cat.questions || [])[row];
        if (!q) {
          boardHtml += `<div></div>`;
        } else {
          const answered = session.answeredQuestions.includes(q.id);
          const special  = q.isSpecial ? 'special' : '';
          boardHtml += `
            <button class="board-tile ${answered ? 'answered' : ''} ${special}"
                    data-qid="${q.id}" data-catid="${cat.id}"
                    ${answered ? 'disabled' : ''}>
              ${answered ? '✓' : q.points}
            </button>`;
        }
      });
    }
    boardHtml += `</div>`;

    const hasSolution = stage.stageSolution && stage.stageSolution.enabled;
    const solutionRevealed = session.revealedSolutions && session.revealedSolutions.includes(stage.id);

    root.innerHTML = `
    <div style="padding:20px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
        <div class="btn-group">${stageTabs}</div>
        <div style="flex:1;"></div>
        <div style="font-size:0.875rem;color:var(--text-muted);">
          Remaining: <strong style="color:var(--accent2);">${remainingPoints.toLocaleString()}</strong>
          / ${totalPoints.toLocaleString()} pts
        </div>
        ${hasSolution ? `<button class="btn ${solutionRevealed ? 'btn-success' : 'btn-warning'} btn-sm" id="reveal-solution-btn">
          ${solutionRevealed ? '✓ Solution Revealed' : '🎯 Reveal Stage Solution'}
        </button>` : ''}
        <button class="btn btn-ghost btn-sm" id="reset-session-btn">🔄 Reset Session</button>
      </div>
      ${boardHtml}
    </div>`;

    // Stage tab clicks
    root.querySelectorAll('[data-stage-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        session.currentStageIndex = parseInt(btn.dataset.stageIdx);
        session.answeredQuestions = [];  // Reset answered for new stage (or keep — your choice)
        saveSession();
        renderBoard();
      });
    });

    // Question tile clicks
    root.querySelectorAll('[data-qid]:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const qid   = btn.dataset.qid;
        const catid = btn.dataset.catid;
        activeQuestion = findQuestion(qid, stage);
        if (activeQuestion) { view = 'QUESTION'; render(); }
      });
    });

    // Reveal solution
    document.getElementById('reveal-solution-btn')?.addEventListener('click', () => {
      activeStageSolution = stage;
      view = 'SOLUTION';
      render();
    });

    // Reset session
    document.getElementById('reset-session-btn')?.addEventListener('click', () => {
      ctx.showModal({
        title: 'Reset Session',
        message: 'Clear all answered questions and start a fresh session?',
        confirmLabel: 'Reset', confirmClass: 'btn-danger',
        onConfirm: async () => {
          await API.resetHostSession(quiz.id);
          session = { answeredQuestions: [], revealedSolutions: [], currentStageIndex: 0 };
          renderBoard();
        },
      });
    });
  }

  // ── Question view ─────────────────────────────────────────────────────────────

  function renderQuestion() {
    const q = activeQuestion;
    if (!q) { view = 'BOARD'; render(); return; }

    const mediaHtml = q.mediaFile
      ? `<div class="question-media"><img src="${API.mediaUrl(folderName, q.mediaFile)}" alt="Question image"></div>`
      : '';
    const specialBadge = q.isSpecial
      ? `<span class="badge" style="background:var(--accent2);color:#000;">${escHtml(q.specialLabel || 'Special')}</span>`
      : '';

    root.innerHTML = `
    <div class="page" style="max-width:900px;margin:0 auto;padding-top:40px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <button class="btn btn-ghost" id="q-back">← Board</button>
        <span class="points-badge">${q.points} pts</span>
        ${specialBadge}
        <div style="flex:1;"></div>
        <button class="btn btn-ghost btn-sm" id="q-mark-answered">Mark Answered Without Reveal</button>
      </div>

      <div class="question-display">
        ${mediaHtml}
        <div class="question-text">${escHtml(q.question)}</div>
        ${q.hostNotes ? `<div class="alert alert-info" style="text-align:left;">📝 Host notes: ${escHtml(q.hostNotes)}</div>` : ''}
        <button class="btn btn-primary btn-lg" id="q-reveal">Reveal Answer</button>
      </div>
    </div>`;

    document.getElementById('q-back')?.addEventListener('click', () => { view = 'BOARD'; render(); });
    document.getElementById('q-reveal')?.addEventListener('click', () => { view = 'ANSWER'; render(); });
    document.getElementById('q-mark-answered')?.addEventListener('click', () => {
      markAnswered(q.id);
      view = 'BOARD';
      render();
    });
  }

  // ── Answer view ───────────────────────────────────────────────────────────────

  function renderAnswer() {
    const q = activeQuestion;
    if (!q) { view = 'BOARD'; render(); return; }

    const qMediaHtml = q.mediaFile
      ? `<div class="question-media"><img src="${API.mediaUrl(folderName, q.mediaFile)}" alt="Question image"></div>`
      : '';
    const aMediaHtml = q.answerMediaFile
      ? `<div class="question-media" style="margin-top:16px;"><img src="${API.mediaUrl(folderName, q.answerMediaFile)}" alt="Answer image"></div>`
      : '';

    root.innerHTML = `
    <div class="page" style="max-width:900px;margin:0 auto;padding-top:40px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
        <button class="btn btn-ghost" id="a-back-q">← Question</button>
        <span class="points-badge">${q.points} pts</span>
        <div style="flex:1;"></div>
      </div>

      <div class="question-display">
        ${qMediaHtml}
        <div class="question-text" style="font-size:1.2rem;color:var(--text-muted);">${escHtml(q.question)}</div>
        <div class="answer-text">${escHtml(q.answer)}</div>
        ${q.additionalInfo ? `<div style="color:var(--text-muted);font-size:0.9rem;margin-top:-8px;margin-bottom:16px;">${escHtml(q.additionalInfo)}</div>` : ''}
        ${aMediaHtml}
        ${q.hostNotes ? `<div class="alert alert-info" style="text-align:left;margin-top:16px;">📝 ${escHtml(q.hostNotes)}</div>` : ''}
        <div class="btn-group" style="justify-content:center;margin-top:24px;">
          <button class="btn btn-success btn-lg" id="a-return">✓ Return to Board</button>
        </div>
      </div>
    </div>`;

    document.getElementById('a-back-q')?.addEventListener('click', () => { view = 'QUESTION'; render(); });
    document.getElementById('a-return')?.addEventListener('click', () => {
      markAnswered(q.id);
      view = 'BOARD';
      render();
    });
  }

  // ── Stage solution view ───────────────────────────────────────────────────────

  function renderSolution() {
    const stage = activeStageSolution;
    if (!stage) { view = 'BOARD'; render(); return; }
    const sol = stage.stageSolution || {};

    const mediaHtml = sol.mediaFile
      ? `<div class="question-media"><img src="${API.mediaUrl(folderName, sol.mediaFile)}" alt="Solution image" style="max-height:420px;"></div>`
      : '';

    root.innerHTML = `
    <div class="page" style="max-width:900px;margin:0 auto;padding-top:40px;text-align:center;">
      <button class="btn btn-ghost" id="sol-back" style="margin-bottom:24px;float:left;">← Board</button>
      <div style="clear:both;"></div>
      <div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;">STAGE SOLUTION</div>
      <div class="question-text">${escHtml(sol.title || 'Stage Solution')}</div>
      ${mediaHtml}
      ${sol.explanation ? `<div class="answer-text">${escHtml(sol.explanation)}</div>` : ''}
      ${sol.points ? `<div style="margin-top:12px;"><span class="points-badge" style="font-size:1.2rem;">${sol.points} bonus pts</span></div>` : ''}
    </div>`;

    // Mark solution as revealed
    if (!session.revealedSolutions) session.revealedSolutions = [];
    if (!session.revealedSolutions.includes(stage.id)) {
      session.revealedSolutions.push(stage.id);
      saveSession();
    }

    document.getElementById('sol-back')?.addEventListener('click', () => { view = 'BOARD'; render(); });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function markAnswered(qid) {
    if (!session.answeredQuestions.includes(qid)) {
      session.answeredQuestions.push(qid);
      saveSession();
    }
  }

  function findQuestion(qid, stage) {
    for (const cat of (stage.categories || [])) {
      const q = (cat.questions || []).find(q => q.id === qid);
      if (q) return q;
    }
    return null;
  }

  async function saveSession() {
    try {
      await API.saveHostSession(quiz.id, session);
    } catch (e) {
      // Non-fatal — session is in-memory
      console.warn('Session save failed:', e.message);
    }
  }

  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function unmount() {}
  return { mount, unmount };
})();
