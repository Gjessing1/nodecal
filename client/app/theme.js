import { setNativeSystemBarStyle } from './nativeAndroid.js';

const STORAGE_KEY = 'nc-theme';
// Cycles: auto → dark → light → auto
const CYCLE = { auto: 'dark', dark: 'light', light: 'auto' };
const ICONS = { auto: '◐', dark: '☾', light: '☀' };

function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'auto';
}

function syncSystemBars(theme) {
  const darkBackground =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  void setNativeSystemBarStyle(darkBackground);
}

function applyTheme(theme) {
  if (theme === 'auto') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  localStorage.setItem(STORAGE_KEY, theme);
  syncSystemBars(theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = ICONS[theme];
}

export function initTheme() {
  applyTheme(getTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'auto') syncSystemBars('auto');
  });
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.addEventListener('click', () => applyTheme(CYCLE[getTheme()]));
  }
}
