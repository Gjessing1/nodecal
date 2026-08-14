const fs = require('fs');
const path = require('path');

/**
 * Read and validate the Android release currently published by the host.
 * version.json and the APK are written by scripts/publish-android.sh.
 * @param {string} appDir
 */
async function readPublishedApp(appDir) {
  const metadataPath = path.join(appDir, 'version.json');
  const metadata = JSON.parse(await fs.promises.readFile(metadataPath, 'utf8'));
  const { versionCode, versionName, file, sha256 } = metadata;

  if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
    throw new Error('version.json has an invalid versionCode');
  }
  if (typeof versionName !== 'string' || !/^[0-9A-Za-z][0-9A-Za-z._-]*$/.test(versionName)) {
    throw new Error('version.json has an invalid versionName');
  }
  if (
    typeof file !== 'string' ||
    file !== path.basename(file) ||
    !/^nodecal-[0-9A-Za-z._-]+\.apk$/.test(file)
  ) {
    throw new Error('version.json has an invalid APK filename');
  }
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new Error('version.json has an invalid sha256');
  }

  const apkPath = path.join(appDir, file);
  const stat = await fs.promises.stat(apkPath);
  if (!stat.isFile()) throw new Error('published APK is not a file');

  return { versionCode, versionName, file, sha256, bytes: stat.size, apkPath };
}

/** Register public release metadata and download routes before authentication. */
function registerAppReleaseRoutes(app, appDir) {
  app.get('/api/app/version', async (req, res) => {
    try {
      const { versionCode, versionName, sha256, bytes } = await readPublishedApp(appDir);
      res.set('Cache-Control', 'no-cache');
      res.json({
        versionCode,
        versionName,
        sha256,
        bytes,
        apkUrl: '/api/app/download',
      });
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Published Android app is unreadable:', error);
      res.status(404).json({ error: 'No Android app has been published' });
    }
  });

  app.get('/api/app/download', async (req, res) => {
    try {
      const published = await readPublishedApp(appDir);
      res.set('Cache-Control', 'no-cache');
      res.download(published.apkPath, published.file);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Published Android app is unreadable:', error);
      res.status(404).json({ error: 'No Android app has been published' });
    }
  });
}

module.exports = { readPublishedApp, registerAppReleaseRoutes };
