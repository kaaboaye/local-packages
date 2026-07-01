#!/bin/sh
# Disable upstream update paths and suppress native-install health checks.
export DISABLE_UPDATES=1
export DISABLE_INSTALLATION_CHECKS=1
exec /opt/claude-code/bin/claude "$@"
