/**
 * Turn any unsuccessful HTTP response into a useful message, including when a
 * proxy or Express fallback returned HTML/text instead of the expected JSON.
 * @param {Response} response
 */
export async function responseError(response) {
  const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
  const contentType = response.headers.get('content-type') || '';
  let detail;

  if (contentType.includes('json')) {
    try {
      const body = await response.json();
      detail = body.error || body.message || '';
    } catch {
      detail = '';
    }
  } else {
    detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
}
