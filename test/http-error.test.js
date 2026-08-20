const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const helper = import('../client/app/httpError.js');

describe('responseError', () => {
  it('keeps the server message from a JSON error', async () => {
    const { responseError } = await helper;
    const response = new Response(JSON.stringify({ error: 'CalDAV rejected the write' }), {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.equal(await responseError(response), 'HTTP 502 Bad Gateway: CalDAV rejected the write');
  });

  it('surfaces an HTML response without trying to parse it as JSON', async () => {
    const { responseError } = await helper;
    const response = new Response('<!DOCTYPE html>\n<html>Wrong route</html>', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'Content-Type': 'text/html' },
    });

    assert.equal(
      await responseError(response),
      'HTTP 404 Not Found: <!DOCTYPE html> <html>Wrong route</html>',
    );
  });

  it('still reports the status when a JSON error body is malformed', async () => {
    const { responseError } = await helper;
    const response = new Response('{broken', {
      status: 500,
      statusText: 'Server Error',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.equal(await responseError(response), 'HTTP 500 Server Error');
  });
});
