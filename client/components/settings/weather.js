import { button, field, numberInput, row, textInput } from './fields.js';

/**
 * Weather: the met.no forecast location and how many days each view shows.
 * @param {HTMLElement} pane
 * @param {Record<string, any>} draft
 */
export function renderWeatherSection(pane, draft) {
  const lat = textInput(draft.weatherLat, { placeholder: '59.91' }, (v) => {
    draft.weatherLat = v;
  });
  const lon = textInput(draft.weatherLon, { placeholder: '10.75' }, (v) => {
    draft.weatherLon = v;
  });

  const detect = button('📍 Detect', 'ghost', (el) => {
    if (!navigator.geolocation) {
      alert('Geolocation not supported by your browser');
      return;
    }
    el.textContent = '⏳ Detecting…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lat.value = pos.coords.latitude.toFixed(4);
        lon.value = pos.coords.longitude.toFixed(4);
        draft.weatherLat = lat.value;
        draft.weatherLon = lon.value;
        el.textContent = '✓ Detected';
      },
      () => {
        el.textContent = '📍 Detect';
        alert('Location permission denied');
      },
    );
  });

  const coords = document.createElement('div');
  coords.className = 'settings-coord-row';
  coords.append(field('Latitude', lat), field('Longitude', lon), detect);
  pane.appendChild(field('Location for weather (met.no)', coords));

  pane.appendChild(
    row(
      field(
        'Week (days)',
        numberInput(draft.weatherDaysWeek ?? 9, { min: 1, max: 14, step: 1, fallback: 9 }, (v) => {
          draft.weatherDaysWeek = v;
        }),
      ),
      field(
        'Month (days)',
        numberInput(draft.weatherDaysMonth ?? 4, { min: 1, max: 14, step: 1, fallback: 4 }, (v) => {
          draft.weatherDaysMonth = v;
        }),
      ),
      field(
        'Agenda (days)',
        numberInput(draft.weatherDaysAgenda ?? 1, { min: 1, max: 9, step: 1, fallback: 1 }, (v) => {
          draft.weatherDaysAgenda = v;
        }),
      ),
    ),
  );
}
