/**
 * server.js
 *
 * QuizMaster — local trivia quiz maker and hoster.
 *
 * Routes:
 *   /                          → home (index.html SPA)
 *   /host/:quizId              → host UI (same SPA, hash routing handles it)
 *   /audience/:quizId          → audience display
 *   /api/*                     → REST API
 *
 * Usage:
 *   node server.js
 *   PORT=4000 node server.js
 */

'use strict';

const http    = require('http');
const path    = require('path');
const os      = require('os');
const express = require('express');
const multer  = require('multer');

const { loadSettings, saveSettings, getAppDir } = require('./src/config');
const { pickFolder }   = require('./src/folderPicker');
const {
  listQuizzes,
  loadQuiz,
  saveQuiz,
  createQuiz,
  deleteQuiz,
  duplicateQuiz,
  newJeopardyStage,
  newJeopardyCategory,
  newJeopardyQuestion,
  newCountdownQuestion,
} = require('./src/quizStorage');
const { importMedia, deleteMedia } = require('./src/mediaManager');
const { writeConf, generateLauncher, removeLauncher } = require('./src/launcher');
const { validateQuiz, requiresBuzzerForHosting, listFormats } = require('./src/formats/registry');
const { hasBuzzerEmbed } = require('./src/formats/countdown');

// ── Configuration ─────────────────────────────────────────────────────────────

const settings = loadSettings();
const PORT = parseInt(process.env.PORT || String(settings.port || 4000), 10);

// ── In-memory live session store ──────────────────────────────────────────────
// Maps quizId → live session state (never written to quiz.json)
const liveSessions = new Map();

function getOrCreateSession(quizId) {
  if (!liveSessions.has(quizId)) {
    liveSessions.set(quizId, {
      quizId,
      currentStageIndex: 0,
      currentQuestionId: null,
      answeredQuestions: [],   // array of question UUIDs
      revealedSolutions: [],   // array of stage IDs
      startedAt: new Date().toISOString(),
    });
  }
  return liveSessions.get(quizId);
}

// ── Multer (media uploads) ─────────────────────────────────────────────────────
// Store uploads in system temp dir; mediaManager copies to quiz folder
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '10mb' }));

// Serve static files from ./public
app.use(express.static(path.join(__dirname, 'public')));

// ── Helper: get current root folder ──────────────────────────────────────────

function rootFolder() {
  const s = loadSettings();
  return s.quizRootFolder;
}

// ── Helper: get quiz folder path ──────────────────────────────────────────────

function quizFolderPath(folderName) {
  const fse = require('fs-extra');
  return path.join(rootFolder(), folderName);
}

// ── API: Health ───────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), version: '1.0.0' });
});

// ── API: Formats ──────────────────────────────────────────────────────────────

app.get('/api/formats', (req, res) => {
  res.json(listFormats());
});

// ── API: Settings ─────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(loadSettings());
});

