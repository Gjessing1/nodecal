const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
const capacitorConfigPath = path.join(root, 'capacitor.config.json');

test('Android launcher includes a complete set of dated icon aliases', () => {
  const manifest = fs.readFileSync(manifestPath, 'utf8');

  assert.match(manifest, /android:name="\.LauncherDefault"[\s\S]*?android:enabled="true"/);
  assert.strictEqual((manifest.match(/<activity-alias/g) || []).length, 32);

  for (let day = 1; day <= 31; day += 1) {
    const value = String(day).padStart(2, '0');
    const artworkPath = path.join(
      root,
      `android/app/src/main/res/drawable/ic_launcher_day_${value}_artwork.xml`,
    );
    assert.match(manifest, new RegExp(`android:name="\\.LauncherDay${value}"`));
    assert.match(manifest, new RegExp(`android:icon="@mipmap/ic_launcher_day_${value}"`));
    assert.ok(fs.existsSync(artworkPath));
    const artwork = fs.readFileSync(artworkPath, 'utf8');
    assert.match(artwork, /android:fillColor="#1F2937"/);
    assert.doesNotMatch(artwork, /android:strokeColor=/);
    assert.ok(
      fs.existsSync(
        path.join(root, `android/app/src/main/res/mipmap-anydpi/ic_launcher_day_${value}.xml`),
      ),
    );
    assert.ok(
      fs.existsSync(
        path.join(root, `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_day_${value}.xml`),
      ),
    );
  }
});

test('Android starts with contrasting system bar icons on the light header', () => {
  const config = JSON.parse(fs.readFileSync(capacitorConfigPath, 'utf8'));

  assert.strictEqual(config.plugins.SystemBars.style, 'LIGHT');
  assert.strictEqual(config.plugins.SystemBars.insetsHandling, 'css');
});
