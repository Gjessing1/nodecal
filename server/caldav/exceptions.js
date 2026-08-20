const { recurrenceInstant } = require('./overrides');
const { formatIcsDate } = require('./parser');

// Editing or removing one occurrence of a series is a change to the *set* of
// VEVENTs in its resource, not to a record of its own: an edit adds or replaces
// an override, a removal drops one and adds an EXDATE to the master. These are
// the pure set operations; seriesResource.js does the CalDAV write.

/**
 * The override replacing the occurrence at `recurrenceId`, if there is one.
 * @param {Array<object>} overrides
 * @param {string} recurrenceId - ISO UTC instant the occurrence would start at
 * @returns {object|undefined}
 */
function overrideAt(overrides, recurrenceId) {
  const at = recurrenceInstant(recurrenceId);
  if (at === null) return undefined;
  return overrides.find((ov) => recurrenceInstant(ov.recurrenceId) === at);
}

/**
 * The override VEVENT for one occurrence: the series' own fields, the caller's
 * changes on top, and no RRULE — the recurrence lives on the master alone, and
 * a copy of it here would expand into a second series.
 * @param {object} base - the master event
 * @param {object|undefined} existing - the override being replaced, if any
 * @param {object} changes - already filtered to writable fields
 * @param {string} recurrenceId - ISO UTC instant this VEVENT replaces
 * @returns {object}
 */
function buildOverride(base, existing, changes, recurrenceId) {
  return {
    ...(existing || base),
    ...changes,
    uid: base.uid,
    calendarId: base.calendarId,
    recurrenceId,
    rrule: null,
    exdates: null,
  };
}

/**
 * `overrides` with `override` put in the place of the one it replaces.
 * @param {Array<object>} overrides
 * @param {object} override
 * @returns {Array<object>}
 */
function mergeOverride(overrides, override) {
  const at = recurrenceInstant(override.recurrenceId);
  const kept = overrides.filter((ov) => recurrenceInstant(ov.recurrenceId) !== at);
  kept.push(override);
  return kept;
}

/**
 * `overrides` without the one replacing the occurrence at `recurrenceId`.
 * @param {Array<object>} overrides
 * @param {string} recurrenceId
 * @returns {Array<object>}
 */
function withoutOverride(overrides, recurrenceId) {
  const at = recurrenceInstant(recurrenceId);
  return overrides.filter((ov) => recurrenceInstant(ov.recurrenceId) !== at);
}

/**
 * The overrides still covered by a series trimmed to end before `recurrenceId`.
 *
 * "This and following" caps the master's UNTIL, so an override past that point
 * replaces an occurrence the series no longer has. Keeping it would leave a
 * lone event floating after the end of its own series.
 * @param {Array<object>} overrides
 * @param {string} recurrenceId - the split point
 * @returns {Array<object>}
 */
function overridesBefore(overrides, recurrenceId) {
  const at = recurrenceInstant(recurrenceId);
  if (at === null) return overrides;
  return overrides.filter((ov) => {
    const ovAt = recurrenceInstant(ov.recurrenceId);
    return ovAt !== null && ovAt < at;
  });
}

/**
 * The master with one more EXDATE, so the occurrence stops being expanded.
 * @param {object} base
 * @param {string} recurrenceId - ISO UTC instant of the occurrence to skip
 * @returns {object}
 */
function withExdate(base, recurrenceId) {
  const exdate = formatIcsDate(new Date(recurrenceId), base.allDay);
  const current = base.exdates || [];
  if (current.includes(exdate)) return base;
  return { ...base, exdates: [...current, exdate] };
}

module.exports = {
  overrideAt,
  buildOverride,
  mergeOverride,
  withoutOverride,
  overridesBefore,
  withExdate,
};
