# Subnotes plugin for Claude Code

Read your [Subnotes](https://subnotes.app) notebooks from Claude Code, and add
tasks to them — so "let's put that on the backlog" lands in the notebook instead
of dying with the conversation.

**Requires Subnotes 1.4 or later, on macOS.** Connect notebooks in Subnotes'
**Settings** (⌘,), which lists every notebook with a switch — or right-click a
single notebook and choose **Connect to Claude Code**. Only the notebooks you
turn on are visible here.

## Install

In Claude Code:

```
/plugin marketplace add rafrafgit/subnotes-plugin
/plugin install subnotes@Subnotes
```

Then install [Subnotes](https://subnotes.app) 1.4 or later, open its
**Settings** (⌘,), and turn on the notebooks you want Claude to see. Run
`/subnotes:help` if you would rather be walked through it.

Once the plugin is listed in the Claude plugin directory it can be installed
from there instead, without adding this marketplace first.

## What it does

- `list_notebooks` — names, purposes, section headings, open counts
- `read_notebook` — one notebook as plain text
- `add_task` / `add_tasks` — append tasks to a notebook
- `add_subnotes` — add detail lines under an existing task (needs a Subnotes that knows it; an older one sets the write aside)
- `set_schedule` — reschedule an existing task: Today, Next, Soon, Someday, Done or a date (needs a Subnotes that knows it; an older one sets the write aside)
- `read_learnings` / `add_learning` / `correct_learning` — what the skills
  have learned, about one notebook or about you, shared by all of them
- `read_questions` / `add_question` / `close_question` — open questions that
  decisions depend on; an answered one becomes a learning
- `new_thoughts` / `mark_thoughts_seen` — a notebook's new and still-open `#idea`
  thoughts, with what became of each (fingerprints only, never a copy of the text)
- `read_journal` / `write_journal` — the review's working memory per notebook
- `review_context` — everything a review visit needs, for several notebooks in
  one call, with only what changed since the last visit (kept as line
  fingerprints, never a copy of the text)
- `ideas_context` — everything the review's ideas sub-skill reads, for several
  notebooks in one read-only call

Ask what is on a notebook, or what to pick up next — reading is half the point.
Say "put that on the backlog" mid-conversation and it lands in the right
notebook and section, or name them yourself: "… in Work, under Backlog".

`/subnotes:review` reads each notebook that has a purpose, remembers earlier visits in a journal, and proposes a next step or
two when one is worth it: run by hand, you keep, drop or change each one in
Claude Code, and a kept one goes straight to the section it belongs in; the
daily run adds them as tasks tagged `#idea` in the section they're about.
`/subnotes:schedule` turns on a daily run:
your first prompt to Claude Code each day, while Subnotes is open, starts it
in the background with only this plugin's tools allowed (a `UserPromptSubmit`
hook, which does nothing until it's turned on). `/subnotes:unschedule` stops it.

Tag any line `#idea` for the other direction: write what's on your mind,
where it belongs — "I wonder if Mattias is as committed as I am #idea" — and
the review turns each new one into an open question, a learning, or a
suggestion, without ever quoting it. Its own suggestions are `#idea` tasks
too: schedule one or take the tag off to accept it.

`/subnotes:plan [notebook]` checks your goals and plans with you: that each
goal has a measure and a date, that there's a plan for it, and that the plan
can get there in time — with the arithmetic shown. It works out what's
missing with you and adds the next steps you agree to. The review asks for a
goal and a plan before it suggests anything else, and sends you here.

`/subnotes:do [notebook]` goes the other way: it reads a notebook's Today and
Next tasks, sorts them into what Claude can do in this session, what needs
your input first, and what only you can do, then does the one you pick, with
your usual permission prompts. A task it finishes and checks is marked Done;
one that still needs you to try it is left for you to mark.

## Two rules that shape everything

**Writes only add, or reschedule.** Tasks and lines under a task can be added,
and a task can be rescheduled or marked Done; nothing can be edited, deleted,
reordered or renamed, and notebooks cannot be created. A write that never
removes text cannot lose work.

**Reads are opt-in per notebook.** Only notebooks connected in Subnotes are
exported to the connector folder at all. An unconnected notebook is never
written to disk there, so this plugin cannot read it even if it misbehaves — it
is invisible rather than private-but-visible.

The server never touches the app's database. It reads text files the app
exports and writes JSON files the app picks up, inside the app's own container.
It has no dependencies: `node:fs`, `node:path`, `node:crypto` and
`node:readline` only, speaking JSON-RPC over stdio.

## If it can't read your notebooks

macOS keeps one app's files out of reach of another. If Claude Code has not
been granted Full Disk Access, the plugin can see that the Subnotes folder
exists but cannot open anything in it, and every tool fails with a permission
error.

Grant it in **System Settings → Privacy & Security → Full Disk Access**, to
whichever app is actually running Claude Code — your terminal, or Claude Code
itself — then restart that app. The grant does not transfer between them, so
running from a terminal you have not granted looks exactly like a plugin that
stopped working on its own.

## Configuration

None, normally. The server defaults to the folder Subnotes exports to inside
its own app container. The optional `folder` setting is there only for an
unusual install location.

## Development

```
node dev/make-fixture.mjs --connect "Work,Personal"
```

Builds a connector folder from a Subnotes backup. This is a development
stand-in only — a running Subnotes 1.4 supersedes it, exporting connected
notebooks itself and deleting files for anything not connected.

```
node dev/smoke.mjs        # exercises all four tools over stdio
```
