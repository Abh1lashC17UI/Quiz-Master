/**
 * src/formats/registry.js
 *
 * Central registry for quiz formats.
 * Each format is a descriptor object used by the storage, validation,
 * and server layers. UI components are loaded separately on the client.
 *
 * To add a new format:
 *   1. Create src/formats/<newformat>.js
 *   2. Import it here and add it to FORMATS
 *   3. Add client-side editor and host components under public/js/formats/<newformat>/
 */

'use strict';

const jeopardyFormat  = require('./jeopardy');
const countdownFormat = require('./countdown');

const FORMATS = {
  JEOPARDY:  jeopardyFormat,
  COUNTDOWN: countdownFormat,
};

/**
 * Get a format descriptor by ID.
 * @param {string} formatId
 * @returns {object|null}
 */
function getFormat(formatId) {
  return FORMATS[formatId] || null;
}

/**
 * Get all registered format IDs and labels.
 */
function listFormats() {
  return Object.entries(FORMATS).map(([id, fmt]) => ({
    id,
    label: fmt.label,
    description: fmt.description,
  }));
}

/**
 * Validate a quiz using its format's validator.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateQuiz(quiz) {
  const fmt = getFormat(quiz.format);
  if (!fmt) {
    return { valid: false, errors: [`Unknown quiz format: ${quiz.format}`] };
  }
  return fmt.validate(quiz);
}

/**
 * Check if a format requires a buzzer embed to HOST.
 */
function requiresBuzzerForHosting(formatId) {
  const fmt = getFormat(formatId);
  return fmt ? fmt.requiresBuzzerForHosting : false;
}

module.exports = { getFormat, listFormats, validateQuiz, requiresBuzzerForHosting };
