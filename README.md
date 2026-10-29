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

Then install [Subnotes](https://subnotes.app) 1.7 or later, open its
**Settings** (⌘,), and turn on the notebooks you want Claude to see. Run
`/subnotes:help` if you would rather be walked through it.

Once the plugin is listed in the Claude plugin directory it can be installed
from there instead, without adding this marketplace first.

## What it does

- `list_notebooks` — names, purposes, section headings, open counts
- `read_notebook` — one notebook as plain text
- `search_notes` — the lines that hold every word of a query, across the
  connected notebooks, learnings and questions, each with where it sits
- `add_task` / `add_tasks` — append tasks to a notebook
- `add_subnotes` — add detail lines under an existing task (needs a Subnotes that knows it; an older one sets the write aside)
- `set_schedule` — reschedule an existing task: Today, Next, Soon, Someday, Done or a date (needs a Subnotes that knows it; an older one sets the write aside)
- `read_learnings` / `add_learning` / `correct_learning` — what the skills
  have learned, about one notebook or about you, shared by all of them; a
  learning can cite the line it came from (a fingerprint, never a copy), so
  the prune sees when that line is gone or Done
- `read_questions` / `add_question` / `close_question` — open questions that
  decisions depend on; an answered one becomes a learning
- `read_notes` / `write_notes` — the review's working memory per goal, or per
  notebook no goal links
- `review_context` — everything one goal's review needs, for the notebooks
  that serve it, in one call, with the lines scheduled Today, Next and Soon
  and only what changed since that goal's last review (kept as line
  fingerprints, never a copy of the text)
- `journal_entries`, `mark_journal_read` — what's new in the Journal
  notebook since Journal last ran, and marking it read
- `whats_due` — what `/subnotes:run` runs: each goal's last review and plan
  check, notebooks no goal links, the last prune, and the tasks Do would
  pick up
- `prune_context`, `remove_notebook_brain`, `mark_pruned` — the monthly
  prune: every learnings and questions file, the brain kept for a notebook
  no longer connected, and marking it done

Ask what is on a notebook, or what to pick up next — reading is half the point.
Say "put that on the backlog" mid-conversation and it lands in the right
notebook and section, or name them yourself: "… in Work, under Backlog".

`/subnotes:run` is the one command, to start from as often as you like: it
talks with you about what matters most today and works on it with you —
code in this folder, or a draft or write-up it writes under the task. Behind
that it catches up on whatever is due, with workers that each do one job in
their own context, at the same time, and never talk to you themselves:

- **the journal**, when there's a new entry: what you wrote becomes
  learnings, and any task it leads to is proposed;
- **one look per goal**, once a day for each goal whose notebooks changed:
  what would move it, and a next step when it has none. When a goal's plan
  check is due, every 30 days or when the goal changes, the run checks the
  plan with you: that the goal has a measure and a date, and that the plan
  can get there in time, with the arithmetic shown;
- **today's tasks**, sorted into what Claude can do now, what needs your
  input, and what only you can do;
- **a monthly tidy-up** of what the skills have learned, on one yes.

Only what needs you comes up, three things at a time, and one rating at the
end. Words after the command ask for one job: `/subnotes:run look at my
business goal`, `/subnotes:run prune`, `/subnotes:run let's talk about
pricing`.

For the other direction, write what's on your mind as plain text where it
belongs — "I wonder if Sam is as committed as I am" — and the goal's look
turns each new or changed line into an open question, a learning, or
something to talk about.

`/subnotes:wrapup` files what a chat with Claude that didn't start from
`/subnotes:run` decided, as learnings, with any task left open proposed on
your yes. Claude offers it when you wrap up such a chat, and a chat that
ends without it is filed when the session closes.

## Two rules that shape everything

**Writes only add, reschedule, or edit one line.** Tasks and lines under a
task can be added, a task can be rescheduled or marked Done, and one line's
words can be changed once you've seen the old and new line and said yes;
nothing can be deleted, reordered or renamed, and notebooks cannot be
created. A write that never removes a line cannot lose work, and an edited
line's old words stay in the conversation.

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
