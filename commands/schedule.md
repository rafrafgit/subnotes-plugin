---
description: Run the review by itself once a day, on your first prompt to Claude Code
---

Turn on the daily review: once a day, the first prompt to Claude Code while
Subnotes is open starts `/subnotes:review` in the background. Asked for,
if anything: $ARGUMENTS

It is the plugin's `UserPromptSubmit` hook (`hooks/daily-review.sh`), and it does
nothing unless `~/.claude/subnotes/daily-review` exists. That file is the
switch. Check for it first (`test -f`).

## Already on

Change nothing. In a few lines: it's on, when it last ran (the date in
`~/.claude/subnotes/last-review`) and the last report in
`~/Library/Logs/Subnotes/review.log` (each run starts with a `===` line). If
the log's last run shows an error, quote it. Mention `/subnotes:review` to run
one now, by hand, and `/subnotes:unschedule` to stop.

## Turning it on

Check these in order. Each one that fails stops here, and only that step is
reported.

1. **macOS.** `uname` is `Darwin`. Otherwise say this needs a Mac, as the
   connector does.
2. **Something to review.** Call `list_notebooks`. If it errors, that error is
   the answer (`/subnotes:help` walks through setup). If no notebook has a
   purpose, say a daily review would have nothing to do, and that giving a
   notebook a purpose is how it opts in.

Then `mkdir -p ~/.claude/subnotes && touch ~/.claude/subnotes/daily-review`.

If `~/Library/LaunchAgents/app.subnotes.review.plist` exists, it's the earlier
version of this command: `launchctl bootout gui/$(id -u)/app.subnotes.review`
and delete it, and say so in one line.

Why it works this way, so it isn't "improved" later:

- **On a prompt, not a session start.** A session can stay open for weeks;
  the first prompt of the day is when someone is actually working.
- **Started from a Claude Code session, not by launchd.** A process started
  here runs under the terminal's Full Disk Access, which reading Subnotes'
  folder already needs. A launchd job needs a grant of its own, given to the
  versioned `claude` binary, so every Claude Code update breaks it.
- **Only while Subnotes is open.** Before it opens, the plugin sees
  yesterday's export — edits from the iPhone arrive when Subnotes on the Mac
  opens — and suggestions couldn't land. The day's run waits for a later
  prompt.
- **`--allowedTools` is the plugin's own tools and nothing else.** Nobody is
  there to approve a tool call, and notebook text is not the user typing — so
  the run can read notebooks, write journals and add `#idea` tasks, and
  cannot run commands, edit files or reach the web.

## Then report

```
Daily review: on. Your first prompt to Claude Code each day, while Subnotes
is open, starts /subnotes:review in the background.
Log: ~/Library/Logs/Subnotes/review.log
Stop with /subnotes:unschedule.
```

Add that the first run is their next prompt (tomorrow's, if it already ran
today), and that each run uses their Claude plan — a notebook unchanged
since the last visit costs little.
