import {
  configureNativeServer,
  findNativeAppUpdate,
  getNativeAppInfo,
  isNativeAndroid,
  nativeDownloadUrl,
  openNativeExternal,
} from '../../app/nativeAndroid.js';
import { button, field, groupLabel, help } from './fields.js';

/**
 * System: which build this device is running, the Android shell's server URL
 * and update check, and signing out.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderSystemSection(pane, draft) {
  const about = help('Loading build information…');
  pane.appendChild(field('Version', about));
  fetch('/api/health')
    .then((res) => res.json())
    .then((h) => {
      about.textContent = `Nodecal ${h.version || ''} · build ${h.build || 'unknown'}`.replace(
        '  ',
        ' ',
      );
    })
    .catch(() => {
      about.textContent = 'Offline — build information unavailable.';
    });

  if (isNativeAndroid()) {
    pane.appendChild(groupLabel('Android app'));
    pane.appendChild(buildNativeApp());
  }

  if (draft.authEnabled) {
    pane.appendChild(groupLabel('Account'));
    const logout = button('Log out', 'ghost', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.reload();
    });
    logout.classList.add('settings-danger-btn');
    pane.appendChild(field('', logout));
  }
}

function buildNativeApp() {
  const wrap = document.createElement('div');
  wrap.className = 'modal-field';

  const label = document.createElement('label');
  label.textContent = 'Nodecal server URL';

  const input = document.createElement('input');
  input.type = 'url';
  input.inputMode = 'url';
  input.setAttribute('autocomplete', 'url');
  input.placeholder = 'https://calendar.example.com';

  const status = help('Loading Android app information…');
  const update = button('Download update', 'primary', () => {});
  update.hidden = true;

  const apply = button('Apply', 'ghost', async (el) => {
    el.disabled = true;
    status.textContent = 'Saving server URL…';
    try {
      await configureNativeServer(input.value);
      status.textContent = 'Restarting with the new server…';
    } catch (error) {
      status.textContent = error.message;
      el.disabled = false;
    }
  });

  const serverRow = document.createElement('div');
  serverRow.className = 'native-server-row';
  serverRow.append(input, apply);

  wrap.append(label, serverRow, status, update);
  loadNativeInfo(input, status, update);
  return wrap;
}

async function loadNativeInfo(input, status, update) {
  try {
    const info = await getNativeAppInfo();
    if (!info) return;
    input.value = info.serverUrl;
    status.textContent = `Installed app ${info.versionName} (${info.versionCode})`;

    const release = await findNativeAppUpdate(info);
    if (!release) return;
    update.textContent = `Download ${release.versionName}`;
    update.hidden = false;
    update.addEventListener('click', () => {
      openNativeExternal(nativeDownloadUrl(release)).catch((error) => {
        status.textContent = error.message;
      });
    });
  } catch (error) {
    status.textContent = error.message;
  }
}
