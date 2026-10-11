/**
 * src/formats/countdown.js
 *
 * Countdown Quiz format descriptor and validator.
 *
 * Key rule: Countdown quizzes CAN be created and saved without a buzzer
 * embed URL. But they CANNOT be hosted without one.
 * This is enforced separately at the host-launch endpoint.
 */

'use strict';

const label = 'Countdown Quiz';
const description = 'Timed questions with countdown timer. Requires a buzzer display for hosting.';
const requiresBuzzerForHosting = true;

/**
 * Validate a Countdown Quiz for completion.
 * NOTE: Does NOT require a buzzer embed — that is only required for HOSTING.
 * @param {object} quiz
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(quiz) {
  const errors = [];

  if (!quiz.name || !quiz.name.trim()) {
    errors.push('Quiz must have a name.');
  }

  const questions = quiz.questions || [];
  if (questions.length === 0) {
    errors.push('Countdown Quiz must have at least one question.');
  }

  questions.forEach((q, i) => {
    const qLabel = `Question ${i + 1}`;
    if (!q.question || !q.question.trim()) {
      errors.push(`${qLabel}: question text is required.`);
    }
    if (!q.answer || !q.answer.trim()) {
      errors.push(`${qLabel}: answer is required.`);
    }
    if (q.timeLimitSeconds !== null && q.timeLimitSeconds !== undefined) {
      const t = Number(q.timeLimitSeconds);
      if (!Number.isInteger(t) || t < 5 || t > 600) {
        errors.push(`${qLabel}: timer override must be between 5 and 600 seconds.`);
      }
    }
  });

  // Validate default timer if set
  const defaultTimer = quiz.settings && quiz.settings.defaultTimerSeconds;
  if (defaultTimer !== undefined && defaultTimer !== null) {
    const t = Number(defaultTimer);
    if (!Number.isInteger(t) || t < 5 || t > 600) {
      errors.push('Default timer must be between 5 and 600 seconds.');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a Countdown Quiz has a buzzer embed configured.
 * Used by the host-launch check (separate from completion validation).
 */
function hasBuzzerEmbed(quiz) {
  return !!(quiz.buzzer && quiz.buzzer.embedUrl && quiz.buzzer.embedUrl.trim());
}

module.exports = { label, description, requiresBuzzerForHosting, validate, hasBuzzerEmbed };
