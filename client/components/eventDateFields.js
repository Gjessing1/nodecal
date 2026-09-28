import { toDateInputValue, toTimeInputValue, localToUTC } from '../app/utils.js';
import { buildTimePicker } from './timePicker.js';
import { buildDatePickerButton } from './modalHelpers.js';
import { shiftEndWithStart, addMinutes, allDayRange, lastDayOfTimedRange } from './eventTimes.js';

/**
 * @typedef {object} DateFieldsInit
 * @property {boolean} allDay
 * @property {string} allDayStart - 'YYYY-MM-DD'
 * @property {string} allDayLast - 'YYYY-MM-DD', inclusive
 * @property {Date} start - seed for the timed From fields
 * @property {Date} end - seed for the timed To fields
 * @property {string} tz - configured IANA timezone
 */

/**
 * The From/To rows of the event editor: one pair of dates for all-day events,
 * one pair of date + time for timed ones. Only the active pair is shown.
 * @param {DateFieldsInit} init
 */
export function eventDateFieldsHtml(init) {
  const { allDay, allDayStart, allDayLast, start, end, tz } = init;
  return `
    <div class="modal-datetime-row" id="allday-date-row"${allDay ? '' : ' style="display:none"'}>
      <div class="datetime-col">
        <label class="datetime-label">From</label>
        <div class="datetime-inputs">
          <input type="hidden" id="f-date" value="${allDayStart}">
          <div id="f-date-wrap"></div>
        </div>
      </div>
      <span class="datetime-arrow">→</span>
      <div class="datetime-col">
        <label class="datetime-label">To</label>
        <div class="datetime-inputs">
          <input type="hidden" id="f-date-last" value="${allDayLast}">
          <div id="f-date-last-wrap"></div>
        </div>
      </div>
    </div>
    <div class="modal-datetime-row" id="time-row"${allDay ? ' style="display:none"' : ''}>
      <div class="datetime-col">
        <label class="datetime-label">From</label>
        <div class="datetime-inputs">
          <input type="hidden" id="f-start-date" value="${toDateInputValue(start, tz)}">
          <div id="f-start-date-wrap"></div>
          <div id="f-start-time-wrap"></div>
        </div>
      </div>
      <span class="datetime-arrow">→</span>
      <div class="datetime-col">
        <label class="datetime-label">To</label>
        <div class="datetime-inputs">
          <input type="hidden" id="f-end-date" value="${toDateInputValue(end, tz)}">
          <div id="f-end-date-wrap"></div>
          <div id="f-end-time-wrap"></div>
        </div>
      </div>
    </div>
    <div class="hidden mb-md text-sm text-danger" id="f-when-error" role="alert"></div>`;
}

/**
 * Wire the rows rendered by eventDateFieldsHtml. Moving a From field moves the
 * matching To field by the same amount, so the event keeps its length — across
 * midnight and across a DST change alike (see eventTimes.js).
 *
 * @param {HTMLElement} sheet
 * @param {DateFieldsInit & {
 *   defaultDurationMinutes: number,
 *   onStartDateChange?: (d: Date) => void,
 * }} init
 */
