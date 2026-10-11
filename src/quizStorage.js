/**
 * src/quizStorage.js
 *
 * All filesystem operations for quiz data.
 *
 * Each quiz lives in its own subfolder under the root quiz folder:
 *   <root>/<quiz-folder-name>/quiz.json
 *   <root>/<quiz-folder-name>/media/
 *
 * The quiz.json file is the source of truth.
 * UUIDs are generated server-side and never change after creation.
 */

'use strict';

const path   = require('path');
const fse    = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sanitise a quiz name into a safe folder name.
 * Removes characters that are problematic on Windows file systems.
 */
function toFolderName(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .substring(0, 80) || 'Quiz';
}

/**
 * Given the root folder and a desired folder name, return a unique folder path
 * (appends _2, _3 etc. if the name already exists).
 */
function uniqueFolderPath(rootFolder, baseName) {
  let candidate = path.join(rootFolder, baseName);
  if (!fse.existsSync(candidate)) return candidate;
  let i = 2;
  while (fse.existsSync(path.join(rootFolder, `${baseName}_${i}`))) i++;
  return path.join(rootFolder, `${baseName}_${i}`);
}

/**
 * Build the quiz directory path from the quiz's own folderName field.
 */
function quizDir(rootFolder, quiz) {
  return path.join(rootFolder, quiz.folderName);
}

// ── Default structures ────────────────────────────────────────────────────────

function newJeopardyStage(overrides = {}) {
  return {
    id: uuidv4(),
    name: 'Round 1',
    order: 0,
    categories: [],
    stageSolution: {
      enabled: false,
      title: '',
      explanation: '',
      mediaFile: null,
      points: 0,
    },
    ...overrides,
  };
}

function newJeopardyCategory(overrides = {}) {
  return {
    id: uuidv4(),
    name: 'Category',
    order: 0,
    questions: [],
    ...overrides,
  };
}

function newJeopardyQuestion(overrides = {}) {
  return {
    id: uuidv4(),
    order: 0,
    question: '',
    answer: '',
    additionalInfo: '',
    points: 100,
    isSpecial: false,
    specialLabel: '',
    mediaFile: null,
    answerMediaFile: null,
    hostNotes: '',
    ...overrides,
  };
}

function newCountdownQuestion(overrides = {}) {
  return {
    id: uuidv4(),
    order: 0,
    question: '',
    answer: '',
    explanation: '',
    timeLimitSeconds: null,
    mediaFile: null,
    answerMediaFile: null,
    hostNotes: '',
    ...overrides,
  };
}

function newQuiz(name, format) {
  const now = new Date().toISOString();
  const base = {
    id: uuidv4(),
    name,
    format,
    complete: false,
    createdAt: now,
    updatedAt: now,
    settings: {},
    buzzer: {
      required: format === 'COUNTDOWN',
      embedUrl: '',
    },
    stages: [],
  };

  if (format === 'JEOPARDY') {
    base.settings = {};
    // Start with one empty stage
    base.stages = [newJeopardyStage({ name: 'Round 1', order: 0 })];
  } else if (format === 'COUNTDOWN') {
    base.settings = { defaultTimerSeconds: 30 };
    base.stages = [];
    base.questions = [];
  }

  return base;
}

// ── Core CRUD ─────────────────────────────────────────────────────────────────

/**
 * List all quizzes in the root folder.
 * Returns an array of quiz summary objects (not full quiz data).
 */
async function listQuizzes(rootFolder) {
  await fse.ensureDir(rootFolder);
  const entries = await fse.readdir(rootFolder, { withFileTypes: true });
  const quizzes = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const quizFile = path.join(rootFolder, entry.name, 'quiz.json');
    if (!await fse.pathExists(quizFile)) continue;

    try {
      const quiz = await fse.readJson(quizFile);
      // Return summary fields only
      quizzes.push({
        id: quiz.id,
        name: quiz.name,
        format: quiz.format,
        complete: quiz.complete,
        createdAt: quiz.createdAt,
        updatedAt: quiz.updatedAt,
        folderName: entry.name,
        stageCount: (quiz.stages || []).length,
        questionCount: countQuestions(quiz),
        buzzerConfigured: !!(quiz.buzzer && quiz.buzzer.embedUrl),
      });
    } catch (err) {
      console.warn(`[Storage] Skipping malformed quiz at ${entry.name}:`, err.message);
    }
  }

  // Sort by updatedAt descending (most recent first)
  quizzes.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return quizzes;
}

function countQuestions(quiz) {
  if (quiz.format === 'COUNTDOWN') {
    return (quiz.questions || []).length;
  }
  let count = 0;
  for (const stage of (quiz.stages || [])) {
    for (const cat of (stage.categories || [])) {
      count += (cat.questions || []).length;
    }
  }
  return count;
}

