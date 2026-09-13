---
description: Get the Subnotes plugin working — checks what is already in place and gives only the step that is missing.
---

Getting Subnotes connected. There are two halves, and only one of them lives
here: this plugin reads and writes files that the Subnotes app exports. Nothing
works until the app is installed and at least one notebook is turned on.

Call `list_notebooks` first. What it returns says which step, if any, is
actually missing — a setup instruction the user has already completed is noise.

**If it reports no connector folder**, the app is missing or too old. Subnotes
1.4 or later is required, on macOS. Point them at https://subnotes.app and say
the plugin has no iPhone or iPad equivalent, so a Mac is required even though
the notebooks sync everywhere.

**If it reports that no notebooks are connected**, the app is installed and the
one remaining step is turning a notebook on: **Settings** in Subnotes (⌘,)
lists every notebook with a switch. Right-clicking a single notebook and
choosing **Connect to Claude Code** does the same for one at a time. Say that
only the notebooks they turn on are visible here — everything else is never
exported at all, so it cannot be read. That is the whole privacy model and it
is worth stating rather than leaving them to guess.

**If notebooks come back**, setup is done. Name them, say they can now ask what
is on a notebook or say "put that on the backlog" mid-conversation, and stop.
Do not walk through the tools — `/subnotes:help` covers orientation, and
repeating it here makes a finished setup feel unfinished.

Two limits to state plainly if setup was needed, because both are surprising
when discovered later: writes only ever add — nothing can be marked done,
edited, deleted or reordered — and an unconnected notebook is invisible rather
than private-but-visible.
