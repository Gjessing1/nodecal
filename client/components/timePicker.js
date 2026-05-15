const WHEEL_ITEM_H = 40;

/**
 * Wraps buildTimeWheel with a tap-to-reveal button.
 * Shows a text display of the time; tapping it opens the scroll wheel.
 */
export function buildTimeButton(id, date, timezone = 'UTC', onTimeChange) {
  const wrap = document.createElement('div');
  wrap.className = 'time-btn-wrap';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'time-display-btn';

  const wheelPanel = document.createElement('div');
  wheelPanel.className = 'time-wheel-panel hidden';

  const pair = buildTimeWheel(id, date, timezone, val => {
    btn.textContent = val;
    if (onTimeChange) onTimeChange(val);
  });
  const hidden = pair.querySelector(`#${id}`);
  btn.textContent = hidden.value;
  wheelPanel.appendChild(pair);

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = !wheelPanel.classList.contains('hidden');
    document.querySelectorAll('.time-wheel-panel').forEach(p => {
      if (p !== wheelPanel) {
        p.classList.add('hidden');
        p.previousElementSibling?.classList.remove('active');
      }
    });
    wheelPanel.classList.toggle('hidden', isOpen);
    btn.classList.toggle('active', !isOpen);
    if (!isOpen) {
      const closeOnOutside = ev => {
        if (!wheelPanel.contains(ev.target)) {
          wheelPanel.classList.add('hidden');
          btn.classList.remove('active');
          document.removeEventListener('click', closeOnOutside);
        }
      };
      setTimeout(() => document.addEventListener('click', closeOnOutside), 0);
    }
  });

  wrap.appendChild(btn);
  wrap.appendChild(wheelPanel);
  return wrap;
}

export function buildTimeWheel(id, date, timezone = 'UTC', onChange) {
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = id;

  // Read h/m in the configured timezone, not browser local time
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
  }).formatToParts(date);
  let hVal = parseInt(parts.find(p => p.type === 'hour').value) % 24;
  let mVal = Math.round(parseInt(parts.find(p => p.type === 'minute').value) / 5) * 5 % 60;
  hidden.value = `${String(hVal).padStart(2, '0')}:${String(mVal).padStart(2, '0')}`;

  function sync() {
    hidden.value = `${String(hVal).padStart(2, '0')}:${String(mVal).padStart(2, '0')}`;
    if (onChange) onChange(hidden.value);
  }

  function makeWheel(items, initial, onChange) {
    const outer = document.createElement('div');
    outer.className = 'time-wheel';

    const indicator = document.createElement('div');
    indicator.className = 'time-wheel-selection';
    outer.appendChild(indicator);

    const scroller = document.createElement('div');
    scroller.className = 'time-wheel-scroller';

    const padTop = document.createElement('div');
    padTop.className = 'time-wheel-pad-item';
    scroller.appendChild(padTop);

    for (const v of items) {
      const item = document.createElement('div');
      item.className = 'time-wheel-item';
      item.textContent = String(v).padStart(2, '0');
      scroller.appendChild(item);
    }

    const padBot = document.createElement('div');
    padBot.className = 'time-wheel-pad-item';
    scroller.appendChild(padBot);

    outer.appendChild(scroller);

    requestAnimationFrame(() => {
      scroller.scrollTop = items.indexOf(initial) * WHEEL_ITEM_H;
    });

    let t;
    scroller.addEventListener('scroll', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const idx = Math.round(scroller.scrollTop / WHEEL_ITEM_H);
        onChange(items[Math.max(0, Math.min(idx, items.length - 1))]);
      }, 80);
    }, { passive: true });

    return outer;
  }

  const pair = document.createElement('div');
  pair.className = 'time-wheel-pair';
  pair.appendChild(hidden);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const mins = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const hWheel = makeWheel(hours, hVal, v => { hVal = v; sync(); });
  const sep = document.createElement('span');
  sep.className = 'time-wheel-sep';
  sep.textContent = ':';
  const mWheel = makeWheel(mins, mVal, v => { mVal = v; sync(); });

  pair.appendChild(hWheel);
  pair.appendChild(sep);
  pair.appendChild(mWheel);
  return pair;
}
