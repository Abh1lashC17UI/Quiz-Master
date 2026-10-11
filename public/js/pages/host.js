/**
 * public/js/pages/host.js
 *
 * Host page shell.
 *
 * 1. Loads the quiz
 * 2. Checks host requirements (e.g. buzzer for Countdown)
 * 3. Dispatches to format-specific host module
 */

const HostPage = (() => {
  let ctx, root, quiz, folderName;
  let formatHost = null;

  function mount(_root, param, _ctx) {
    root       = _root;
    ctx        = _ctx;
    folderName = param;

    root.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:80vh;"><span class="spinner"></span></div>`;
    load();
  }

  async function load() {
    // Load quiz
    try {
      quiz = await API.getQuiz(folderName);
    } catch (e) {
      root.innerHTML = `<div class="page"><div class="alert alert-error">Could not load quiz: ${e.message}</div>
        <a href="#library" class="btn btn-ghost">← Back to Library</a></div>`;
      return;
    }

    // Check host requirements
    try {
      const check = await API.hostCheck(folderName);
      if (!check.canHost) {
        renderBuzzerRequiredScreen(check);
        return;
      }
    } catch (e) {
      // Non-fatal — proceed
    }

    ctx.renderNavbar({
      back: true,
      backLabel: 'Library',
      onBack: () => goto('#library'),
      extraHtml: `
        <span class="badge ${quiz.format === 'JEOPARDY' ? 'badge-jeopardy' : 'badge-countdown'}">${quiz.format === 'JEOPARDY' ? 'Jeopardy' : 'Countdown Quiz'}</span>
        <span style="font-weight:700;color:var(--text);">${escHtml(quiz.name)}</span>
        <a href="#editor/${folderName}" class="btn btn-ghost btn-sm">✏️ Edit</a>`,
    });

    const hosts = { JEOPARDY: JeopardyHost, COUNTDOWN: CountdownHost };
    formatHost = hosts[quiz.format];

    if (!formatHost) {
      root.innerHTML = `<div class="page"><div class="alert alert-error">Unknown format: ${quiz.format}</div></div>`;
      return;
    }

    formatHost.mount(root, quiz, folderName, ctx);
  }

  function renderBuzzerRequiredScreen(check) {
    ctx.renderNavbar({ back: true, backLabel: 'Library', onBack: () => goto('#library') });
    root.innerHTML = `
    <div class="page page-narrow" style="padding-top:60px;text-align:center;">
      <div style="font-size:3rem;margin-bottom:16px;">🔌</div>
      <h1>Buzzer Required</h1>
      <p style="color:var(--text-muted);margin-bottom:24px;">
        This Countdown Quiz requires a buzzer display before it can be hosted.
      </p>
      <div class="card" style="text-align:left;">
        <h3>How to fix this:</h3>
        <ol style="padding-left:20px;line-height:2;">
          <li>Start the <strong>Trivia Night Buzzer</strong> application.</li>
          <li>Copy the <strong>Embed URL</strong> from its terminal output.</li>
          <li>Go to the quiz editor and paste it into the <strong>Buzzer Display</strong> section.</li>
          <li>Save the quiz, then try hosting again.</li>
        </ol>
      </div>
      <div class="btn-group" style="justify-content:center;margin-top:24px;">
        <a href="#library" class="btn btn-ghost">← Back to Library</a>
        <a href="#editor/${folderName}" class="btn btn-primary">✏️ Configure Buzzer</a>
      </div>
    </div>`;
  }

  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function unmount() {
    if (formatHost && formatHost.unmount) formatHost.unmount();
    formatHost = null;
  }

  return { mount, unmount };
})();
