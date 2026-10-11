/**
 * public/js/formats/jeopardy/editor.js
 *
 * Jeopardy quiz editor.
 *
 * Layout:
 *   Sidebar: stage list → category list → add controls
 *   Main:    selected stage/category/question form
 *
 * All UUIDs are generated server-side. The editor never invents its own IDs.
 */

const JeopardyEditor = (() => {
  let quiz, folderName, callbacks;
  let selectedStageId   = null;
  let selectedCategoryId = null;
  let selectedQuestionId = null;

  // ── Mount ─────────────────────────────────────────────────────────────────────

  function mount(root, _quiz, _folderName, _callbacks) {
    quiz       = _quiz;
    folderName = _folderName;
    callbacks  = _callbacks;

    // Select first stage by default
    if (quiz.stages && quiz.stages.length > 0) {
      selectedStageId = quiz.stages[0].id;
    }

    renderLayout(root);
  }

  // ── Top-level layout ──────────────────────────────────────────────────────────

  function renderLayout(root) {
    root.innerHTML = `
    <div class="editor-layout">
      <div class="editor-sidebar" id="je-sidebar"></div>
      <div class="editor-main"   id="je-main"></div>
    </div>`;
    renderSidebar();
    renderMain();
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────────

  function renderSidebar() {
    const sb = document.getElementById('je-sidebar');
    const stages = quiz.stages || [];

    let html = `
      <div class="sidebar-section-header">Quiz Settings</div>
      <button class="sidebar-item ${!selectedStageId ? 'active' : ''}" id="sb-quiz-settings">⚙ Quiz Name &amp; Settings</button>
      <div class="sidebar-section-header">Stages</div>`;

    stages.forEach((stage, si) => {
      const isActive = stage.id === selectedStageId;
      html += `<button class="sidebar-item ${isActive ? 'active' : ''}" data-stage="${stage.id}">
        <span style="flex:1;text-align:left;">${escHtml(stage.name || `Stage ${si+1}`)}</span>
        <span style="color:var(--text-muted);font-size:0.75rem;">${(stage.categories||[]).length} cat</span>
      </button>`;

      if (isActive) {
        const cats = stage.categories || [];
        cats.forEach((cat, ci) => {
          const isCatActive = cat.id === selectedCategoryId;
          html += `<button class="sidebar-item indent ${isCatActive ? 'active' : ''}" data-category="${cat.id}">
            <span style="flex:1;text-align:left;">${escHtml(cat.name || `Category ${ci+1}`)}</span>
            <span style="color:var(--text-muted);font-size:0.75rem;">${(cat.questions||[]).length}q</span>
          </button>`;
        });
        html += `<button class="sidebar-item indent" id="sb-add-cat" style="color:var(--accent2);">+ Add Category</button>`;
      }
    });

    html += `<button class="sidebar-item" id="sb-add-stage" style="color:var(--accent2);margin-top:4px;">+ Add Stage</button>`;

    sb.innerHTML = html;

    // Events
    sb.querySelector('#sb-quiz-settings')?.addEventListener('click', () => {
      selectedStageId = null; selectedCategoryId = null; selectedQuestionId = null;
      renderSidebar(); renderMain();
    });

    sb.querySelectorAll('[data-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedStageId = btn.dataset.stage;
        selectedCategoryId = null; selectedQuestionId = null;
        renderSidebar(); renderMain();
      });
    });

    sb.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedCategoryId = btn.dataset.category;
        selectedQuestionId = null;
        renderSidebar(); renderMain();
      });
    });

    sb.querySelector('#sb-add-stage')?.addEventListener('click', addStage);
    sb.querySelector('#sb-add-cat')?.addEventListener('click', addCategory);
  }

  // ── Main Panel ────────────────────────────────────────────────────────────────

  function renderMain() {
    const main = document.getElementById('je-main');
    if (!main) return;

    if (!selectedStageId) {
      renderQuizSettings(main);
    } else if (!selectedCategoryId) {
      const stage = getStage(selectedStageId);
      if (stage) renderStagePanel(main, stage);
    } else {
      const cat = getCategory(selectedStageId, selectedCategoryId);
      if (cat) renderCategoryPanel(main, getStage(selectedStageId), cat);
    }
  }

  // ── Quiz settings panel ───────────────────────────────────────────────────────

  function renderQuizSettings(main) {
    main.innerHTML = `
    <h2>Quiz Settings</h2>
    <div class="card">
      <div class="form-group">
        <label>Quiz Name</label>
        <input type="text" id="qs-name" value="${escAttr(quiz.name)}" maxlength="120">
      </div>
    </div>`;

    bind('qs-name', 'input', e => { quiz.name = e.target.value; notifyChange(); });
  }

  // ── Stage panel ───────────────────────────────────────────────────────────────

  function renderStagePanel(main, stage) {
    const stageIndex = quiz.stages.findIndex(s => s.id === stage.id);
    const sol = stage.stageSolution || {};

    main.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <h2 style="flex:1;">Stage: ${escHtml(stage.name)}</h2>
      <div class="btn-group">
        ${stageIndex > 0 ? `<button class="btn btn-ghost btn-sm" id="st-move-up">↑ Move Up</button>` : ''}
        ${stageIndex < quiz.stages.length - 1 ? `<button class="btn btn-ghost btn-sm" id="st-move-down">↓ Move Down</button>` : ''}
        <button class="btn btn-danger btn-sm" id="st-delete">🗑 Delete Stage</button>
      </div>
    </div>

    <div class="card">
      <h3>Stage Settings</h3>
      <div class="form-group">
        <label>Stage Name</label>
        <input type="text" id="st-name" value="${escAttr(stage.name)}" maxlength="80">
      </div>
    </div>

    <div class="card">
      <h3>Stage-Wide Solution / Reveal</h3>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:16px;">
        Optionally show a hidden image or solution at the end of this stage.
      </p>
      <div class="checkbox-row" style="margin-bottom:16px;">
        <input type="checkbox" id="st-sol-enabled" ${sol.enabled ? 'checked' : ''}>
        <label for="st-sol-enabled">This stage has a hidden solution / image</label>
      </div>
      <div id="sol-fields" style="${sol.enabled ? '' : 'display:none'}">
        <div class="form-group">
          <label>Solution Title</label>
          <input type="text" id="st-sol-title" value="${escAttr(sol.title || '')}" placeholder="e.g. The Mystery Theme">
        </div>
        <div class="form-group">
          <label>Explanation (optional)</label>
          <textarea id="st-sol-explanation" rows="2">${escHtml(sol.explanation || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Solution Image (optional)</label>
          ${mediaField('st-sol-media', sol.mediaFile, stage.id, 'stageSolution')}
        </div>
        <div class="form-group">
          <label>Bonus Points (optional)</label>
          <input type="number" id="st-sol-points" value="${sol.points || 0}" min="0" style="max-width:120px;">
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Quick-Add Questions to All Categories</h3>
      <p style="color:var(--text-muted);font-size:0.875rem;margin-bottom:12px;">
        Set default point values for this stage. Applied to new questions.
      </p>
      <div class="form-group">
        <label>Default Point Increments (comma-separated)</label>
        <input type="text" id="st-pts-preset" placeholder="100,200,300,400,500" style="max-width:320px;">
        <div class="hint">e.g. "100,200,300,400,500" — used when adding questions to this stage's categories.</div>
      </div>
    </div>

    <div class="card">
      <h3>Categories (${(stage.categories||[]).length})</h3>
      <p style="color:var(--text-muted);font-size:0.875rem;">
        Click a category in the sidebar to edit its questions.
      </p>
      ${(stage.categories||[]).length === 0 ? `<div class="alert alert-info" style="margin-top:8px;">No categories yet. Click "Add Category" in the sidebar.</div>` : ''}
    </div>`;

    // Events
    bind('st-name', 'input', e => { stage.name = e.target.value; notifyChange(); renderSidebar(); });

    document.getElementById('st-sol-enabled')?.addEventListener('change', e => {
      sol.enabled = e.target.checked;
      document.getElementById('sol-fields').style.display = sol.enabled ? '' : 'none';
      notifyChange();
    });
    bind('st-sol-title',       'input',  e => { sol.title       = e.target.value; notifyChange(); });
    bind('st-sol-explanation', 'input',  e => { sol.explanation = e.target.value; notifyChange(); });
    bind('st-sol-points',      'change', e => { sol.points      = parseInt(e.target.value)||0; notifyChange(); });

    document.getElementById('st-move-up')?.addEventListener('click', () => {
      const i = quiz.stages.findIndex(s => s.id === stage.id);
      if (i > 0) { [quiz.stages[i-1], quiz.stages[i]] = [quiz.stages[i], quiz.stages[i-1]]; notifyChange(); renderSidebar(); renderMain(); }
    });
    document.getElementById('st-move-down')?.addEventListener('click', () => {
      const i = quiz.stages.findIndex(s => s.id === stage.id);
      if (i < quiz.stages.length-1) { [quiz.stages[i], quiz.stages[i+1]] = [quiz.stages[i+1], quiz.stages[i]]; notifyChange(); renderSidebar(); renderMain(); }
    });
    document.getElementById('st-delete')?.addEventListener('click', () => {
      callbacks.showModal({
        title: 'Delete Stage',
        message: `Delete stage "<strong>${escHtml(stage.name)}</strong>" and all its categories and questions?`,
        confirmLabel: 'Delete', confirmClass: 'btn-danger',
        onConfirm: () => {
          quiz.stages = quiz.stages.filter(s => s.id !== stage.id);
          selectedStageId = quiz.stages.length > 0 ? quiz.stages[0].id : null;
          selectedCategoryId = null;
          notifyChange(); renderSidebar(); renderMain();
        },
      });
    });

    attachMediaHandlers(stage.id, 'stageSolution', null, sol, 'mediaFile');
  }

  // ── Category panel ────────────────────────────────────────────────────────────

  function renderCategoryPanel(main, stage, cat) {
    const catIndex = stage.categories.findIndex(c => c.id === cat.id);

    main.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <div>
        <div style="font-size:0.8rem;color:var(--text-muted);">${escHtml(stage.name)}</div>
        <h2>Category: ${escHtml(cat.name)}</h2>
      </div>
      <div class="btn-group" style="margin-left:auto;">
        ${catIndex > 0 ? `<button class="btn btn-ghost btn-sm" id="cat-move-up">↑ Up</button>` : ''}
        ${catIndex < stage.categories.length-1 ? `<button class="btn btn-ghost btn-sm" id="cat-move-down">↓ Down</button>` : ''}
        <button class="btn btn-danger btn-sm" id="cat-delete">🗑 Delete</button>
      </div>
    </div>

    <div class="card">
      <div class="form-group">
        <label>Category Name</label>
        <input type="text" id="cat-name" value="${escAttr(cat.name)}" maxlength="80">
      </div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <h3 style="flex:1;">Questions (${(cat.questions||[]).length})</h3>
        <button class="btn btn-primary btn-sm" id="cat-add-q">+ Add Question</button>
      </div>
      <div id="questions-list"></div>
    </div>`;

    bind('cat-name', 'input', e => { cat.name = e.target.value; notifyChange(); renderSidebar(); });

    document.getElementById('cat-move-up')?.addEventListener('click', () => {
      if (catIndex > 0) {
        [stage.categories[catIndex-1], stage.categories[catIndex]] = [stage.categories[catIndex], stage.categories[catIndex-1]];
        notifyChange(); renderSidebar(); renderMain();
      }
    });
    document.getElementById('cat-move-down')?.addEventListener('click', () => {
      if (catIndex < stage.categories.length-1) {
        [stage.categories[catIndex], stage.categories[catIndex+1]] = [stage.categories[catIndex+1], stage.categories[catIndex]];
        notifyChange(); renderSidebar(); renderMain();
      }
    });
    document.getElementById('cat-delete')?.addEventListener('click', () => {
      callbacks.showModal({
        title: 'Delete Category',
        message: `Delete category "<strong>${escHtml(cat.name)}</strong>" and all its questions?`,
        confirmLabel: 'Delete', confirmClass: 'btn-danger',
        onConfirm: () => {
          stage.categories = stage.categories.filter(c => c.id !== cat.id);
          selectedCategoryId = null;
          notifyChange(); renderSidebar(); renderMain();
        },
      });
    });

    document.getElementById('cat-add-q')?.addEventListener('click', () => addQuestion(cat));

    renderQuestions(cat);
  }

  // ── Questions list ────────────────────────────────────────────────────────────

  function renderQuestions(cat) {
    const listEl = document.getElementById('questions-list');
    if (!listEl) return;
    const qs = cat.questions || [];

    if (qs.length === 0) {
      listEl.innerHTML = `<div class="alert alert-info">No questions yet. Click "Add Question" to start.</div>`;
      return;
    }

    listEl.innerHTML = qs.map((q, qi) => questionCard(q, qi, cat)).join('');

    // Attach question card handlers
    listEl.querySelectorAll('[data-qid]').forEach(card => {
      const qid = card.dataset.qid;
      const q   = qs.find(x => x.id === qid);
      if (!q) return;

      const get = (sel) => card.querySelector(sel);

      get('[data-field="question"]')?.addEventListener('input',       e => { q.question     = e.target.value; notifyChange(); });
      get('[data-field="answer"]')?.addEventListener('input',         e => { q.answer        = e.target.value; notifyChange(); });
      get('[data-field="additionalInfo"]')?.addEventListener('input', e => { q.additionalInfo= e.target.value; notifyChange(); });
      get('[data-field="hostNotes"]')?.addEventListener('input',      e => { q.hostNotes     = e.target.value; notifyChange(); });
      get('[data-field="points"]')?.addEventListener('change',        e => { q.points        = parseInt(e.target.value)||0; notifyChange(); });
      get('[data-field="isSpecial"]')?.addEventListener('change',     e => {
        q.isSpecial = e.target.checked;
        const lf = get('.special-label-field');
        if (lf) lf.style.display = q.isSpecial ? '' : 'none';
        notifyChange();
      });
      get('[data-field="specialLabel"]')?.addEventListener('input',   e => { q.specialLabel  = e.target.value; notifyChange(); });

      // Move up/down
      get('[data-action="q-up"]')?.addEventListener('click', () => {
        const i = cat.questions.indexOf(q);
        if (i > 0) { [cat.questions[i-1], cat.questions[i]] = [cat.questions[i], cat.questions[i-1]]; notifyChange(); renderQuestions(cat); }
      });
      get('[data-action="q-down"]')?.addEventListener('click', () => {
        const i = cat.questions.indexOf(q);
        if (i < cat.questions.length-1) { [cat.questions[i], cat.questions[i+1]] = [cat.questions[i+1], cat.questions[i]]; notifyChange(); renderQuestions(cat); }
      });
      get('[data-action="q-dup"]')?.addEventListener('click', async () => {
        const newQ = await API.newQuestion({ format: 'JEOPARDY', ...q });
        cat.questions.splice(cat.questions.indexOf(q)+1, 0, newQ);
        notifyChange(); renderQuestions(cat);
      });
      get('[data-action="q-del"]')?.addEventListener('click', () => {
        callbacks.showModal({
          title: 'Delete Question',
          message: `Delete this question? This cannot be undone.`,
          confirmLabel: 'Delete', confirmClass: 'btn-danger',
          onConfirm: () => { cat.questions = cat.questions.filter(x => x.id !== q.id); notifyChange(); renderQuestions(cat); },
        });
      });

      // Media
      get('[data-mediaupload="question"]')?.addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const r = await API.uploadMedia(folderName, file);
          q.mediaFile = r.relPath;
          notifyChange(); renderQuestions(cat);
        } catch (err) { callbacks.showToast('Upload failed: ' + err.message, 'error'); }
      });
      get('[data-mediaupload="answer"]')?.addEventListener('change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const r = await API.uploadMedia(folderName, file);
          q.answerMediaFile = r.relPath;
          notifyChange(); renderQuestions(cat);
        } catch (err) { callbacks.showToast('Upload failed: ' + err.message, 'error'); }
      });
      get('[data-mediaclear="question"]')?.addEventListener('click', () => { q.mediaFile = null; notifyChange(); renderQuestions(cat); });
      get('[data-mediaclear="answer"]')?.addEventListener('click',   () => { q.answerMediaFile = null; notifyChange(); renderQuestions(cat); });
    });
  }

  function questionCard(q, qi, cat) {
    const specialChecked = q.isSpecial ? 'checked' : '';
    const qMedia = q.mediaFile
      ? `<div style="margin-top:6px;">
           <img src="${API.mediaUrl(folderName, q.mediaFile)}" style="max-height:80px;border-radius:4px;margin-right:8px;">
           <button class="btn btn-danger btn-sm" data-mediaclear="question">✕ Remove</button>
         </div>`
      : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;margin-top:4px;">
           📎 Add Image <input type="file" data-mediaupload="question" accept="image/*" style="display:none">
         </label>`;
    const aMedia = q.answerMediaFile
      ? `<div style="margin-top:6px;">
           <img src="${API.mediaUrl(folderName, q.answerMediaFile)}" style="max-height:80px;border-radius:4px;margin-right:8px;">
           <button class="btn btn-danger btn-sm" data-mediaclear="answer">✕ Remove</button>
         </div>`
      : `<label class="btn btn-ghost btn-sm" style="cursor:pointer;margin-top:4px;">
           📎 Add Answer Image <input type="file" data-mediaupload="answer" accept="image/*" style="display:none">
         </label>`;

    return `
    <div class="card" data-qid="${q.id}" style="margin-bottom:12px;padding:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:0.75rem;color:var(--text-muted);">#${qi+1}</span>
        <span class="points-badge" style="cursor:default;">${q.points}</span>
        ${q.isSpecial ? `<span class="badge" style="background:var(--accent2);color:#000;">${escHtml(q.specialLabel || 'Special')}</span>` : ''}
        <div style="flex:1;"></div>
        <button class="btn btn-ghost btn-icon" data-action="q-up"   title="Move up">↑</button>
        <button class="btn btn-ghost btn-icon" data-action="q-down" title="Move down">↓</button>
        <button class="btn btn-ghost btn-icon" data-action="q-dup"  title="Duplicate">⧉</button>
        <button class="btn btn-danger btn-icon" data-action="q-del" title="Delete">🗑</button>
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

      <div style="display:grid;grid-template-columns:100px 1fr 1fr;gap:12px;margin-top:12px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Points</label>
          <input type="number" data-field="points" value="${q.points}" min="0" step="50">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Additional Info (optional)</label>
          <input type="text" data-field="additionalInfo" value="${escAttr(q.additionalInfo||'')}" placeholder="Extra info shown after answer">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Host Notes (private)</label>
          <input type="text" data-field="hostNotes" value="${escAttr(q.hostNotes||'')}" placeholder="Notes visible only to you">
        </div>
      </div>

      <div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div class="checkbox-row">
          <input type="checkbox" id="special-${q.id}" data-field="isSpecial" ${specialChecked}>
          <label for="special-${q.id}">Special question</label>
        </div>
        <div class="special-label-field" style="${q.isSpecial ? '' : 'display:none'}">
          <input type="text" data-field="specialLabel" value="${escAttr(q.specialLabel||'')}" placeholder="Label (e.g. Host's Pick)" style="width:200px;">
        </div>
      </div>
    </div>`;
  }

  // ── Media helpers ─────────────────────────────────────────────────────────────

  function mediaField(inputId, currentFile, ownerId, fieldType) {
    if (currentFile) {
      return `<div>
        <img src="${API.mediaUrl(folderName, currentFile)}" style="max-height:100px;border-radius:4px;margin-bottom:6px;display:block;">
        <button class="btn btn-danger btn-sm" id="${inputId}-clear">✕ Remove Image</button>
      </div>`;
    }
    return `<label class="btn btn-ghost btn-sm" style="cursor:pointer;">
      📎 Add Image
      <input type="file" id="${inputId}" accept="image/*" style="display:none">
    </label>`;
  }

  function attachMediaHandlers(stageId, objectKey, catId, obj, field) {
    const stage = getStage(stageId);
    if (!stage) return;
    const target = objectKey === 'stageSolution' ? stage.stageSolution : obj;

    const clearBtn = document.getElementById(`st-sol-media-clear`);
    if (clearBtn) clearBtn.addEventListener('click', () => { target[field] = null; notifyChange(); renderSidebar(); renderMain(); });

    const fileInput = document.getElementById(`st-sol-media`);
    if (fileInput) fileInput.addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        const r = await API.uploadMedia(folderName, file);
        target[field] = r.relPath;
        notifyChange(); renderSidebar(); renderMain();
      } catch (err) { callbacks.showToast('Upload failed: ' + err.message, 'error'); }
    });
  }

  // ── Add operations ────────────────────────────────────────────────────────────

  async function addStage() {
    try {
      const stage = await API.newStage({ name: `Round ${quiz.stages.length + 1}`, order: quiz.stages.length });
      quiz.stages.push(stage);
      selectedStageId = stage.id;
      selectedCategoryId = null;
      notifyChange(); renderSidebar(); renderMain();
    } catch (e) { callbacks.showToast('Failed to add stage: ' + e.message, 'error'); }
  }

  async function addCategory() {
    const stage = getStage(selectedStageId);
    if (!stage) return;
    try {
      const cat = await API.newCategory({ name: `Category ${stage.categories.length + 1}`, order: stage.categories.length });
      stage.categories.push(cat);
      selectedCategoryId = cat.id;
      notifyChange(); renderSidebar(); renderMain();
    } catch (e) { callbacks.showToast('Failed to add category: ' + e.message, 'error'); }
  }

  async function addQuestion(cat) {
    try {
      const q = await API.newQuestion({ format: 'JEOPARDY', order: cat.questions.length });
      cat.questions.push(q);
      notifyChange(); renderQuestions(cat);
      // Scroll to the new question
      setTimeout(() => {
        const cards = document.querySelectorAll('[data-qid]');
        if (cards.length) cards[cards.length-1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } catch (e) { callbacks.showToast('Failed to add question: ' + e.message, 'error'); }
  }

  // ── Lookups ───────────────────────────────────────────────────────────────────

  function getStage(id) { return (quiz.stages || []).find(s => s.id === id); }
  function getCategory(stageId, catId) {
    const stage = getStage(stageId);
    return stage ? (stage.categories || []).find(c => c.id === catId) : null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function notifyChange() { callbacks.onChange(quiz); }
  function bind(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
  }
  function escHtml(s)  { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escAttr(s)  { return escHtml(s); }

  function unmount() {}
  return { mount, unmount };
})();
