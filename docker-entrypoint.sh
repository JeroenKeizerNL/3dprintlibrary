#!/bin/sh
set -eu

# Configure container timezone when a valid TZ is provided.
if [ -n "${TZ:-}" ] && [ -f "/usr/share/zoneinfo/${TZ}" ]; then
  ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
  echo "${TZ}" > /etc/timezone
fi

# Run as an alternate UID/GID when requested.
if [ -n "${PUID:-}" ] || [ -n "${PGID:-}" ]; then
  RUN_UID="${PUID:-$(id -u)}"
  RUN_GID="${PGID:-$(id -g)}"
  exec su-exec "${RUN_UID}:${RUN_GID}" "$@"
fi

exec "$@"
