const SVG_NS = 'http://www.w3.org/2000/svg';

// SVG viewBox is 200×200; all coordinates are in these units.
const CX = 100,
  CY = 100;
const R_FACE = 88; // clock face background circle
const R_OUTER = 74; // outer ring: hours 1-12 / all minutes
const R_INNER = 50; // inner ring: hours 0, 13-23
const SEL_R = 15; // radius of the selection circle at the hand tip

// idx 0 = 12-o'clock, increases clockwise, 12 steps per revolution
function idxToAngle(idx) {
  return idx * ((2 * Math.PI) / 12) - Math.PI / 2;
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
 * The drag-a-dial face of the time picker.
 *
 * It is hidden from assistive tech: it is a pointer-only affordance for the
 * same two values the HH and MM spinbuttons above it already expose, so
 * announcing it a second time would only be noise.
 *
 * @param {object} handlers
 * @param {() => string} handlers.getMode - 'hour' or 'minute'
 * @param {() => number} handlers.getHour
 * @param {() => number} handlers.getMinute
 * @param {(mode: string, value: number) => void} handlers.onPick
 * @param {() => void} handlers.onRelease - pointer lifted after a drag
 * @returns {{ svg: SVGSVGElement, render: () => void }}
 */
export function buildTimeDial({ getMode, getHour, getMinute, onPick, onRelease }) {
  const svg = /** @type {SVGSVGElement} */ (
    svgEl('svg', { viewBox: '0 0 200 200', class: 'tp-dial', 'aria-hidden': 'true' })
  );
  svg.appendChild(svgEl('circle', { cx: CX, cy: CY, r: R_FACE, class: 'dial-face' }));

  const handLine = svgEl('line', {
    x1: CX,
    y1: CY,
    class: 'dial-hand-line',
    'stroke-linecap': 'round',
  });
  const handDot = svgEl('circle', { r: SEL_R, class: 'dial-hand-dot' });
  const centerDot = svgEl('circle', { cx: CX, cy: CY, r: 4, class: 'dial-center-dot' });
  svg.append(handLine, handDot, centerDot);

  const numG = svgEl('g', {});
  svg.appendChild(numG);

  function addNumber(radius, idx, text, extraClass) {
    const [x, y] = polar(radius, idxToAngle(idx));
    const t = svgEl('text', {
      x,
      y,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      class: 'dial-num' + extraClass,
    });
    t.textContent = text;
    numG.appendChild(t);
  }

  function pointHandAt(radius, idx) {
    const [hx, hy] = polar(radius, idxToAngle(idx));
    handLine.setAttribute('x2', String(hx));
    handLine.setAttribute('y2', String(hy));
    handDot.setAttribute('cx', String(hx));
    handDot.setAttribute('cy', String(hy));
  }

  function renderHours() {
    const { outer: selOut, idx: selIdx } = hourToPos(getHour());
    for (let i = 0; i < 12; i++) {
      addNumber(R_OUTER, i, String(i === 0 ? 12 : i), selOut && selIdx === i ? ' sel' : '');
    }
    for (let i = 0; i < 12; i++) {
      const inner = ' dial-num-in' + (!selOut && selIdx === i ? ' sel' : '');
      addNumber(R_INNER, i, String(i === 0 ? 0 : i + 12), inner);
    }
    pointHandAt(selOut ? R_OUTER : R_INNER, selIdx);
  }

  function renderMinutes() {
    const minute = getMinute();
    for (let i = 0; i < 12; i++) {
      const m = i * 5;
      addNumber(R_OUTER, i, m === 0 ? '00' : String(m), minute === m ? ' sel' : '');
    }
    pointHandAt(R_OUTER, minute / 5);
  }

  function render() {
    numG.innerHTML = '';
    if (getMode() === 'hour') renderHours();
    else renderMinutes();
  }

  function readPointer(e) {
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / 200;
    const px = e.touches ? e.touches[0].clientX : e.clientX;
    const py = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = (px - rect.left) / scale - CX;
    const dy = (py - rect.top) / scale - CY;
    return { angle: Math.atan2(dy, dx), dist: Math.sqrt(dx * dx + dy * dy) };
  }

  function applyPointer({ angle, dist }) {
    if (dist > R_FACE || dist < 8) return;
    // Normalize to [0, 2π) clockwise from 12-o'clock
    let a = angle + Math.PI / 2;
    if (a < 0) a += 2 * Math.PI;
    if (a >= 2 * Math.PI) a -= 2 * Math.PI;
    const idx = Math.round((a * 12) / (2 * Math.PI)) % 12;

    if (getMode() === 'hour') {
      onPick('hour', posToHour(dist > (R_OUTER + R_INNER) / 2, idx));
    } else {
      onPick('minute', idx * 5);
    }
  }

  let dragging = false;
  svg.addEventListener('pointerdown', function onDown(e) {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    applyPointer(readPointer(e));
  });
  svg.addEventListener('pointermove', function onMove(e) {
    if (dragging) applyPointer(readPointer(e));
  });
  svg.addEventListener('pointerup', function onUp() {
    if (!dragging) return;
    dragging = false;
    onRelease();
  });

  return { svg, render };
}
