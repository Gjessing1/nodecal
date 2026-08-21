const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const WORKER_FILE = path.join(__dirname, '../dist/service-worker.js');
let cachedBuildId;

/**
 * The generated worker contains Workbox's revision for every built asset, so
 * its own content hash is also a stable identity for the complete web build.
 * This value is display-only; Workbox, not the server, drives PWA updates.
 * @param {string} [workerFile]
 */
function getBuildId(workerFile = WORKER_FILE) {
  if (workerFile === WORKER_FILE && cachedBuildId) return cachedBuildId;

  let source;
  try {
    source = fs.readFileSync(workerFile);
  } catch (error) {
    if (error.code === 'ENOENT' && process.env.NODE_ENV === 'development') return 'dev';
    throw new Error('Web build not found; run npm run build before starting Nodecal', {
      cause: error,
    });
  }

  const buildId = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12);
  if (workerFile === WORKER_FILE) cachedBuildId = buildId;
  return buildId;
}

module.exports = { getBuildId };
