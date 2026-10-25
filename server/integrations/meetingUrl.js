// Video meetings a widget can offer to join. Outlook puts the Teams link in the
// description, Google puts Meet in the url or location, and people paste Zoom or
// Whereby links anywhere, so all three fields are searched in that order.
const MEETING_HOSTS = [
  /^teams\.microsoft\.com$/,
  /^teams\.live\.com$/,
  /^meet\.google\.com$/,
  /(^|\.)zoom\.us$/,
  /^whereby\.com$/,
];

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

/**
 * @param {string} candidate
 * @returns {boolean}
 */
function isMeetingLink(candidate) {
  let host;
  try {
    host = new URL(candidate).hostname.toLowerCase();
  } catch {
    return false;
  }
  for (const pattern of MEETING_HOSTS) {
    if (pattern.test(host)) return true;
  }
  return false;
}

/**
 * The first Teams / Meet / Zoom / Whereby link in an event, or ''.
 * @param {{ url?: string, location?: string, description?: string }} event
 * @returns {string}
 */
function meetingUrl(event) {
  for (const text of [event.url, event.location, event.description]) {
    if (!text) continue;
    for (const match of String(text).matchAll(URL_PATTERN)) {
      // Trailing punctuation belongs to the sentence, not the link.
      const link = match[0].replace(/[.,;:!?]+$/, '');
      if (isMeetingLink(link)) return link;
    }
  }
  return '';
}

module.exports = { meetingUrl };
