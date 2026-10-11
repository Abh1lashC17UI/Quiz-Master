/**
 * src/formats/jeopardy.js
 *
 * Jeopardy format descriptor and validator.
 */

'use strict';

const label = 'Jeopardy';
const description = 'Classic category-and-points board game. Multiple stages, categories, and questions with configurable point values.';
const requiresBuzzerForHosting = false;

/**
 * Validate a Jeopardy quiz for completion.
 * @param {object} quiz
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validate(quiz) {
  const errors = [];

  if (!quiz.name || !quiz.name.trim()) {
    errors.push('Quiz must have a name.');
  }

  const stages = quiz.stages || [];
  if (stages.length === 0) {
    errors.push('Jeopardy quiz must have at least one stage.');
  }

  stages.forEach((stage, si) => {
    const stageLabel = `Stage ${si + 1} ("${stage.name || 'unnamed'}")`;

    const categories = stage.categories || [];
    if (categories.length === 0) {
      errors.push(`${stageLabel}: must have at least one category.`);
    }

    categories.forEach((cat, ci) => {
      const catLabel = `${stageLabel} → Category ${ci + 1} ("${cat.name || 'unnamed'}")`;

      const questions = cat.questions || [];
      if (questions.length === 0) {
        errors.push(`${catLabel}: must have at least one question.`);
      }

      questions.forEach((q, qi) => {
        const qLabel = `${catLabel} → Q${qi + 1}`;
        if (!q.question || !q.question.trim()) {
          errors.push(`${qLabel}: question text is required.`);
        }
        if (!q.answer || !q.answer.trim()) {
          errors.push(`${qLabel}: answer is required.`);
        }
        if (typeof q.points !== 'number' || q.points < 0) {
          errors.push(`${qLabel}: points must be a non-negative number.`);
        }
      });
    });

    // Stage solution validation (if enabled)
    if (stage.stageSolution && stage.stageSolution.enabled) {
      if (!stage.stageSolution.title && !stage.stageSolution.mediaFile) {
        errors.push(`${stageLabel}: stage solution is enabled but has no title or image.`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

module.exports = { label, description, requiresBuzzerForHosting, validate };
