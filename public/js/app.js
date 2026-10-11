/**
 * public/js/app.js
 *
 * QuizMaster SPA router and global state manager.
 *
 * Routes (hash-based):
 *   #home           → Home screen
 *   #library        → Quiz library
 *   #settings       → Settings
 *   #create         → New quiz wizard
 *   #editor/:fn     → Quiz editor (fn = folderName)
 *   #host/:fn       → Quiz host (fn = folderName)
 *
 * Global state includes autosave tracking for the editor.
 */

const QuizMasterApp = (() => {
  // ── State ────────────────────────────────────────────────────────────────────

  const state = {
    currentRoute: null,
    currentPage: null,
    saveStatus: 'saved', // 'saved' | 'saving' | 'unsaved'
    autosaveTimer: null,
    settings: null,
  };

  // ── Page Registry ─────────────────────────────────────────────────────────────

  const PAGES = {
    home:     { module: () => HomePage },
    library:  { module: () => LibraryPage },
    settings: { module: () => SettingsPage },
    create:   { module: () => CreateQuizPage },
    editor:   { module: () => EditorPage },
    host:     { module: () => HostPage },
  };

  // ── DOM helpers ───────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function renderNavbar(opts = {}) {
    const navbar = el('navbar');
    navbar.innerHTML = `
      <nav class="navbar">
        ${opts.back ? `<button class="back-btn" id="nav-back">← ${opts.backLabel || 'Back'}</button>` : ''}
        <a href="#home" class="navbar-brand">🎯 QuizMaster</a>
        <div class="navbar-spacer"></div>
        ${opts.saveStatus ? `<span class="navbar-save-status" id="save-status-el"></span>` : ''}
        ${opts.extraHtml || ''}
      </nav>`;
    if (opts.back) {
      el('nav-back').addEventListener('click', () => {
        if (opts.onBack) opts.onBack();
        else history.back();
      });
    }
    updateSaveStatusEl();
  }

  function updateSaveStatusEl() {
    const el2 = document.getElementById('save-status-el');
    if (!el2) return;
    const labels = { saved: '✓ Saved', saving: '⟳ Saving…', unsaved: '● Unsaved changes' };
    el2.textContent = labels[state.saveStatus] || '';
    el2.className = 'navbar-save-status ' + state.saveStatus;
  }

  // ── Save status ───────────────────────────────────────────────────────────────

  function setSaveStatus(status) {
    state.saveStatus = status;
    updateSaveStatusEl();
  }

  function scheduleAutosave(saveFn) {
    clearTimeout(state.autosaveTimer);
    setSaveStatus('unsaved');
    state.autosaveTimer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveFn();
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('unsaved');
        showToast('Autosave failed: ' + err.message, 'error');
      }
    }, 2000); // 2s debounce
  }

  // ── Toast notifications ───────────────────────────────────────────────────────

  let toastContainer = null;

  function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.style.cssText = `
        position: fixed; bottom: 24px; right: 24px;
        display: flex; flex-direction: column; gap: 8px;
        z-index: 9999; max-width: 380px;
      `;
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const colors = { info: '#3498db', success: '#27ae60', error: '#e74c3c', warning: '#f39c12' };
    toast.style.cssText = `
      background: #1e2d45; border-left: 4px solid ${colors[type] || colors.info};
      color: #eaeaea; padding: 12px 16px; border-radius: 8px;
      font-size: 0.875rem; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      animation: slideIn 0.2s ease;
    `;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────────

  function showModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
                       confirmClass = 'btn-primary', onConfirm, onCancel }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>${title}</h2>
        <p>${message}</p>
        <div class="btn-group">
          <button class="btn btn-ghost" id="modal-cancel">${cancelLabel}</button>
          <button class="btn ${confirmClass}" id="modal-confirm">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
      overlay.remove();
      if (onCancel) onCancel();
    });

    overlay.querySelector('#modal-confirm').addEventListener('click', () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); if (onCancel) onCancel(); }
    });
  }

  // ── Router ────────────────────────────────────────────────────────────────────

  function parseRoute(hash) {
    const h = (hash || '').replace(/^#/, '') || 'home';
    const parts = h.split('/');
    return { name: parts[0], param: parts.slice(1).join('/') };
  }

  async function navigate(hash) {
    const route = parseRoute(hash);

    // Warn about unsaved changes before leaving editor
    if (state.saveStatus === 'unsaved' && state.currentRoute !== route.name) {
      const leave = await new Promise(resolve => {
        showModal({
          title: 'Unsaved Changes',
          message: 'You have unsaved changes. Leave without saving?',
          confirmLabel: 'Leave',
          confirmClass: 'btn-danger',
          onConfirm: () => resolve(true),
          onCancel:  () => resolve(false),
        });
      });
      if (!leave) {
        // Restore hash without re-triggering
        history.replaceState(null, '', '#' + (state.currentRoute || 'home'));
        return;
      }
    }

    // Unmount current page
    if (state.currentPage && state.currentPage.unmount) {
      state.currentPage.unmount();
    }
    clearTimeout(state.autosaveTimer);
    state.saveStatus = 'saved';

    state.currentRoute = route.name;

    const pageDef = PAGES[route.name];
    if (!pageDef) {
      el('page-root').innerHTML = `<div class="page"><h1>404 — Page not found</h1></div>`;
      return;
    }

    const PageModule = pageDef.module();
    if (!PageModule) {
      el('page-root').innerHTML = `<div class="page"><h1>Page not loaded</h1></div>`;
      return;
    }

    state.currentPage = PageModule;
    PageModule.mount(el('page-root'), route.param, { setSaveStatus, scheduleAutosave, showToast, showModal, renderNavbar });
  }

  function handleHashChange() {
    navigate(window.location.hash);
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  async function init() {
    // Add toast animation style
    const style = document.createElement('style');
    style.textContent = `@keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
    document.head.appendChild(style);

    // Load settings
    try {
      state.settings = await API.getSettings();
    } catch (e) {
      state.settings = {};
    }

    window.addEventListener('hashchange', handleHashChange);

    // Route to URL-based quiz host (e.g. /host/:quizId from LaunchQuiz.bat)
    const urlPath = window.location.pathname;
    const hostMatch = urlPath.match(/^\/host\/(.+)/);
    if (hostMatch) {
      window.location.hash = `#host/${hostMatch[1]}`;
      return;
    }

    // Navigate to current hash or default
    navigate(window.location.hash || '#home');
  }

  return { init, navigate, showToast, showModal, setSaveStatus, scheduleAutosave, renderNavbar };
})();

// Expose navigate globally for inline onclick handlers
function goto(hash) { QuizMasterApp.navigate(hash); }
