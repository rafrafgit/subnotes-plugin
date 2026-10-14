#!/bin/sh
# The daily review (/subnotes:schedule): on the first prompt of the day, in
# any Claude Code session, starts /subnotes:review in the background and
# returns at once. A prompt, not a session start: a session can stay open for
# weeks. Prints nothing — a UserPromptSubmit hook's output joins the prompt.
#
# Started from here rather than by launchd so it runs under the terminal's own
# Full Disk Access — a launchd job needs a grant of its own, given to the
# versioned claude binary, which an update breaks.
#
# It runs on every prompt, so every check is a file test, and a prompt where
# nothing is due costs a few milliseconds:
# off unless /subnotes:schedule wrote the flag, once a day, and only while
# Subnotes is open — before it opens, the notebooks are yesterday's export and
# suggestions couldn't land, so the day's run waits for a later prompt.

[ -n "$SUBNOTES_REVIEW_RUN" ] && exit 0      # the review's own session
dir="$HOME/.claude/subnotes"
[ -f "$dir/daily-review" ] || exit 0
pgrep -xq Subnotes || exit 0
today=$(date +%F)
[ "$(cat "$dir/last-review" 2>/dev/null)" = "$today" ] && exit 0
claude=$(command -v claude) || exit 0

# Recorded before starting, so a prompt in another session meanwhile doesn't
# start a second review.
echo "$today" > "$dir/last-review"
log="$HOME/Library/Logs/Subnotes/review.log"
mkdir -p "$(dirname "$log")"
echo "=== $(date '+%Y-%m-%d %H:%M')" >> "$log"
SUBNOTES_REVIEW_RUN=1 nohup "$claude" -p "/subnotes:review --scheduled" \
  --allowedTools "mcp__plugin_subnotes_subnotes__*" \
  >> "$log" 2>&1 < /dev/null &
exit 0
