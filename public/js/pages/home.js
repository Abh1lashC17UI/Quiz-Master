/**
 * public/js/pages/home.js — Home screen
 */

const HomePage = (() => {
  function mount(root, param, ctx) {
    ctx.renderNavbar({});
    root.innerHTML = `
      <div class="page">
        <div style="text-align:center; padding-top: 48px;">
          <div style="font-size:3rem; margin-bottom:8px;">🎯</div>
          <h1 style="font-size:2.2rem; margin-bottom:6px;">QuizMaster</h1>
          <p style="color:var(--text-muted); margin-bottom:48px;">Local trivia quiz maker &amp; hoster</p>
        </div>
        <div class="home-grid" style="max-width:860px; margin:0 auto;">
          <a class="home-btn" href="#create">
            <div class="home-btn-icon">➕</div>
            <div class="home-btn-label">Create New Quiz</div>
            <div class="home-btn-sub">Start a Jeopardy or Countdown Quiz</div>
          </a>
          <a class="home-btn" href="#library">
            <div class="home-btn-icon">📚</div>
            <div class="home-btn-label">Quiz Library</div>
            <div class="home-btn-sub">Open, edit, or host your quizzes</div>
          </a>
          <a class="home-btn" href="#settings">
            <div class="home-btn-icon">⚙️</div>
            <div class="home-btn-label">Settings</div>
            <div class="home-btn-sub">Configure quiz folder and options</div>
          </a>
        </div>
      </div>`;
  }

  function unmount() {}
  return { mount, unmount };
})();
