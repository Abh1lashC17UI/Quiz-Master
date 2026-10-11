/**
 * tests/validation.test.js
 *
 * Automated tests for quiz validation logic.
 * Run: node tests/validation.test.js
 */

'use strict';

const { validateQuiz }   = require('../src/formats/registry');
const { hasBuzzerEmbed } = require('../src/formats/countdown');
const {
  newJeopardyStage, newJeopardyCategory, newJeopardyQuestion,
  newCountdownQuestion,
} = require('../src/quizStorage');

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJeopardyQuiz(overrides = {}) {
  const stage = newJeopardyStage({ name: 'Round 1' });
  const cat   = newJeopardyCategory({ name: 'Category A' });
  const q     = newJeopardyQuestion({ question: 'Q?', answer: 'A', points: 100 });
  cat.questions.push(q);
  stage.categories.push(cat);
  return {
    id: 'test-id', name: 'Test Quiz', format: 'JEOPARDY',
    complete: false, stages: [stage], ...overrides,
  };
}

function makeCountdownQuiz(overrides = {}) {
  const q = newCountdownQuestion({ question: 'Q?', answer: 'A' });
  return {
    id: 'test-id', name: 'Test Quiz', format: 'COUNTDOWN',
    complete: false, questions: [q],
    settings: { defaultTimerSeconds: 30 },
    buzzer: { required: true, embedUrl: '' },
    ...overrides,
  };
}

// ── Jeopardy tests ────────────────────────────────────────────────────────────

test('JEOPARDY — valid quiz passes', () => {
  const { valid, errors } = validateQuiz(makeJeopardyQuiz());
  assert(valid, 'Valid jeopardy quiz should pass');
  assertEqual(errors.length, 0, 'No errors');
});

test('JEOPARDY — missing name fails', () => {
  const { valid, errors } = validateQuiz(makeJeopardyQuiz({ name: '' }));
  assert(!valid, 'Should fail without name');
  assert(errors.some(e => e.includes('name')), 'Error mentions name');
});

test('JEOPARDY — no stages fails', () => {
  const { valid, errors } = validateQuiz(makeJeopardyQuiz({ stages: [] }));
  assert(!valid, 'Should fail with no stages');
  assert(errors.some(e => e.includes('stage')), 'Error mentions stage');
});

test('JEOPARDY — stage with no categories fails', () => {
  const stage = newJeopardyStage({ name: 'Empty Stage' });
  stage.categories = [];
  const { valid, errors } = validateQuiz(makeJeopardyQuiz({ stages: [stage] }));
  assert(!valid, 'Should fail with empty stage');
  assert(errors.some(e => e.includes('category')), 'Error mentions category');
});

test('JEOPARDY — category with no questions fails', () => {
  const stage = newJeopardyStage({ name: 'Stage' });
  const cat   = newJeopardyCategory({ name: 'Empty Cat' });
  cat.questions = [];
  stage.categories.push(cat);
  const { valid } = validateQuiz(makeJeopardyQuiz({ stages: [stage] }));
  assert(!valid, 'Should fail with empty category');
});

test('JEOPARDY — question without answer fails', () => {
  const stage = newJeopardyStage({ name: 'Stage' });
  const cat   = newJeopardyCategory({ name: 'Cat' });
  const q     = newJeopardyQuestion({ question: 'Q?', answer: '', points: 100 });
  cat.questions.push(q);
  stage.categories.push(cat);
  const { valid, errors } = validateQuiz(makeJeopardyQuiz({ stages: [stage] }));
  assert(!valid, 'Should fail without answer');
  assert(errors.some(e => e.includes('answer')), 'Error mentions answer');
});

test('JEOPARDY — question without text fails', () => {
  const stage = newJeopardyStage({ name: 'Stage' });
  const cat   = newJeopardyCategory({ name: 'Cat' });
  const q     = newJeopardyQuestion({ question: '', answer: 'A', points: 100 });
  cat.questions.push(q);
  stage.categories.push(cat);
  const { valid } = validateQuiz(makeJeopardyQuiz({ stages: [stage] }));
  assert(!valid, 'Should fail without question text');
});

test('JEOPARDY — negative points fails', () => {
  const stage = newJeopardyStage({ name: 'Stage' });
  const cat   = newJeopardyCategory({ name: 'Cat' });
  const q     = newJeopardyQuestion({ question: 'Q?', answer: 'A', points: -50 });
  cat.questions.push(q);
  stage.categories.push(cat);
  const { valid } = validateQuiz(makeJeopardyQuiz({ stages: [stage] }));
  assert(!valid, 'Should fail with negative points');
});

