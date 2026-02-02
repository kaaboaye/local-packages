#!/bin/sh
# Wrapper to prevent claude from detecting /usr/bin/claude as npm-global installation
export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-/nonexistent}"
# Disable autoupdater (managed by local-packages)
export DISABLE_AUTOUPDATER=1
exec /opt/claude-code/bin/claude "$@"
