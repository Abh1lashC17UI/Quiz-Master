/**
 * public/js/pages/editor.js
 *
 * Editor shell — loads quiz, dispatches to format-specific editor,
 * manages save bar and completion toggle.
 */

const EditorPage = (() => {
  let ctx, root, quiz, folderName;
  let formatEditor = null;
  let saveTimeout = null;

  // ── Mount ─────────────────────────────────────────────────────────────────────

  function mount(_root, param, _ctx) {
    root = _root;
    ctx  = _ctx;
    folderName = param;

    root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:80vh;"><span class="spinner"></span></div>`;

    loadQuiz();
  }

  async function loadQuiz() {
    try {
      quiz = await API.getQuiz(folderName);
    } catch (e) {
      root.innerHTML = `<div class="page"><div class="alert alert-error">Could not load quiz: ${e.message}</div>
        <a href="#library" class="btn btn-ghost">← Back to Library</a></div>`;
      return;
    }

    ctx.renderNavbar({
      back: true,
      backLabel: 'Library',
      onBack: () => goto('#library'),
      saveStatus: true,
      extraHtml: navbarButtons(),
    });

    // Attach navbar button handlers after render
    requestAnimationFrame(() => attachNavbarHandlers());

    // Dispatch to format-specific editor
    const editors = { JEOPARDY: JeopardyEditor, COUNTDOWN: CountdownEditor };
    formatEditor = editors[quiz.format];

    if (!formatEditor) {
      root.innerHTML = `<div class="page"><div class="alert alert-error">Unknown format: ${quiz.format}</div></div>`;
      return;
    }

    ctx.setSaveStatus('saved');
    formatEditor.mount(root, quiz, folderName, { onChange, save, showToast: ctx.showToast, showModal: ctx.showModal });
  }

  // ── Navbar controls ────────────────────────────────────────────────────────────

  function navbarButtons() {
    const completeLabel = quiz && quiz.complete ? '✓ Complete' : 'Mark Complete';
    const completeClass = quiz && quiz.complete ? 'btn-success' : 'btn-secondary';
    return `
      <button class="btn ${completeClass} btn-sm" id="nb-complete">${completeLabel}</button>
      <button class="btn btn-primary btn-sm" id="nb-save">💾 Save</button>
      <button class="btn btn-ghost btn-sm" id="nb-host">▶ Host</button>`;
  }

  function attachNavbarHandlers() {
    const saveBtn     = document.getElementById('nb-save');
    const completeBtn = document.getElementById('nb-complete');
    const hostBtn     = document.getElementById('nb-host');
    if (saveBtn) saveBtn.addEventListener('click', () => save());
    if (completeBtn) completeBtn.addEventListener('click', toggleComplete);
    if (hostBtn) hostBtn.addEventListener('click', () => goto(`#host/${folderName}`));
  }

  // ── Change tracking ───────────────────────────────────────────────────────────

  function onChange(updatedQuiz) {
    quiz = updatedQuiz;
    ctx.scheduleAutosave(() => save());
  }

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function save() {
    ctx.setSaveStatus('saving');
    try {
      const saved = await API.saveQuiz(folderName, quiz);
      quiz = { ...saved, folderName };
      ctx.setSaveStatus('saved');
    } catch (e) {
      ctx.setSaveStatus('unsaved');
      ctx.showToast('Save failed: ' + e.message, 'error');
      throw e;
    }
  }

  // ── Completion toggle ─────────────────────────────────────────────────────────

  async function toggleComplete() {
    if (quiz.complete) {
      // Mark incomplete
      ctx.showModal({
        title: 'Mark as Incomplete',
        message: 'Marking this quiz incomplete will remove its launch shortcut. You can re-complete it at any time.',
        confirmLabel: 'Mark Incomplete',
        confirmClass: 'btn-warning',
        onConfirm: async () => {
          try {
            const result = await API.markIncomplete(folderName);
            quiz = { ...result.quiz, folderName };
            ctx.showToast('Quiz marked incomplete. Launcher removed.', 'success');
            reRenderNavbar();
          } catch (e) {
            ctx.showToast('Failed: ' + e.message, 'error');
          }
        },
      });
    } else {
      // Save first, then validate + mark complete
      await save();

      const validation = await API.validateQuiz(folderName).catch(e => ({ valid: false, errors: [e.message] }));
      if (!validation.valid) {
        ctx.showModal({
          title: 'Cannot Mark Complete',
          message: `<div class="validation-errors"><strong>Please fix these issues first:</strong><ul>${validation.errors.map(e => `<li>${e}</li>`).join('')}</ul></div>`,
          confirmLabel: 'OK',
          confirmClass: 'btn-primary',
          cancelLabel: '',
          onConfirm: () => {},
        });
        return;
      }

      try {
        const result = await API.markComplete(folderName);
        quiz = { ...result.quiz, folderName };
        ctx.showToast('Quiz marked complete! LaunchQuiz.bat created.', 'success');
        reRenderNavbar();
      } catch (e) {
        ctx.showToast('Failed: ' + e.message, 'error');
      }
    }
  }

  function reRenderNavbar() {
    ctx.renderNavbar({
      back: true,
      backLabel: 'Library',
      onBack: () => goto('#library'),
      saveStatus: true,
      extraHtml: navbarButtons(),
    });
    requestAnimationFrame(() => attachNavbarHandlers());
  }

  // ── Unmount ───────────────────────────────────────────────────────────────────

  function unmount() {
    clearTimeout(saveTimeout);
    if (formatEditor && formatEditor.unmount) formatEditor.unmount();
    formatEditor = null;
  }

  return { mount, unmount };
})();