test('JEOPARDY — multiple stages valid', () => {
  const makeStage = (name) => {
    const stage = newJeopardyStage({ name });
    const cat   = newJeopardyCategory({ name: 'Cat' });
    cat.questions.push(newJeopardyQuestion({ question: 'Q?', answer: 'A', points: 100 }));
    stage.categories.push(cat);
    return stage;
  };
  const quiz = makeJeopardyQuiz({ stages: [makeStage('S1'), makeStage('S2'), makeStage('S3')] });
  const { valid } = validateQuiz(quiz);
  assert(valid, '3-stage quiz should be valid');
});

test('JEOPARDY — stage solution enabled but empty fails', () => {
  const stage = newJeopardyStage({ name: 'Stage' });
  const cat   = newJeopardyCategory({ name: 'Cat' });
  cat.questions.push(newJeopardyQuestion({ question: 'Q?', answer: 'A', points: 100 }));
  stage.categories.push(cat);
  stage.stageSolution = { enabled: true, title: '', explanation: '', mediaFile: null };
  const { valid, errors } = validateQuiz(makeJeopardyQuiz({ stages: [stage] }));
  assert(!valid, 'Should fail with empty stage solution');
  assert(errors.some(e => e.includes('solution')), 'Error mentions solution');
});

test('JEOPARDY — stage solution enabled with title is OK', () => {
  const stage = newJeopardyStage({ name: 'Stage' });
  const cat   = newJeopardyCategory({ name: 'Cat' });
  cat.questions.push(newJeopardyQuestion({ question: 'Q?', answer: 'A', points: 100 }));
  stage.categories.push(cat);
  stage.stageSolution = { enabled: true, title: 'The Answer', explanation: '', mediaFile: null };
  const { valid } = validateQuiz(makeJeopardyQuiz({ stages: [stage] }));
  assert(valid, 'Stage solution with title should pass');
});

// ── Countdown tests ───────────────────────────────────────────────────────────

test('COUNTDOWN — valid quiz (no buzzer) passes completion', () => {
  const { valid, errors } = validateQuiz(makeCountdownQuiz());
  assert(valid, 'Countdown quiz without buzzer should pass completion validation');
  assertEqual(errors.length, 0, 'No errors');
});

test('COUNTDOWN — missing name fails', () => {
  const { valid } = validateQuiz(makeCountdownQuiz({ name: '' }));
  assert(!valid, 'Should fail without name');
});

test('COUNTDOWN — no questions fails', () => {
  const { valid } = validateQuiz(makeCountdownQuiz({ questions: [] }));
  assert(!valid, 'Should fail with no questions');
});

test('COUNTDOWN — question without answer fails', () => {
  const q = newCountdownQuestion({ question: 'Q?', answer: '' });
  const { valid } = validateQuiz(makeCountdownQuiz({ questions: [q] }));
  assert(!valid, 'Should fail without answer');
});

test('COUNTDOWN — invalid timer override fails', () => {
  const q = newCountdownQuestion({ question: 'Q?', answer: 'A', timeLimitSeconds: 2 });
  const { valid, errors } = validateQuiz(makeCountdownQuiz({ questions: [q] }));
  assert(!valid, 'Should fail with timer < 5s');
  assert(errors.some(e => e.includes('timer')), 'Error mentions timer');
});

test('COUNTDOWN — null timer override is valid (use default)', () => {
  const q = newCountdownQuestion({ question: 'Q?', answer: 'A', timeLimitSeconds: null });
  const { valid } = validateQuiz(makeCountdownQuiz({ questions: [q] }));
  assert(valid, 'Null timer override should be valid (uses default)');
});

test('COUNTDOWN — hasBuzzerEmbed returns false when empty', () => {
  const quiz = makeCountdownQuiz({ buzzer: { required: true, embedUrl: '' } });
  assert(!hasBuzzerEmbed(quiz), 'Empty embedUrl → no buzzer');
});

test('COUNTDOWN — hasBuzzerEmbed returns true when set', () => {
  const quiz = makeCountdownQuiz({ buzzer: { required: true, embedUrl: 'http://localhost:3000/embed/abc' } });
  assert(hasBuzzerEmbed(quiz), 'Set embedUrl → has buzzer');
});

test('COUNTDOWN — buzzer NOT required for completion validation', () => {
  const quiz = makeCountdownQuiz({ buzzer: { required: true, embedUrl: '' } });
  const { valid } = validateQuiz(quiz);
  assert(valid, 'Countdown quiz without buzzer embed should still be markable complete');
});

// ── Unknown format ────────────────────────────────────────────────────────────

test('Unknown format — returns error', () => {
  const { valid, errors } = validateQuiz({ format: 'FUTURE_FORMAT', name: 'Test' });
  assert(!valid, 'Unknown format should fail validation');
  assert(errors.some(e => e.includes('Unknown')), 'Error mentions unknown format');
});

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  QuizMaster — Validation Tests');
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
