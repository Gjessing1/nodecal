const STORAGE_KEY = 'nc-theme';
// Cycles: auto → dark → light → auto
const CYCLE = { auto: 'dark', dark: 'light', light: 'auto' };
const ICONS = { auto: '◐', dark: '☾', light: '☀' };

function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'auto';
}

function applyTheme(theme) {
  if (theme === 'auto') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  localStorage.setItem(STORAGE_KEY, theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = ICONS[theme];
}

export function initTheme() {
  applyTheme(getTheme());
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.addEventListener('click', () => applyTheme(CYCLE[getTheme()]));
  }
}
