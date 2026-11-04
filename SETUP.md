---
description: Get the Subnotes plugin working — checks what is already in place and gives only the step that is missing.
---

Getting Subnotes connected. There are two halves, and only one of them lives
here: this plugin reads and writes files that the Subnotes app exports. Nothing
works until the app is installed and at least one notebook is turned on.

Call `list_notebooks` first. What it returns says which step, if any, is
actually missing — a setup instruction the user has already completed is noise.

**If it reports no connector folder**, the app is missing or too old. Subnotes
1.7 or later is required, on macOS. Point them at https://subnotes.app and say
the plugin has no iPhone or iPad equivalent, so a Mac is required even though
the notebooks sync everywhere.

**If it reports that macOS is blocking access**, neither half is broken and
neither needs reinstalling. When the message names the folder inside the app
(`~/Library/Containers/…`), their Subnotes is older and keeps the folder where
macOS 27 protects it: the fix is updating Subnotes, which moves it to
`~/Subnotes`, where no permission is needed. Until then, or when the folder
they picked is somewhere protected, Claude Code needs Full Disk Access: send
them to **System Settings → Privacy & Security → Full Disk Access**, to grant
whichever app is running Claude Code — a terminal, or Claude Code itself — and
to restart it afterwards. Say the grant is per-app and does not transfer.

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
when discovered later: writes only add, reschedule, or edit one line on your
yes — a task can be marked done, but nothing can be deleted or reordered — and an unconnected notebook is invisible rather
than private-but-visible.