app.post('/api/settings', async (req, res) => {
  try {
    const updates = req.body;
    const saved = saveSettings(updates);

    // Refresh quizmaster.conf if root folder changed
    if (updates.quizRootFolder) {
      await writeConf(updates.quizRootFolder, getAppDir());
    }

    res.json({ ok: true, settings: saved });
  } catch (err) {
    console.error('[Settings] Save failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/browse-folder', async (req, res) => {
  try {
    const result = await pickFolder('Select Quiz Root Folder');
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, fallback: true, error: err.message });
  }
});

// ── API: Quiz Library ─────────────────────────────────────────────────────────

app.get('/api/quizzes', async (req, res) => {
  try {
    const quizzes = await listQuizzes(rootFolder());
    res.json(quizzes);
  } catch (err) {
    console.error('[Quizzes] List failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes', async (req, res) => {
  try {
    const { name, format } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!['JEOPARDY', 'COUNTDOWN'].includes(format)) {
      return res.status(400).json({ error: 'Invalid format.' });
    }
    const { quiz, folderName } = await createQuiz(rootFolder(), name.trim(), format);
    res.json({ quiz, folderName });
  } catch (err) {
    console.error('[Quizzes] Create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Single Quiz ──────────────────────────────────────────────────────────

app.get('/api/quizzes/:folderName', async (req, res) => {
  try {
    const quiz = await loadQuiz(rootFolder(), req.params.folderName);
    res.json(quiz);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.put('/api/quizzes/:folderName', async (req, res) => {
  try {
    const quiz = req.body;
    if (!quiz || !quiz.id) return res.status(400).json({ error: 'Invalid quiz data.' });
    const saved = await saveQuiz(rootFolder(), req.params.folderName, quiz);
    res.json({ ok: true, quiz: saved });
  } catch (err) {
    console.error('[Quizzes] Save failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quizzes/:folderName', async (req, res) => {
  try {
    await deleteQuiz(rootFolder(), req.params.folderName);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Quizzes] Delete failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Duplicate ────────────────────────────────────────────────────────────

app.post('/api/quizzes/:folderName/duplicate', async (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName || !newName.trim()) return res.status(400).json({ error: 'newName is required.' });
    const { quiz, folderName } = await duplicateQuiz(rootFolder(), req.params.folderName, newName.trim());
    res.json({ ok: true, quiz, folderName });
  } catch (err) {
    console.error('[Quizzes] Duplicate failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Validate ─────────────────────────────────────────────────────────────

app.post('/api/quizzes/:folderName/validate', async (req, res) => {
  try {
    const quiz = await loadQuiz(rootFolder(), req.params.folderName);
    const result = validateQuiz(quiz);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Mark Complete / Incomplete ──────────────────────────────────────────

app.post('/api/quizzes/:folderName/complete', async (req, res) => {
  try {
    const folderName = req.params.folderName;
    const quiz = await loadQuiz(rootFolder(), folderName);

    // Validate before marking complete
    const validation = validateQuiz(quiz);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        error: 'Quiz has validation errors.',
        errors: validation.errors,
      });
    }

    quiz.complete = true;
    const saved = await saveQuiz(rootFolder(), folderName, quiz);

    // Generate launcher files
    const quizDir = path.join(rootFolder(), folderName);
    const s = loadSettings();
    await writeConf(rootFolder(), getAppDir());
    await generateLauncher(quizDir, quiz.id, quiz.name, s.port || 4000);

    res.json({ ok: true, quiz: saved });
  } catch (err) {
    console.error('[Complete] Failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quizzes/:folderName/incomplete', async (req, res) => {
  try {
    const folderName = req.params.folderName;
    const quiz = await loadQuiz(rootFolder(), folderName);
    quiz.complete = false;
    const saved = await saveQuiz(rootFolder(), folderName, quiz);

    // Remove launcher (quiz is no longer complete)
    const quizDir = path.join(rootFolder(), folderName);
    await removeLauncher(quizDir);

    res.json({ ok: true, quiz: saved });
  } catch (err) {
    console.error('[Incomplete] Failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Regenerate all launchers (Settings page) ─────────────────────────────

app.post('/api/regenerate-launchers', async (req, res) => {
  try {
    const s = loadSettings();
    const root = s.quizRootFolder;
    await writeConf(root, getAppDir());

    const quizzes = await listQuizzes(root);
    let count = 0;
    for (const q of quizzes) {
      if (q.complete) {
        const quizDir = path.join(root, q.folderName);
        await generateLauncher(quizDir, q.id, q.name, s.port || 4000);
        count++;
      }
    }
    res.json({ ok: true, regenerated: count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Media ────────────────────────────────────────────────────────────────

app.post('/api/quizzes/:folderName/media', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const quizDir = path.join(rootFolder(), req.params.folderName);
    const relPath = await importMedia(quizDir, req.file.path, req.file.originalname);
    res.json({ ok: true, relPath });
  } catch (err) {
    console.error('[Media] Upload failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/quizzes/:folderName/media/:filename', (req, res) => {
  const fse = require('fs-extra');
  const filePath = path.join(rootFolder(), req.params.folderName, 'media', req.params.filename);
  if (!fse.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

app.delete('/api/quizzes/:folderName/media/:filename', async (req, res) => {
  try {
    const quizDir = path.join(rootFolder(), req.params.folderName);
    await deleteMedia(quizDir, `media/${req.params.filename}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Host Session (live state, never written to quiz.json) ────────────────

app.get('/api/quizzes/:quizId/host-session', (req, res) => {
  const session = getOrCreateSession(req.params.quizId);
  res.json(session);
});

app.post('/api/quizzes/:quizId/host-session', (req, res) => {
  const quizId = req.params.quizId;
  const current = getOrCreateSession(quizId);
  const updated = { ...current, ...req.body, quizId };
  liveSessions.set(quizId, updated);
  res.json(updated);
});

app.delete('/api/quizzes/:quizId/host-session', (req, res) => {
  liveSessions.delete(req.params.quizId);
  res.json({ ok: true });
});

// ── API: Check host requirements ──────────────────────────────────────────────

app.get('/api/quizzes/:folderName/host-check', async (req, res) => {
  try {
    const quiz = await loadQuiz(rootFolder(), req.params.folderName);
    const checks = {
      canHost: true,
      requiresBuzzer: requiresBuzzerForHosting(quiz.format),
      hasBuzzer: false,
      buzzerEmbedUrl: '',
      warnings: [],
    };

    if (quiz.buzzer && quiz.buzzer.embedUrl) {
      checks.hasBuzzer = true;
      checks.buzzerEmbedUrl = quiz.buzzer.embedUrl;
    }

    if (checks.requiresBuzzer && !checks.hasBuzzer) {
      checks.canHost = false;
      checks.warnings.push('This Countdown Quiz requires a buzzer display before it can be hosted.');
    }

    res.json(checks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Element helpers (server-side UUID generation) ────────────────────────

app.post('/api/new-stage', (req, res) => {
  res.json(newJeopardyStage(req.body || {}));
});

app.post('/api/new-category', (req, res) => {
  res.json(newJeopardyCategory(req.body || {}));
});

app.post('/api/new-question', (req, res) => {
  const { format, ...rest } = req.body || {};
  if (format === 'COUNTDOWN') {
    res.json(newCountdownQuestion(rest));
  } else {
    res.json(newJeopardyQuestion(rest));
  }
});

// ── SPA catch-all — serve index.html for all non-API routes ──────────────────
// Client-side router handles /host/:id etc.

app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server ──────────────────────────────────────────────────────────────

const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', async () => {
  const localIPs = getLocalIPs();
  const ip = localIPs[0] || 'localhost';

  // Write/refresh quizmaster.conf on startup
  try {
    const s = loadSettings();
    if (s.quizRootFolder) {
      await writeConf(s.quizRootFolder, getAppDir());
    }
  } catch (e) {
    // Non-fatal — conf will be written when root folder is first configured
  }

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║           QUIZMASTER — SERVER READY                  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  PORT : ${PORT}`);
  console.log('');
  console.log('  Open in your browser:');
  console.log(`    http://localhost:${PORT}`);
  if (localIPs.length > 0) {
    console.log('');
    console.log('  Local network addresses:');
    for (const addr of localIPs) {
      console.log(`    http://${addr}:${PORT}`);
    }
  }
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});

// ── Utility ───────────────────────────────────────────────────────────────────

function getLocalIPs() {
  const result = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        result.push(iface.address);
      }
    }
  }
  return result;
}

process.on('SIGTERM', () => {
  console.log('\nQuizMaster shutting down…');
  server.close(() => process.exit(0));
});
