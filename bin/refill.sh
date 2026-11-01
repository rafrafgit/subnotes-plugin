#!/bin/sh
# Starts /subnotes:refill headless and detached, so the workers it starts
# never wake the run (RUN_USE_CASES_SPEC.md). Its output and exit code go to
# refill.log in the agent folder, which today_context reads.
#   bin/refill.sh <agent folder>
# SUBNOTES_PLUGIN_DIR runs a plugin folder instead of the installed plugin.
AGENT="$1"
[ -d "$AGENT" ] || { echo "usage: refill.sh <agent folder>" >&2; exit 2; }
T=mcp__plugin_subnotes_subnotes__
TOOLS="Agent,Read,Grep,Glob,WebFetch,WebSearch"
for t in today_context whats_due review_context read_notebook list_notebooks read_learnings read_questions \
         search_notes read_notes write_notes add_learning correct_learning add_question close_question \
         journal_entries mark_journal_read save_points; do TOOLS="$TOOLS,$T$t"; done
# One refill at a time: a second one started while the first runs would
# review the same goals again. A lock older than 20 minutes is left from a
# refill that died, and is taken over.
LOCK="$AGENT/refill.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +20 2>/dev/null)" ]; then
    rm -rf "$LOCK"; mkdir "$LOCK" 2>/dev/null || { echo "Refill already running."; exit 0; }
  else
    echo "Refill already running."; exit 0
  fi
fi
(
  trap 'rm -rf "$LOCK"' EXIT
  claude -p "/subnotes:refill" ${SUBNOTES_PLUGIN_DIR:+--plugin-dir "$SUBNOTES_PLUGIN_DIR"} \
    --permission-prompts none --allowedTools "$TOOLS"
  echo "refill exit $? $(date '+%F %T')"
) >> "$AGENT/refill.log" 2>&1 < /dev/null &
echo "Refill started."