/**
 * Load a full quiz by its folder name.
 */
async function loadQuiz(rootFolder, folderName) {
  const quizFile = path.join(rootFolder, folderName, 'quiz.json');
  if (!await fse.pathExists(quizFile)) {
    throw new Error(`Quiz not found: ${folderName}`);
  }
  const quiz = await fse.readJson(quizFile);
  quiz.folderName = folderName; // attach folder name as runtime property
  return quiz;
}

/**
 * Save a quiz (full quiz object). Updates updatedAt.
 * Does NOT save folderName into quiz.json (it's a runtime property).
 */
async function saveQuiz(rootFolder, folderName, quiz) {
  const dir = path.join(rootFolder, folderName);
  await fse.ensureDir(path.join(dir, 'media'));

  const toWrite = { ...quiz };
  delete toWrite.folderName; // don't persist runtime property
  toWrite.updatedAt = new Date().toISOString();

  const quizFile = path.join(dir, 'quiz.json');
  // Atomic write: write to temp file then rename
  const tmpFile = quizFile + '.tmp';
  await fse.writeJson(tmpFile, toWrite, { spaces: 2 });
  await fse.move(tmpFile, quizFile, { overwrite: true });

  return toWrite;
}

/**
 * Create a new quiz folder and quiz.json.
 * Returns { quiz, folderName }.
 */
async function createQuiz(rootFolder, name, format) {
  await fse.ensureDir(rootFolder);
  const baseName = toFolderName(name);
  const dir = uniqueFolderPath(rootFolder, baseName);
  const folderName = path.basename(dir);

  await fse.ensureDir(path.join(dir, 'media'));

  const quiz = newQuiz(name, format);
  const quizFile = path.join(dir, 'quiz.json');
  await fse.writeJson(quizFile, quiz, { spaces: 2 });

  return { quiz: { ...quiz, folderName }, folderName };
}

/**
 * Delete a quiz folder permanently.
 */
async function deleteQuiz(rootFolder, folderName) {
  const dir = path.join(rootFolder, folderName);
  if (!await fse.pathExists(dir)) {
    throw new Error(`Quiz folder not found: ${folderName}`);
  }
  await fse.remove(dir);
}

/**
 * Duplicate a quiz: copy folder, assign new UUIDs to all elements.
 */
async function duplicateQuiz(rootFolder, sourceFolderName, newName) {
  const sourceDir = path.join(rootFolder, sourceFolderName);
  const sourceQuizFile = path.join(sourceDir, 'quiz.json');

  if (!await fse.pathExists(sourceQuizFile)) {
    throw new Error(`Source quiz not found: ${sourceFolderName}`);
  }

  const sourceQuiz = await fse.readJson(sourceQuizFile);
  const baseName = toFolderName(newName);
  const destDir = uniqueFolderPath(rootFolder, baseName);
  const destFolderName = path.basename(destDir);

  // Copy folder (including media)
  await fse.copy(sourceDir, destDir);

  // Reassign all UUIDs and update metadata
  const newQuizData = deepReassignIds(sourceQuiz);
  newQuizData.name = newName;
  newQuizData.complete = false;
  newQuizData.createdAt = new Date().toISOString();
  newQuizData.updatedAt = new Date().toISOString();

  const destQuizFile = path.join(destDir, 'quiz.json');
  await fse.writeJson(destQuizFile, newQuizData, { spaces: 2 });

  return { quiz: { ...newQuizData, folderName: destFolderName }, folderName: destFolderName };
}

/**
 * Recursively reassign all `id` fields in a quiz object.
 * Media file references are kept as-is (files were already copied).
 */
function deepReassignIds(quiz) {
  const clone = JSON.parse(JSON.stringify(quiz));
  clone.id = uuidv4();

  if (Array.isArray(clone.stages)) {
    clone.stages = clone.stages.map((stage) => {
      stage.id = uuidv4();
      if (Array.isArray(stage.categories)) {
        stage.categories = stage.categories.map((cat) => {
          cat.id = uuidv4();
          if (Array.isArray(cat.questions)) {
            cat.questions = cat.questions.map((q) => {
              q.id = uuidv4();
              return q;
            });
          }
          return cat;
        });
      }
      return stage;
    });
  }

  if (Array.isArray(clone.questions)) {
    clone.questions = clone.questions.map((q) => {
      q.id = uuidv4();
      return q;
    });
  }

  return clone;
}

// ── Exported helpers for building quiz elements ───────────────────────────────

module.exports = {
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
  countQuestions,
};
