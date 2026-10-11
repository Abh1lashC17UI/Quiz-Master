/**
 * public/js/api.js
 *
 * Centralised API client for all QuizMaster server calls.
 * Wraps fetch() with consistent error handling and JSON parsing.
 */

const API = (() => {
  const BASE = '';

  async function request(method, url, body, isFormData = false) {
    const opts = { method, headers: {} };
    if (body && !isFormData) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (isFormData) {
      opts.body = body; // FormData — let browser set Content-Type
    }

    let res;
    try {
      res = await fetch(BASE + url, opts);
    } catch (err) {
      throw new Error(`Network error: ${err.message}`);
    }

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const json = await res.json();
        errMsg = json.error || json.message || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    // No-content responses
    if (res.status === 204) return null;

    return res.json();
  }

  return {
    get:    (url)            => request('GET',    url),
    post:   (url, body)      => request('POST',   url, body),
    put:    (url, body)      => request('PUT',    url, body),
    delete: (url)            => request('DELETE', url),
    upload: (url, formData)  => request('POST',   url, formData, true),

    // Convenience: settings
    getSettings:  ()       => request('GET',  '/api/settings'),
    saveSettings: (data)   => request('POST', '/api/settings', data),
    browseFolder: ()       => request('POST', '/api/browse-folder'),

    // Convenience: quizzes
    listQuizzes:      ()                    => request('GET',  '/api/quizzes'),
    getQuiz:          (fn)                  => request('GET',  `/api/quizzes/${encodeURIComponent(fn)}`),
    createQuiz:       (name, format)        => request('POST', '/api/quizzes', { name, format }),
    saveQuiz:         (fn, quiz)            => request('PUT',  `/api/quizzes/${encodeURIComponent(fn)}`, quiz),
    deleteQuiz:       (fn)                  => request('DELETE',`/api/quizzes/${encodeURIComponent(fn)}`),
    duplicateQuiz:    (fn, newName)         => request('POST', `/api/quizzes/${encodeURIComponent(fn)}/duplicate`, { newName }),
    validateQuiz:     (fn)                  => request('POST', `/api/quizzes/${encodeURIComponent(fn)}/validate`),
    markComplete:     (fn)                  => request('POST', `/api/quizzes/${encodeURIComponent(fn)}/complete`),
    markIncomplete:   (fn)                  => request('POST', `/api/quizzes/${encodeURIComponent(fn)}/incomplete`),
    hostCheck:        (fn)                  => request('GET',  `/api/quizzes/${encodeURIComponent(fn)}/host-check`),

    // Media
    uploadMedia: (fn, file) => {
      const fd = new FormData();
      fd.append('file', file);
      return request('POST', `/api/quizzes/${encodeURIComponent(fn)}/media`, fd, true);
    },
    mediaUrl: (fn, relPath) => {
      const filename = relPath.replace('media/', '');
      return `/api/quizzes/${encodeURIComponent(fn)}/media/${encodeURIComponent(filename)}`;
    },

    // Host session
    getHostSession:    (qid) => request('GET',    `/api/quizzes/${qid}/host-session`),
    saveHostSession:   (qid, data) => request('POST', `/api/quizzes/${qid}/host-session`, data),
    resetHostSession:  (qid) => request('DELETE', `/api/quizzes/${qid}/host-session`),

    // Element factories
    newStage:    (data) => request('POST', '/api/new-stage',    data || {}),
    newCategory: (data) => request('POST', '/api/new-category', data || {}),
    newQuestion: (data) => request('POST', '/api/new-question', data || {}),

    // Launcher regeneration
    regenerateLaunchers: () => request('POST', '/api/regenerate-launchers'),

    // Formats
    getFormats: () => request('GET', '/api/formats'),
  };
})();
