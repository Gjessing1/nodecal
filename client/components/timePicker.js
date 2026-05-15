const SVG_NS = 'http://www.w3.org/2000/svg';

// SVG viewBox is 200×200; all coordinates are in these units.
const CX = 100, CY = 100;
const R_FACE  = 88;   // clock face background circle
const R_OUTER = 74;   // outer ring: hours 1-12 / all minutes
const R_INNER = 50;   // inner ring: hours 0, 13-23
const SEL_R   = 15;   // radius of the selection circle at the hand tip

// idx 0 = 12-o'clock, increases clockwise, 12 steps per revolution
function idxToAngle(idx) {
  return idx * (2 * Math.PI / 12) - Math.PI / 2;
}
function polar(r, angle) {
  return [CX + r * Math.cos(angle), CY + r * Math.sin(angle)];
}
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// 24h clock: outer ring has 12, 1-11 ; inner ring has 0, 13-23
function hourToPos(h) {
  if (h === 12) return { outer: true, idx: 0 };
  if (h >= 1 && h <= 11) return { outer: true, idx: h };
  if (h === 0) return { outer: false, idx: 0 };
  return { outer: false, idx: h - 12 };
}
function posToHour(outer, idx) {
  if (outer) return idx === 0 ? 12 : idx;
  return idx === 0 ? 0 : idx + 12;
}

/**
 * Build a tap-to-open time picker.
 * Returns a div containing a hidden input (#id) and a display button.
 * Tapping the button opens an overlay dial picker.
 * Exposes wrap.updateTime(val) for programmatic updates (e.g. NLP).
 *
 * @param {string} id - id for the hidden input
 * @param {Date} date - initial date/time
 * @param {string} timezone - IANA timezone
 * @param {function(string): void} [onChange] - called with "HH:MM" on change
 */
