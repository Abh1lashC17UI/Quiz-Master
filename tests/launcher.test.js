/**
 * tests/launcher.test.js
 *
 * Automated tests for launcher generation.
 * Run: node tests/launcher.test.js
 */

'use strict';

const path = require('path');
const os   = require('os');
const fse  = require('fs-extra');

const { writeConf, readConf, generateLauncher, removeLauncher, CONF_FILENAME, BAT_FILENAME } = require('../src/launcher');

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const TESTS = [];

function test(name, fn) { TESTS.push({ name, fn }); }

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(`${message} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

async function makeTmpDir() {
  const dir = path.join(os.tmpdir(), `qm-launch-test-${Date.now()}`);
  await fse.ensureDir(dir);
  return dir;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('writeConf — creates quizmaster.conf', async () => {
  const root = await makeTmpDir();
  try {
    await writeConf(root, 'C:\\QuizMaster');
    const confPath = path.join(root, CONF_FILENAME);
    assert(await fse.pathExists(confPath), 'quizmaster.conf exists');
    const content = await fse.readFile(confPath, 'utf8');
    assert(content.trim() === 'C:\\QuizMaster', 'conf contains correct path');
  } finally { await fse.remove(root); }
});

test('readConf — reads quizmaster.conf', async () => {
  const root = await makeTmpDir();
  try {
    await writeConf(root, 'D:\\My Quizzes\\QuizMaster');
    const result = await readConf(root);
    assertEqual(result, 'D:\\My Quizzes\\QuizMaster', 'readConf returns path');
  } finally { await fse.remove(root); }
});

test('readConf — returns null when missing', async () => {
  const root = await makeTmpDir();
  try {
    const result = await readConf(root);
    assert(result === null, 'readConf returns null when conf missing');
  } finally { await fse.remove(root); }
});

test('writeConf — overwrites existing conf', async () => {
  const root = await makeTmpDir();
  try {
    await writeConf(root, 'C:\\OldPath');
    await writeConf(root, 'C:\\NewPath');
    const result = await readConf(root);
    assertEqual(result, 'C:\\NewPath', 'conf updated to new path');
  } finally { await fse.remove(root); }
});

test('generateLauncher — creates LaunchQuiz.bat', async () => {
  const quizDir = await makeTmpDir();
  try {
    await generateLauncher(quizDir, 'test-uuid-1234', 'My Test Quiz', 4000);
    const batPath = path.join(quizDir, BAT_FILENAME);
    assert(await fse.pathExists(batPath), 'LaunchQuiz.bat exists');
  } finally { await fse.remove(quizDir); }
});

test('generateLauncher — bat contains quiz ID', async () => {
  const quizDir = await makeTmpDir();
  try {
    const quizId = 'specific-uuid-abcdef';
    await generateLauncher(quizDir, quizId, 'Test', 4000);
    const content = await fse.readFile(path.join(quizDir, BAT_FILENAME), 'utf8');
    assert(content.includes(quizId), 'BAT contains quiz ID');
  } finally { await fse.remove(quizDir); }
});

test('generateLauncher — bat references quizmaster.conf', async () => {
  const quizDir = await makeTmpDir();
  try {
    await generateLauncher(quizDir, 'uuid', 'Test', 4000);
    const content = await fse.readFile(path.join(quizDir, BAT_FILENAME), 'utf8');
    assert(content.includes(CONF_FILENAME), 'BAT references quizmaster.conf');
  } finally { await fse.remove(quizDir); }
});

test('generateLauncher — bat references one level up (..)', async () => {
  const quizDir = await makeTmpDir();
  try {
    await generateLauncher(quizDir, 'uuid', 'Test', 4000);
    const content = await fse.readFile(path.join(quizDir, BAT_FILENAME), 'utf8');
    // The conf path should be ../quizmaster.conf (one level up)
    assert(content.includes('%~dp0..\\'), 'BAT navigates one level up to find conf');
  } finally { await fse.remove(quizDir); }
});

test('generateLauncher — bat uses correct port', async () => {
  const quizDir = await makeTmpDir();
  try {
    await generateLauncher(quizDir, 'uuid', 'Test', 9999);
    const content = await fse.readFile(path.join(quizDir, BAT_FILENAME), 'utf8');
    assert(content.includes('9999'), 'BAT contains custom port');
  } finally { await fse.remove(quizDir); }
});

test('generateLauncher — bat opens correct host URL', async () => {
  const quizDir = await makeTmpDir();
  try {
    const quizId = 'my-quiz-uuid';
    await generateLauncher(quizDir, quizId, 'Test', 4000);
    const content = await fse.readFile(path.join(quizDir, BAT_FILENAME), 'utf8');
    // The bat stores the quiz ID in QUIZ_ID variable and uses it in the URL
    assert(content.includes(`set "QUIZ_ID=${quizId}"`), 'BAT sets QUIZ_ID variable');
    assert(content.includes('/host/%QUIZ_ID%'), 'BAT uses QUIZ_ID in host URL');
  } finally { await fse.remove(quizDir); }
});

test('generateLauncher — quiz name with special chars sanitised in comment', async () => {
  const quizDir = await makeTmpDir();
  try {
    // Should not throw even with special characters in name
    await generateLauncher(quizDir, 'uuid', 'Test & <Quiz> | Check', 4000);
    const batPath = path.join(quizDir, BAT_FILENAME);
    assert(await fse.pathExists(batPath), 'BAT created with special chars in name');
  } finally { await fse.remove(quizDir); }
});

test('removeLauncher — removes LaunchQuiz.bat', async () => {
  const quizDir = await makeTmpDir();
  try {
    await generateLauncher(quizDir, 'uuid', 'Test', 4000);
    await removeLauncher(quizDir);
    const batPath = path.join(quizDir, BAT_FILENAME);
    assert(!(await fse.pathExists(batPath)), 'BAT removed');
  } finally { await fse.remove(quizDir); }
});

test('removeLauncher — safe to call when bat does not exist', async () => {
  const quizDir = await makeTmpDir();
  try {
    // Should not throw
    await removeLauncher(quizDir);
    assert(true, 'removeLauncher is idempotent');
  } finally { await fse.remove(quizDir); }
});

test('launcher does not hard-code absolute QuizMaster path', async () => {
  const quizDir = await makeTmpDir();
  try {
    await generateLauncher(quizDir, 'uuid', 'Test', 4000);
    const content = await fse.readFile(path.join(quizDir, BAT_FILENAME), 'utf8');
    // The .bat should NOT contain any hard-coded Windows absolute paths like C:\...
    // It should read from quizmaster.conf instead
    const hardCodedPathMatch = content.match(/set "QUIZMASTER_DIR=[A-Z]:\\/);
    assert(!hardCodedPathMatch, 'BAT does not contain hard-coded absolute path — uses quizmaster.conf');
  } finally { await fse.remove(quizDir); }
});

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  QuizMaster — Launcher Tests');
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
