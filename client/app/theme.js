import {
  setNativeSystemBarStyle,
  getNativeSystemTheme,
  onNativeSystemTheme,
} from './nativeAndroid.js';

const STORAGE_KEY = 'nc-theme';
// Cycles: auto → dark → light → auto
const CYCLE = { auto: 'dark', dark: 'light', light: 'auto' };
const ICONS = { auto: '◐', dark: '☾', light: '☀' };

/**
 * The system setting as the native shell sees it. `null` means nobody native is
 * answering — a browser, an installed PWA, or an APK older than 0.1.9 — and the
 * `prefers-color-scheme` media query is the source of truth instead.
 * @type {boolean | null}
 */
let nativeSystemDark = null;

function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'auto';
}

function systemPrefersDark() {
  if (nativeSystemDark !== null) return nativeSystemDark;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Paint the given preference. Does not persist it — startup and system changes
 * both re-render without recording a choice the user did not make.
 * @param {string} theme - 'auto' | 'dark' | 'light'
 */
function render(theme) {
  const dark = theme === 'dark' || (theme === 'auto' && systemPrefersDark());
  if (theme === 'auto' && nativeSystemDark === null) {
    // Leave the decision to the media query in tokens.css, so the page is
    // already the right colour before any script runs.
    delete document.documentElement.dataset.theme;
  } else {
    // On the native shell the WebView's media query is frozen at process start,
    // so 'auto' has to resolve to an explicit attribute for CSS to follow along.
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  void setNativeSystemBarStyle(dark);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = ICONS[theme];
}

/** @param {string} theme */
function applyTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  render(theme);
}

export function initTheme() {
  render(getTheme());

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'auto') render('auto');
  });

  onNativeSystemTheme((dark) => {
    nativeSystemDark = dark;
    if (getTheme() === 'auto') render('auto');
  });
  void getNativeSystemTheme().then((dark) => {
    if (dark === null) return;
    nativeSystemDark = dark;
    render(getTheme());
  });

  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.addEventListener('click', () => applyTheme(CYCLE[getTheme()]));
  }
}
