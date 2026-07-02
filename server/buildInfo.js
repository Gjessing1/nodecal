// Build identity for the PWA update cycle. The build id is a content hash of
// every file the browser can load, and the asset list is discovered by walking
// the served directories instead of being maintained by hand. Both are baked
// into /service-worker.js at serve time (see server/app.js), so any deploy that
// changes client code produces a byte-different worker script — which is what
// makes installed PWAs pick up new releases without a reinstall.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ROOTS = [
  { dir: path.join(__dirname, '../public'), baseUrl: '' },
  { dir: path.join(__dirname, '../client'), baseUrl: '/client' },
  // Loaded lazily by recurrencePreview.js — must be precached or the
  // recurrence preview breaks offline.
  { file: path.join(__dirname, '../node_modules/rrule/dist/es5/rrule.js'), url: '/rrule/rrule.js' },
];

function walk(dir, baseUrl, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      walk(path.join(dir, entry.name), `${baseUrl}/${entry.name}`, out);
    } else {
      out.push({ url: `${baseUrl}/${entry.name}`, file: path.join(dir, entry.name) });
    }
  }
}

/**
 * Hash every served file into a build id and collect the shell asset URLs.
 * @param {Array<{dir?: string, baseUrl?: string, file?: string, url?: string}>} [roots]
 * @returns {{ buildId: string, assets: string[] }}
 */
function computeBuildInfo(roots = DEFAULT_ROOTS) {
  const files = [];
  for (const root of roots) {
    if (root.file) {
      if (fs.existsSync(root.file)) files.push({ url: root.url, file: root.file });
    } else {
      walk(root.dir, root.baseUrl, files);
    }
  }

  const hash = crypto.createHash('sha256');
  const assets = ['/'];
  for (const { url, file } of files) {
    hash.update(url);
    hash.update(fs.readFileSync(file));
    // '/' already covers index.html; the worker itself must never be precached
    // or update checks would read the old version back out of the cache.
    if (url === '/index.html' || url === '/service-worker.js') continue;
    assets.push(url);
  }
  return { buildId: hash.digest('hex').slice(0, 12), assets };
}

let cached = null;

/** Same as computeBuildInfo but scanned once per process (files are immutable inside the container). */
function getBuildInfo() {
  if (!cached) cached = computeBuildInfo();
  return cached;
}

module.exports = { getBuildInfo, computeBuildInfo };
