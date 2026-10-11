/**
 * public/js/pages/library.js — Quiz Library
 */

const LibraryPage = (() => {
  let ctx, root;

  function mount(_root, param, _ctx) {
    root = _root;
    ctx = _ctx;
    ctx.renderNavbar({ back: true, backLabel: 'Home', onBack: () => goto('#home') });
    render();
  }

  async function render() {
    root.innerHTML = `<div class="page">
      <div class="page-title" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div>
          <h1>Quiz Library</h1>
          <p>All quizzes in your quiz folder.</p>
        </div>
        <div style="margin-left:auto;">
          <a href="#create" class="btn btn-primary">➕ Create New Quiz</a>
        </div>
      </div>
      <div id="library-list"><div style="text-align:center;padding:60px;"><span class="spinner"></span></div></div>
    </div>`;

    let quizzes = [];
    try {
      quizzes = await API.listQuizzes();
    } catch (e) {
      document.getElementById('library-list').innerHTML =
        `<div class="alert alert-error">Could not load quizzes: ${e.message}<br>
        Make sure your quiz folder is configured in <a href="#settings">Settings</a>.</div>`;
      return;
    }

    const listEl = document.getElementById('library-list');

    if (quizzes.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <h2>No quizzes yet</h2>
          <p>Create your first quiz to get started.</p>
          <a href="#create" class="btn btn-primary">➕ Create New Quiz</a>
        </div>`;
      return;
    }

    listEl.innerHTML = quizzes.map(q => quizCard(q)).join('');

    // Attach event handlers
    listEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset.fn, btn.dataset.name));
    });
  }

  function formatBadge(format) {
    const classes = { JEOPARDY: 'badge-jeopardy', COUNTDOWN: 'badge-countdown' };
    const labels  = { JEOPARDY: 'Jeopardy', COUNTDOWN: 'Countdown Quiz' };
    return `<span class="badge ${classes[format] || ''}">${labels[format] || format}</span>`;
  }

  function completeBadge(complete) {
    return complete
      ? `<span class="badge badge-complete">✓ Complete</span>`
      : `<span class="badge badge-incomplete">Incomplete</span>`;
  }

  function quizCard(q) {
    const updated = q.updatedAt ? new Date(q.updatedAt).toLocaleDateString() : '—';
    const buzzerChip = q.buzzerConfigured
      ? `<span style="color:var(--countdown);">🔌 Buzzer configured</span>` : '';
    const stageInfo = q.format === 'JEOPARDY'
      ? `${q.stageCount} stage${q.stageCount !== 1 ? 's' : ''} · ${q.questionCount} question${q.questionCount !== 1 ? 's' : ''}`
      : `${q.questionCount} question${q.questionCount !== 1 ? 's' : ''}`;

    return `
    <div class="quiz-card">
      <div class="quiz-card-info">
        <div class="quiz-card-name">${escHtml(q.name)}</div>
        <div class="quiz-card-badges">
          ${formatBadge(q.format)}
          ${completeBadge(q.complete)}
        </div>
        <div class="quiz-card-meta">
          <span>📅 ${updated}</span>
          <span>📊 ${stageInfo}</span>
          ${buzzerChip}
        </div>
      </div>
      <div class="quiz-card-actions">
        <button class="btn btn-secondary btn-sm" data-action="edit" data-fn="${escAttr(q.folderName)}" data-name="${escAttr(q.name)}">✏️ Edit</button>
        <button class="btn btn-primary btn-sm" data-action="host" data-fn="${escAttr(q.folderName)}" data-name="${escAttr(q.name)}">▶ Host</button>
        <button class="btn btn-ghost btn-sm" data-action="duplicate" data-fn="${escAttr(q.folderName)}" data-name="${escAttr(q.name)}">⧉ Duplicate</button>
        <button class="btn btn-danger btn-sm" data-action="delete" data-fn="${escAttr(q.folderName)}" data-name="${escAttr(q.name)}">🗑 Delete</button>
      </div>
    </div>`;
  }

  async function handleAction(action, folderName, name) {
    switch (action) {
      case 'edit':
        goto(`#editor/${folderName}`);
        break;

      case 'host':
        goto(`#host/${folderName}`);
        break;

      case 'duplicate': {
        const newName = prompt(`Duplicate "${name}".\nNew quiz name:`, `${name} (copy)`);
        if (!newName || !newName.trim()) return;
        try {
          await API.duplicateQuiz(folderName, newName.trim());
          ctx.showToast('Quiz duplicated successfully.', 'success');
          render();
        } catch (e) {
          ctx.showToast('Duplicate failed: ' + e.message, 'error');
        }
        break;
      }

      case 'delete':
        ctx.showModal({
          title: 'Delete Quiz',
          message: `Are you sure you want to permanently delete "<strong>${escHtml(name)}</strong>"?<br>This cannot be undone.`,
          confirmLabel: 'Delete',
          confirmClass: 'btn-danger',
          onConfirm: async () => {
            try {
              await API.deleteQuiz(folderName);
              ctx.showToast('Quiz deleted.', 'success');
              render();
            } catch (e) {
              ctx.showToast('Delete failed: ' + e.message, 'error');
            }
          },
        });
        break;
    }
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) { return escHtml(s); }

  function unmount() {}
  return { mount, unmount };
})();