export function mountEventDateFields(sheet, init) {
  const { tz, defaultDurationMinutes, onStartDateChange } = init;
  /** @param {string} sel */
  function input(sel) {
    return /** @type {HTMLInputElement} */ (sheet.querySelector(sel));
  }
  const allDayEl = input('#f-allday');
  const dateEl = input('#f-date');
  const dateLastEl = input('#f-date-last');
  const startDateEl = input('#f-start-date');
  const endDateEl = input('#f-end-date');
  const errorEl = sheet.querySelector('#f-when-error');

  buildDatePickerButton(dateEl, sheet.querySelector('#f-date-wrap'));
  buildDatePickerButton(dateLastEl, sheet.querySelector('#f-date-last-wrap'));
  buildDatePickerButton(startDateEl, sheet.querySelector('#f-start-date-wrap'));
  buildDatePickerButton(endDateEl, sheet.querySelector('#f-end-date-wrap'));

  sheet
    .querySelector('#f-start-time-wrap')
    .appendChild(buildTimePicker('f-start-time', init.start, tz, followStart));
  sheet
    .querySelector('#f-end-time-wrap')
    .appendChild(buildTimePicker('f-end-time', init.end, tz, clearError));

  function startValue() {
    return { date: startDateEl.value, time: input('#f-start-time').value };
  }
  function endValue() {
    return { date: endDateEl.value, time: input('#f-end-time').value };
  }

  /**
   * Set a hidden date input and let its picker button relabel itself.
   * @param {HTMLInputElement} el
   * @param {string} value
   */
  function setDate(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('change'));
  }
  /**
   * @param {string} wrapSel
   * @param {string} value - 'HH:MM'
   */
  function setTime(wrapSel, value) {
    /** @type {any} */ (sheet.querySelector(`${wrapSel} .tp-wrap`)).updateTime(value);
  }
  /** @param {{ date: string, time: string }} end */
  function setEnd(end) {
    setDate(endDateEl, end.date);
    setTime('#f-end-time-wrap', end.time);
  }

  // The last From value the To fields were measured against. Every write to
  // the From fields goes through followStart (or resets this first), so the
  // delta below is only ever the user's own move.
  let prevStart = startValue();
  let prevAllDayStart = dateEl.value;

  function followStart() {
    const next = startValue();
    const delta = shiftEndWithStart(prevStart, next, endValue());
    const dateMoved = next.date !== prevStart.date;
    prevStart = next;
    setEnd(delta);
    clearError();
    if (dateMoved) onStartDateChange?.(new Date(next.date + 'T00:00'));
  }
  startDateEl.addEventListener('change', followStart);

  dateEl.addEventListener('change', function followAllDayStart() {
    const next = dateEl.value;
    const moved = shiftEndWithStart(
      { date: prevAllDayStart, time: '00:00' },
      { date: next, time: '00:00' },
      { date: dateLastEl.value, time: '00:00' },
    );
    const dateMoved = next !== prevAllDayStart;
    prevAllDayStart = next;
    setDate(dateLastEl, moved.date);
    clearError();
    if (dateMoved) onStartDateChange?.(new Date(next + 'T00:00'));
  });
  dateLastEl.addEventListener('change', clearError);
  endDateEl.addEventListener('change', clearError);

  /** @param {boolean} allDay */
  function showMode(allDay) {
    allDayEl.checked = allDay;
    /** @type {HTMLElement} */ (sheet.querySelector('#allday-date-row')).style.display = allDay
      ? ''
      : 'none';
    /** @type {HTMLElement} */ (sheet.querySelector('#time-row')).style.display = allDay
      ? 'none'
      : '';
    clearError();
  }

  allDayEl.addEventListener('change', function toggleAllDay() {
    if (allDayEl.checked) {
      const { date: startDate } = startValue();
      const end = endValue();
      setAllDay(startDate, lastDayOfTimedRange(startDate, end.date, end.time));
      return;
    }
    const start = { date: dateEl.value, time: input('#f-start-time').value };
    let end = { date: dateLastEl.value, time: input('#f-end-time').value };
    // A one-day all-day event keeps its seed times, which may end before they
    // start once put on the same date; fall back to the configured length then.
    if (`${end.date}T${end.time}` <= `${start.date}T${start.time}`) {
      end = addMinutes(start, defaultDurationMinutes);
    }
    setTimedFields(start, end);
    showMode(false);
  });

  /**
   * @param {{ date: string, time: string }} start
   * @param {{ date: string, time: string }} end
   */
  function setTimedFields(start, end) {
    const dateMoved = start.date !== prevStart.date;
    // Reset the baseline first so the change event below measures no move.
    prevStart = start;
    startDateEl.value = start.date;
    setTime('#f-start-time-wrap', start.time);
    setEnd(end);
    setDate(startDateEl, start.date);
    if (dateMoved) onStartDateChange?.(new Date(start.date + 'T00:00'));
  }

  /**
   * @param {string} startDate
   * @param {string} lastDate - inclusive
   */
  function setAllDay(startDate, lastDate) {
    const dateMoved = startDate !== prevAllDayStart;
    prevAllDayStart = startDate;
    setDate(dateEl, startDate);
    setDate(dateLastEl, lastDate);
    showMode(true);
    if (dateMoved) onStartDateChange?.(new Date(startDate + 'T00:00'));
  }

  /** @param {string} message */
  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
  function clearError() {
    errorEl.classList.add('hidden');
  }

  return {
    /**
     * @param {Date} start
     * @param {Date} end
     */
    setTimed(start, end) {
      setTimedFields(
        { date: toDateInputValue(start, tz), time: toTimeInputValue(start, tz) },
        { date: toDateInputValue(end, tz), time: toTimeInputValue(end, tz) },
      );
      showMode(false);
    },
    setAllDay,
    /**
     * The chosen range, or null (with the reason shown under the fields) when
     * it ends before it starts.
     * @returns {{ allDay: boolean, start: Date, end: Date } | null}
     */
    read() {
      if (allDayEl.checked) {
        if (dateLastEl.value < dateEl.value) {
          showError('The event ends before it starts.');
          return null;
        }
        return { allDay: true, ...allDayRange(dateEl.value, dateLastEl.value) };
      }
      const s = startValue();
      const e = endValue();
      const start = localToUTC(s.date, s.time, tz);
      const end = localToUTC(e.date, e.time, tz);
      if (end <= start) {
        showError('The event must end after it starts.');
        return null;
      }
      return { allDay: false, start, end };
    },
  };
}
