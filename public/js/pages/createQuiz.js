/**
 * public/js/pages/createQuiz.js — New Quiz Wizard
 */

const CreateQuizPage = (() => {
  let ctx, root;

  function mount(_root, param, _ctx) {
    root = _root;
    ctx = _ctx;
    ctx.renderNavbar({ back: true, backLabel: 'Home', onBack: () => goto('#home') });
    render();
  }

  function render() {
    root.innerHTML = `
    <div class="page page-narrow">
      <div class="page-title">
        <h1>Create New Quiz</h1>
        <p>Choose a name and format for your new quiz.</p>
      </div>

      <div class="card">
        <div class="form-group">
          <label for="quiz-name">Quiz Name</label>
          <input type="text" id="quiz-name" placeholder="e.g. Birthday Trivia Night" maxlength="120" autofocus>
        </div>

        <div class="form-group">
          <label>Quiz Format</label>
          <div id="format-picker" style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px;">
            ${formatCard('JEOPARDY',  '🟦', 'Jeopardy',       'Classic category board with point tiles, multiple stages, and variable point values.')}
            ${formatCard('COUNTDOWN', '⏱️', 'Countdown Quiz',  'Timed questions with countdown timer. Requires a buzzer display for hosting.')}
          </div>
        </div>

        <div id="create-error" class="alert alert-error" style="display:none;"></div>

        <div class="btn-group" style="margin-top:8px;">
          <a href="#library" class="btn btn-ghost">Cancel</a>
          <button class="btn btn-primary" id="create-btn">Create Quiz →</button>
        </div>
      </div>
    </div>`;

    // Format picker
    let selectedFormat = null;
    root.querySelectorAll('.format-card').forEach(card => {
      card.addEventListener('click', () => {
        root.querySelectorAll('.format-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedFormat = card.dataset.format;
      });
    });

    // Create
    document.getElementById('create-btn').addEventListener('click', async () => {
      const name = document.getElementById('quiz-name').value.trim();
      const errEl = document.getElementById('create-error');
      errEl.style.display = 'none';

      if (!name) {
        errEl.textContent = 'Please enter a quiz name.';
        errEl.style.display = 'block';
        return;
      }
      if (!selectedFormat) {
        errEl.textContent = 'Please select a format.';
        errEl.style.display = 'block';
        return;
      }

      const btn = document.getElementById('create-btn');
      btn.disabled = true;
      btn.textContent = 'Creating…';

      try {
        const { folderName } = await API.createQuiz(name, selectedFormat);
        ctx.showToast('Quiz created!', 'success');
        goto(`#editor/${folderName}`);
      } catch (e) {
        errEl.textContent = 'Could not create quiz: ' + e.message;
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Create Quiz →';
      }
    });

    // Allow Enter key on name input
    document.getElementById('quiz-name').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('create-btn').click();
    });
  }

  function formatCard(id, icon, label, desc) {
    return `
    <div class="format-card" data-format="${id}" style="
      flex:1; min-width:200px; background:var(--bg); border:2px solid var(--border);
      border-radius:var(--radius-lg); padding:20px; cursor:pointer; transition:border-color 0.15s, background 0.15s;
    ">
      <div style="font-size:2rem;margin-bottom:8px;">${icon}</div>
      <div style="font-weight:700;margin-bottom:4px;">${label}</div>
      <div style="font-size:0.8rem;color:var(--text-muted);">${desc}</div>
    </div>`;
  }

  // Inject selected state style
  const style = document.createElement('style');
  style.textContent = `.format-card.selected { border-color: var(--accent2) !important; background: var(--surface2) !important; }`;
  document.head.appendChild(style);

  function unmount() {}
  return { mount, unmount };
})();
