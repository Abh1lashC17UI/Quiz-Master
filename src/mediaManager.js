/**
 * src/mediaManager.js
 *
 * Handles importing media files into a quiz's own media/ folder.
 *
 * Design:
 *   - Files are copied (never moved) from their source location
 *   - The destination filename is: <uuid>.<ext>
 *   - quiz.json stores the relative path: "media/<uuid>.<ext>"
 *   - This makes quizzes portable — media travels with quiz.json
 */

'use strict';

const path   = require('path');
const fse    = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

/**
 * Import a media file into the quiz's media/ folder.
 * Returns the relative path to store in quiz.json.
 *
 * @param {string} quizDir - Absolute path to the quiz folder
 * @param {string} sourcePath - Absolute path to the source file (temp upload path)
 * @param {string} originalName - Original filename (used to extract extension)
 * @returns {Promise<string>} Relative path like "media/abc123.jpg"
 */
async function importMedia(quizDir, sourcePath, originalName) {
  const ext = path.extname(originalName || sourcePath).toLowerCase() || '.bin';
  const destName = `${uuidv4()}${ext}`;
  const mediaDir = path.join(quizDir, 'media');
  const destPath = path.join(mediaDir, destName);

  await fse.ensureDir(mediaDir);
  await fse.copy(sourcePath, destPath);

  return `media/${destName}`;
}

/**
 * Delete a media file from the quiz's media/ folder.
 * @param {string} quizDir
 * @param {string} relPath - e.g. "media/abc123.jpg"
 */
async function deleteMedia(quizDir, relPath) {
  const absPath = path.join(quizDir, relPath);
  if (await fse.pathExists(absPath)) {
    await fse.remove(absPath);
  }
}

/**
 * List all media files in the quiz's media/ folder.
 * @param {string} quizDir
 * @returns {Promise<string[]>} Array of relative paths like ["media/abc.jpg"]
 */
async function listMedia(quizDir) {
  const mediaDir = path.join(quizDir, 'media');
  if (!await fse.pathExists(mediaDir)) return [];
  const files = await fse.readdir(mediaDir);
  return files.map((f) => `media/${f}`);
}

module.exports = { importMedia, deleteMedia, listMedia };