export function buildTimePicker(id, date, timezone, onChange) {
  const tz = timezone || 'UTC';

  // Parse initial time in the configured timezone
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
  }).formatToParts(date instanceof Date ? date : new Date());
  let hour   = parseInt(parts.find(p => p.type === 'hour').value) % 24;
  let minute = Math.round(parseInt(parts.find(p => p.type === 'minute').value) / 5) * 5 % 60;

  const wrap = document.createElement('div');
  wrap.className = 'tp-wrap';

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = id;

  function syncValue() {
    hidden.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  syncValue();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tp-btn';

  function updateBtn() {
    btn.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  updateBtn();

  btn.addEventListener('click', openPicker);

  function openPicker() {
    document.getElementById('time-picker-overlay')?.remove();

    let pickHour   = hour;
    let pickMinute = minute;
    let mode       = 'hour';

    // ── Overlay ───────────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'time-picker-overlay';
    overlay.className = 'mini-cal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const panel = document.createElement('div');
    panel.className = 'mini-cal-panel tp-panel';
    panel.addEventListener('click', e => e.stopPropagation());

    // Close button
    const closeRow = document.createElement('div');
    closeRow.className = 'tp-close-row';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tp-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => overlay.remove());
    closeRow.appendChild(closeBtn);

    // ── Display row: HH : MM ─────────────────────────────────────────────────
    const displayRow = document.createElement('div');
    displayRow.className = 'time-picker-display';

    const hourSeg = document.createElement('button');
    hourSeg.type = 'button';
    hourSeg.className = 'time-picker-seg';

    const colonEl = document.createElement('span');
    colonEl.className = 'time-picker-colon';
    colonEl.textContent = ':';

    const minSeg = document.createElement('button');
    minSeg.type = 'button';
    minSeg.className = 'time-picker-seg';

    hourSeg.addEventListener('click', () => setMode('hour'));
    minSeg.addEventListener('click', () => setMode('minute'));
    displayRow.append(hourSeg, colonEl, minSeg);

    function updateSegs() {
      hourSeg.textContent = String(pickHour).padStart(2, '0');
      minSeg.textContent  = String(pickMinute).padStart(2, '0');
      hourSeg.classList.toggle('active', mode === 'hour');
      minSeg.classList.toggle('active', mode === 'minute');
    }

    function setMode(m) {
      mode = m;
      updateSegs();
      renderDial();
    }

    // ── SVG dial ─────────────────────────────────────────────────────────────
    const svg = svgEl('svg', { viewBox: '0 0 200 200', class: 'tp-dial' });
    svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: R_FACE, class: 'dial-face' }));

    const handLine  = svgEl('line',   { x1: CX, y1: CY, class: 'dial-hand-line', 'stroke-linecap': 'round' });
    const handDot   = svgEl('circle', { r: SEL_R, class: 'dial-hand-dot' });
    const centerDot = svgEl('circle', { cx: CX, cy: CY, r: 4, class: 'dial-center-dot' });
    svg.append(handLine, handDot, centerDot);

    const numG = svgEl('g', {});
    svg.appendChild(numG);

    function renderDial() {
      numG.innerHTML = '';

      if (mode === 'hour') {
        const { outer: selOut, idx: selIdx } = hourToPos(pickHour);

        // Outer ring: 12, 1, 2 … 11
        for (let i = 0; i < 12; i++) {
          const h = i === 0 ? 12 : i;
          const [x, y] = polar(R_OUTER, idxToAngle(i));
          const t = svgEl('text', {
            x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            class: 'dial-num' + (selOut && selIdx === i ? ' sel' : ''),
          });
          t.textContent = String(h);
          numG.appendChild(t);
        }

        // Inner ring: 0, 13, 14 … 23
        for (let i = 0; i < 12; i++) {
          const h = i === 0 ? 0 : i + 12;
          const [x, y] = polar(R_INNER, idxToAngle(i));
          const t = svgEl('text', {
            x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            class: 'dial-num dial-num-in' + (!selOut && selIdx === i ? ' sel' : ''),
          });
          t.textContent = String(h);
          numG.appendChild(t);
        }

        const { outer, idx } = hourToPos(pickHour);
        const [hx, hy] = polar(outer ? R_OUTER : R_INNER, idxToAngle(idx));
        handLine.setAttribute('x2', hx); handLine.setAttribute('y2', hy);
        handDot.setAttribute('cx', hx);  handDot.setAttribute('cy', hy);

      } else {
        // Minute mode: 0, 5, 10 … 55
        for (let i = 0; i < 12; i++) {
          const m = i * 5;
          const [x, y] = polar(R_OUTER, idxToAngle(i));
          const t = svgEl('text', {
            x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            class: 'dial-num' + (pickMinute === m ? ' sel' : ''),
          });
          t.textContent = m === 0 ? '00' : String(m);
          numG.appendChild(t);
        }

        const [hx, hy] = polar(R_OUTER, idxToAngle(pickMinute / 5));
        handLine.setAttribute('x2', hx); handLine.setAttribute('y2', hy);
        handDot.setAttribute('cx', hx);  handDot.setAttribute('cy', hy);
      }
    }

    // ── Pointer events ────────────────────────────────────────────────────────
    function readPointer(e) {
      const rect = svg.getBoundingClientRect();
      const scale = rect.width / 200;
      const px = e.touches ? e.touches[0].clientX : e.clientX;
      const py = e.touches ? e.touches[0].clientY : e.clientY;
      const dx = (px - rect.left) / scale - CX;
      const dy = (py - rect.top)  / scale - CY;
      return { angle: Math.atan2(dy, dx), dist: Math.sqrt(dx * dx + dy * dy) };
    }

    function applyPointer({ angle, dist }) {
      if (dist > R_FACE || dist < 8) return;
      // Normalize to [0, 2π) clockwise from 12-o'clock
      let a = angle + Math.PI / 2;
      if (a < 0) a += 2 * Math.PI;
      if (a >= 2 * Math.PI) a -= 2 * Math.PI;
      const idx = Math.round(a * 12 / (2 * Math.PI)) % 12;

      if (mode === 'hour') {
        pickHour = posToHour(dist > (R_OUTER + R_INNER) / 2, idx);
      } else {
        pickMinute = idx * 5;
      }
      updateSegs();
      renderDial();
    }

    let _drag = false;
    svg.addEventListener('pointerdown', e => {
      _drag = true;
      svg.setPointerCapture(e.pointerId);
      applyPointer(readPointer(e));
    });
    svg.addEventListener('pointermove', e => { if (_drag) applyPointer(readPointer(e)); });
    svg.addEventListener('pointerup', () => {
      if (!_drag) return;
      _drag = false;
      if (mode === 'hour') {
        setMode('minute');   // auto-advance after hour selection
      } else {
        commit();            // auto-close after minute selection
      }
    });

    function commit() {
      hour   = pickHour;
      minute = pickMinute;
      syncValue();
      if (onChange) onChange(hidden.value);
      updateBtn();
      // Delay removal by one frame so the overlay absorbs the pointer-synthesised
      // click instead of passing it through to the field below.
      requestAnimationFrame(() => overlay.remove());
    }

    // ── Assemble overlay ──────────────────────────────────────────────────────
    updateSegs();
    renderDial();
    panel.append(closeRow, displayRow, svg);
    overlay.appendChild(panel);
    document.getElementById('app').appendChild(overlay);
  }

  // Programmatic update — called by NLP feedback
  wrap.updateTime = (val) => {
    const [h, m] = val.split(':').map(Number);
    if (!isNaN(h)) hour = ((h % 24) + 24) % 24;
    if (!isNaN(m)) minute = Math.round(m / 5) * 5 % 60;
    syncValue();
    updateBtn();
  };

  wrap.append(hidden, btn);
  return wrap;
}
