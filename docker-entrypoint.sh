#!/bin/sh
set -e
# Fix ownership of mounted volumes so the nodecal user can write to them.
# Runs as root, then drops privileges before exec-ing the app.
chown -R nodecal:nodecal /config /cache
exec su-exec nodecal "$@"
