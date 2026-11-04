#!/bin/sh
# Opens /subnotes:run fast (2026-11-04): its command file runs this before
# Claude's first turn. Starts the refill (detached, so it never waits on it)
# and prints today's overview, the same text as today_context.
#   bin/today.sh
# The plugin's `folder` setting, when set, overrides the default folder.
HERE="$(cd "$(dirname "$0")" && pwd)"
SERVER="$HERE/../server/index.mjs"
[ -n "$CLAUDE_PLUGIN_OPTION_FOLDER" ] && export SUBNOTES_DIR="$CLAUDE_PLUGIN_OPTION_FOLDER"
AGENT="$(node "$SERVER" --agent-dir)"
[ -d "$AGENT" ] && "$HERE/refill.sh" "$AGENT" > /dev/null 2>&1
node "$SERVER" --today
