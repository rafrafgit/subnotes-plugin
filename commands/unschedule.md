---
description: Stop the daily review turned on with /subnotes:schedule
---

Stop the daily review. Its switch is `~/.claude/subnotes/daily-review`.

Delete that file, and `~/.claude/subnotes/last-review` with it. If
`~/Library/LaunchAgents/app.subnotes.review.plist` exists — an earlier version
of `/subnotes:schedule` — also `launchctl bootout gui/$(id -u)/app.subnotes.review`
(an error that it isn't loaded is fine) and delete it.

If none of these existed, say the daily review wasn't on, and stop.

Leave the log at `~/Library/Logs/Subnotes/review.log` and every journal as they
are — the journals are the review's memory, and `/subnotes:review` by hand
still uses them.

Then, in one line: the daily review is off, and `/subnotes:review` still works
by hand.
