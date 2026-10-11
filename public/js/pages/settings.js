/**
 * public/js/pages/settings.js — Settings page
 */

const SettingsPage = (() => {
  let ctx;

  function mount(root, param, _ctx) {
    ctx = _ctx;
    ctx.renderNavbar({ back: true, backLabel: 'Home', onBack: () => goto('#home') });
    render(root);
  }

  async function render(root) {
    root.innerHTML = `<div class="page page-narrow">
      <div class="page-title"><h1>Settings</h1><p>Configure the QuizMaster application.</p></div>
      <div class="card">
        <h2>Quiz Root Folder</h2>
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.875rem;">
          All quizzes will be stored in subfolders of this directory.
        </p>
        <div class="form-group">
          <label>Quiz Root Folder Path</label>
          <div class="input-row">
            <input type="text" id="rootFolderInput" placeholder="e.g. C:\\Users\\Name\\TriviaQuizzes">
            <button class="btn btn-secondary" id="browseBtn">📁 Browse</button>
          </div>
          <div class="hint" id="rootFolderHint"></div>
        </div>
        <div class="btn-group" style="margin-top:8px;">
          <button class="btn btn-primary" id="saveSettingsBtn">Save Settings</button>
        </div>
      </div>

      <div class="card">
        <h2>Quiz Launchers</h2>
        <p style="color:var(--text-muted);margin-bottom:16px;font-size:0.875rem;">
          If you have moved the QuizMaster application to a new folder, regenerate all
          <code>LaunchQuiz.bat</code> files so they point to the new location.
        </p>
        <button class="btn btn-secondary" id="regenBtn">🔄 Regenerate All Launchers</button>
        <div id="regenResult" style="margin-top:12px;"></div>
      </div>

      <div class="card">
        <h2>About</h2>
        <p style="color:var(--text-muted);font-size:0.875rem;">
          QuizMaster v1.0.0 — local trivia quiz maker &amp; hoster.<br>
          Quizzes are stored as <code>quiz.json</code> files and are fully portable.<br>
          The buzzer integration works with the <strong>Trivia Night Buzzer</strong> application.
        </p>
      </div>
    </div>`;

    // Load current settings
    let settings = {};
    try {
      settings = await API.getSettings();
    } catch (e) {
      ctx.showToast('Could not load settings: ' + e.message, 'error');
    }

    const input = document.getElementById('rootFolderInput');
    const hint  = document.getElementById('rootFolderHint');
    input.value = settings.quizRootFolder || '';

    // Browse button → native folder picker
    document.getElementById('browseBtn').addEventListener('click', async () => {
      try {
        const result = await API.browseFolder();
        if (result.ok && result.path) {
          input.value = result.path;
          hint.textContent = '';
        } else if (result.cancelled) {
          // User cancelled — no action
        } else if (result.fallback) {
          hint.textContent = 'Native picker unavailable. Please type the path manually.';
        }
      } catch (e) {
        ctx.showToast('Browse failed: ' + e.message, 'error');
      }
    });

    // Save settings
    document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
      const folder = input.value.trim();
      if (!folder) {
        hint.textContent = 'Please enter a folder path.';
        return;
      }
      hint.textContent = '';
      try {
        await API.saveSettings({ quizRootFolder: folder });
        ctx.showToast('Settings saved.', 'success');
      } catch (e) {
        ctx.showToast('Save failed: ' + e.message, 'error');
      }
    });

    // Regenerate launchers
    document.getElementById('regenBtn').addEventListener('click', async () => {
      const resultEl = document.getElementById('regenResult');
      resultEl.innerHTML = '<span class="spinner"></span>';
      try {
        const r = await API.regenerateLaunchers();
        resultEl.innerHTML = `<div class="alert alert-success">Regenerated ${r.regenerated} launcher(s) and updated quizmaster.conf.</div>`;
      } catch (e) {
        resultEl.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
      }
    });
  }

  function unmount() {}
  return { mount, unmount };
})();
