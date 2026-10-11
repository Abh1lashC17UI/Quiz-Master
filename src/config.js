/**
 * src/config.js
 *
 * Reads and writes the QuizMaster application settings.
 * Settings are stored in: %APPDATA%\QuizMaster\settings.json
 * (or ~/.quizmaster/settings.json on non-Windows).
 *
 * Settings schema:
 * {
 *   "quizRootFolder": "C:\\Users\\Name\\TriviaQuizzes",
 *   "port": 4000
 * }
 */

'use strict';

const path = require('path');
const os   = require('os');
const fse  = require('fs-extra');

// ── Settings file location ────────────────────────────────────────────────────

function getSettingsDir() {
  const appData = process.env.APPDATA || os.homedir();
  return path.join(appData, 'QuizMaster');
}

function getSettingsPath() {
  return path.join(getSettingsDir(), 'settings.json');
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
  quizRootFolder: path.join(os.homedir(), 'TriviaQuizzes'),
  port: 4000,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load settings from disk. Returns defaults for any missing keys.
 * @returns {{ quizRootFolder: string, port: number }}
 */
function loadSettings() {
  const settingsPath = getSettingsPath();
  try {
    if (fse.existsSync(settingsPath)) {
      const raw = fse.readJsonSync(settingsPath);
      return { ...DEFAULTS, ...raw };
    }
  } catch (err) {
    console.warn('[Config] Failed to read settings, using defaults:', err.message);
  }
  return { ...DEFAULTS };
}

/**
 * Save settings to disk. Merges with existing settings.
 * @param {object} updates
 */
function saveSettings(updates) {
  const settingsPath = getSettingsPath();
  fse.ensureDirSync(getSettingsDir());
  const existing = loadSettings();
  const merged = { ...existing, ...updates };
  fse.writeJsonSync(settingsPath, merged, { spaces: 2 });
  return merged;
}

/**
 * Return the absolute path to the QuizMaster application directory
 * (the directory containing server.js).
 */
function getAppDir() {
  return path.resolve(__dirname, '..');
}

module.exports = { loadSettings, saveSettings, getAppDir, DEFAULTS };
