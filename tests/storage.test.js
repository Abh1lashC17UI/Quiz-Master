/**
 * tests/storage.test.js
 *
 * Automated tests for quiz storage operations.
 * Run: node tests/storage.test.js
 */

'use strict';

const path = require('path');
const os   = require('os');
const fse  = require('fs-extra');

const {
  listQuizzes, loadQuiz, saveQuiz, createQuiz, deleteQuiz, duplicateQuiz,
  newJeopardyStage, newJeopardyCategory, newJeopardyQuestion, newCountdownQuestion,
  countQuestions,
} = require('../src/quizStorage');

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const TESTS = [];

function test(name, fn) { TESTS.push({ name, fn }); }

async function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function assertEqual(a, b, message) {
  if (a !== b) throw new Error(`${message} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

async function assertNotEqual(a, b, message) {
  if (a === b) throw new Error(`${message} — expected values to differ but both are ${JSON.stringify(a)}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('createQuiz — creates folder and quiz.json', async () => {
  const root = await makeTmpRoot();
  try {
    const { quiz, folderName } = await createQuiz(root, 'Test Quiz', 'JEOPARDY');
    assert(quiz.id, 'quiz has id');
    assert(quiz.name === 'Test Quiz', 'name is correct');
    assert(quiz.format === 'JEOPARDY', 'format is correct');
    assert(!quiz.complete, 'quiz starts incomplete');
    assert(folderName, 'folderName returned');

    const quizFile = path.join(root, folderName, 'quiz.json');
    assert(await fse.pathExists(quizFile), 'quiz.json exists');
    assert(await fse.pathExists(path.join(root, folderName, 'media')), 'media folder exists');
  } finally { await fse.remove(root); }
});

test('createQuiz COUNTDOWN — has questions array', async () => {
  const root = await makeTmpRoot();
  try {
    const { quiz } = await createQuiz(root, 'Countdown Test', 'COUNTDOWN');
    assert(Array.isArray(quiz.questions), 'COUNTDOWN quiz has questions array');
    assert(quiz.buzzer.required, 'COUNTDOWN quiz has buzzer.required = true');
    assert(quiz.settings.defaultTimerSeconds === 30, 'default timer is 30');
  } finally { await fse.remove(root); }
});

test('loadQuiz — round-trip save and load', async () => {
  const root = await makeTmpRoot();
  try {
    const { quiz, folderName } = await createQuiz(root, 'Round Trip', 'JEOPARDY');
    quiz.name = 'Modified Name';
    const saved = await saveQuiz(root, folderName, quiz);
    assertEqual(saved.name, 'Modified Name', 'saved name');

    const loaded = await loadQuiz(root, folderName);
    assertEqual(loaded.name, 'Modified Name', 'loaded name');
    assertEqual(loaded.id, quiz.id, 'ID preserved');
  } finally { await fse.remove(root); }
});

test('UUID stability — saving does not change question IDs', async () => {
  const root = await makeTmpRoot();
  try {
    const { quiz, folderName } = await createQuiz(root, 'UUID Test', 'JEOPARDY');
    const stage = quiz.stages[0];
    const cat = newJeopardyCategory({ name: 'Cat A', order: 0 });
    const q1  = newJeopardyQuestion({ question: 'Q1?', answer: 'A1', points: 100 });
    const q2  = newJeopardyQuestion({ question: 'Q2?', answer: 'A2', points: 200 });
    cat.questions.push(q1, q2);
    stage.categories.push(cat);

    const originalQ1Id = q1.id;
    const originalQ2Id = q2.id;

    await saveQuiz(root, folderName, quiz);
    const loaded = await loadQuiz(root, folderName);

    const loadedQ1 = loaded.stages[0].categories[0].questions[0];
    const loadedQ2 = loaded.stages[0].categories[0].questions[1];

    assertEqual(loadedQ1.id, originalQ1Id, 'Q1 UUID preserved after save/load');
    assertEqual(loadedQ2.id, originalQ2Id, 'Q2 UUID preserved after save/load');
  } finally { await fse.remove(root); }
});

test('UUID stability — reordering does not change question IDs', async () => {
  const root = await makeTmpRoot();
  try {
    const { quiz, folderName } = await createQuiz(root, 'Reorder Test', 'JEOPARDY');
    const stage = quiz.stages[0];
    const cat = newJeopardyCategory({ name: 'Cat', order: 0 });
    const q1 = newJeopardyQuestion({ question: 'Q1?', answer: 'A1', points: 100 });
    const q2 = newJeopardyQuestion({ question: 'Q2?', answer: 'A2', points: 200 });
    cat.questions.push(q1, q2);
    stage.categories.push(cat);

    const id1 = q1.id, id2 = q2.id;

    // Reorder
    [cat.questions[0], cat.questions[1]] = [cat.questions[1], cat.questions[0]];

    await saveQuiz(root, folderName, quiz);
    const loaded = await loadQuiz(root, folderName);

    // IDs should be the same, just in different positions
    const ids = loaded.stages[0].categories[0].questions.map(q => q.id);
    assert(ids.includes(id1), 'Q1 UUID still present after reorder');
    assert(ids.includes(id2), 'Q2 UUID still present after reorder');
    assertEqual(ids[0], id2, 'Q2 is now first');
    assertEqual(ids[1], id1, 'Q1 is now second');
  } finally { await fse.remove(root); }
});

test('duplicateQuiz — new UUIDs for all elements', async () => {
  const root = await makeTmpRoot();
  try {
    const { quiz, folderName } = await createQuiz(root, 'Original', 'JEOPARDY');
    const stage = quiz.stages[0];
    const cat = newJeopardyCategory({ name: 'Cat A', order: 0 });
    const q   = newJeopardyQuestion({ question: 'Q?', answer: 'A', points: 100 });
    cat.questions.push(q);
    stage.categories.push(cat);
    await saveQuiz(root, folderName, quiz);

    const { quiz: dupe, folderName: dupeFn } = await duplicateQuiz(root, folderName, 'Duplicate');

    assertNotEqual(dupe.id, quiz.id, 'Quiz ID differs');
    assertNotEqual(dupe.stages[0].id, stage.id, 'Stage ID differs');
    assertNotEqual(dupe.stages[0].categories[0].id, cat.id, 'Category ID differs');
    assertNotEqual(dupe.stages[0].categories[0].questions[0].id, q.id, 'Question ID differs');
    assertEqual(dupe.name, 'Duplicate', 'Name is new name');
    assert(!dupe.complete, 'Duplicate starts incomplete');
  } finally { await fse.remove(root); }
});

test('listQuizzes — returns quiz summaries', async () => {
  const root = await makeTmpRoot();
  try {
    await createQuiz(root, 'Quiz A', 'JEOPARDY');
    await createQuiz(root, 'Quiz B', 'COUNTDOWN');

    const list = await listQuizzes(root);
    assertEqual(list.length, 2, 'Two quizzes listed');
    const names = list.map(q => q.name);
    assert(names.includes('Quiz A'), 'Quiz A in list');
    assert(names.includes('Quiz B'), 'Quiz B in list');
  } finally { await fse.remove(root); }
});

test('deleteQuiz — removes folder', async () => {
  const root = await makeTmpRoot();
  try {
    const { folderName } = await createQuiz(root, 'To Delete', 'JEOPARDY');
    const dir = path.join(root, folderName);
    assert(await fse.pathExists(dir), 'Folder exists before delete');
    await deleteQuiz(root, folderName);
    assert(!(await fse.pathExists(dir)), 'Folder gone after delete');
  } finally { await fse.remove(root); }
});

test('countQuestions — Jeopardy', async () => {
  const { quiz } = await createQuiz(await makeTmpRoot(), 'Count Test', 'JEOPARDY');
  const stage = quiz.stages[0];
  const cat = newJeopardyCategory({});
  cat.questions.push(newJeopardyQuestion({}), newJeopardyQuestion({}), newJeopardyQuestion({}));
  stage.categories.push(cat);
  assertEqual(countQuestions(quiz), 3, 'Jeopardy question count');
});

test('countQuestions — Countdown', async () => {
  const root = await makeTmpRoot();
  const { quiz } = await createQuiz(root, 'Count Test', 'COUNTDOWN');
  quiz.questions.push(newCountdownQuestion({}), newCountdownQuestion({}));
  assertEqual(countQuestions(quiz), 2, 'Countdown question count');
  await fse.remove(root);
});

test('saveQuiz — atomic write (tmp file)', async () => {
  const root = await makeTmpRoot();
  try {
    const { quiz, folderName } = await createQuiz(root, 'Atomic', 'JEOPARDY');
    const dir = path.join(root, folderName);
    quiz.name = 'Atomic Updated';
    await saveQuiz(root, folderName, quiz);

    // Ensure no stray .tmp file
    const tmpFile = path.join(dir, 'quiz.json.tmp');
    assert(!(await fse.pathExists(tmpFile)), 'No stray .tmp file after save');
  } finally { await fse.remove(root); }
});

// ── Runner ────────────────────────────────────────────────────────────────────

async function makeTmpRoot() {
  const tmp = path.join(os.tmpdir(), `qm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fse.ensureDir(tmp);
  return tmp;
}

async function run() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  QuizMaster — Storage Tests');
  console.log('══════════════════════════════════════════════\n');

  for (const t of TESTS) {
    try {
      await t.fn();
      console.log(`  ✓  ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗  ${t.name}`);
      console.error(`     ${err.message}`);
      failed++;
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

run();
