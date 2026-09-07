const { putEvent, deleteEvent } = require('./client');

/**
 * Write an updated event resource into another calendar, then remove its old
 * resource. CalDAV has no portable partial update: the destination must receive
 * the complete VCALENDAR body. Creating first keeps the source intact if the
 * destination rejects the write; a failed source delete rolls the copy back.
 *
 * @param {object} source - cached event before the move
 * @param {object} destination - updated event with its target calendarId
 * @param {string} ics
 * @returns {Promise<{href: string, etag: string}>}
 */
async function relocateEvent(source, destination, ics) {
  if (!source.href) throw new Error('Cannot move an event before its CalDAV resource is known');

  const written = await putEvent(destination.calendarId, destination.uid, ics);
  try {
    await deleteEvent(source.href, source.etag);
  } catch (deleteError) {
    try {
      await deleteEvent(written.href, written.etag);
    } catch (rollbackError) {
      throw new Error(
        `Calendar move left a destination copy after rollback failed: ${deleteError.message}; ${rollbackError.message}`,
        { cause: rollbackError },
      );
    }
    throw deleteError;
  }
  return written;
}

module.exports = { relocateEvent };
