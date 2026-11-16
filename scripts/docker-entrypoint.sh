#!/bin/sh
set -eu
if [ "$(id -u)" = "0" ]; then
  # Railway mounts volumes with root ownership. Initialize only our directory.
  mkdir -p /data/storage
  chown node:node /data/storage
  exec gosu node "$@"
fi
exec "$@"
