/**
 * src/folderPicker.js
 *
 * Opens a native Windows folder-selection dialog via PowerShell.
 * Falls back gracefully on non-Windows or if PowerShell is unavailable.
 */

'use strict';

const { spawn } = require('child_process');

/**
 * Open a native Windows folder browser dialog.
 * @param {string} [description] - Text shown in the dialog
 * @returns {Promise<{ ok: boolean, path?: string, fallback?: boolean, error?: string }>}
 */
function pickFolder(description = 'Select Quiz Root Folder') {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      return resolve({ ok: false, fallback: true, error: 'Native picker only available on Windows' });
    }

    // PowerShell one-liner: open FolderBrowserDialog, output selected path
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      `$d = New-Object System.Windows.Forms.FolderBrowserDialog;`,
      `$d.Description = '${description.replace(/'/g, "''")}';`,
      `$d.ShowNewFolderButton = $true;`,
      `$r = $d.ShowDialog();`,
      `if ($r -eq 'OK') { Write-Output $d.SelectedPath } else { exit 1 }`,
    ].join(' ');

    const ps = spawn('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script,
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    ps.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    ps.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    ps.on('close', (code) => {
      const selectedPath = stdout.trim();
      if (code === 0 && selectedPath) {
        resolve({ ok: true, path: selectedPath });
      } else if (code === 1 && !selectedPath) {
        // User cancelled (exit 1 from script)
        resolve({ ok: false, cancelled: true });
      } else {
        resolve({
          ok: false,
          fallback: true,
          error: stderr.trim() || `PowerShell exited with code ${code}`,
        });
      }
    });

    ps.on('error', (err) => {
      resolve({ ok: false, fallback: true, error: err.message });
    });
  });
}

module.exports = { pickFolder };
