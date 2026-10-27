---
description: Explains what the Subnotes plugin does and what to connect first. Use when starting out with it, or when unsure which command to run
---

Explain the Subnotes plugin to someone who has just installed it.

Call `list_notebooks` first — the answer depends on what it returns, and a
setup instruction the user has already completed is noise.

**If it reports an error** (no connector folder, or nothing connected), the
setup step is the whole answer. Tell them, in this order: Subnotes 1.4 or later
on a Mac is required; Settings in Subnotes (⌘,) lists every notebook with a
switch, and turning one on is what makes it visible here — right-clicking a
single notebook does the same for one at a time; only the notebooks they turn
on are shared.
Do not list the tools — none of them work yet, and the one next step is what
they need.

**If notebooks come back**, name them and say what is now possible:

- Ask what is on a notebook, or what to pick up next — reading is the point,
  not just writing.
- Say "put that on the backlog" mid-conversation and it lands in the right
  notebook and section. No command needed; they can name the notebook and
  section in the same sentence to be explicit.
- `/subnotes:run` — the one to start from, any time of day: it catches up on
  their notes and goals quietly (the journal, the review with its plan checks,
  the monthly prune, when due), then opens with what matters most today and
  works on it with them. The commands below still work on their own.
- `/subnotes:journal` — reads what they wrote in their Journal notebook
  and files what the skills need to know, so no skill asks for it again.
- `/subnotes:wrapup` — the same for a chat with Claude that didn't start
  from a skill: its decisions become learnings, its open tasks are proposed.
  Claude offers it when they wrap up such a chat.
- `/subnotes:prune` — once a month from `/subnotes:run`: clears what's stale,
  duplicated or contradicted out of what the skills have learned, on one yes.
- `/subnotes:review [goal]` — goes through their goals one at a time: for
  each, it reads the notebooks that serve it, raises what would move it, and
  adds a next step as a task on their yes. When a goal's plan check is due
  it checks the plan first: that the goal has a measure and a date, and that
  the plan can reach it in time, with the arithmetic shown. It remembers
  earlier reviews in its notes, and keeps what it learns where every skill
  reads it. Notebooks no goal links are reviewed briefly, by their purpose.
- Writing what's on their mind about a notebook — doubts, hunches,
  intentions — as plain text where it belongs is the other direction: the
  review reads new and changed lines each visit and turns them into open
  questions, learnings, or things to talk about.
- `/subnotes:do [notebook]` — finds the Today, Next and soon-due tasks across
  your notebooks (or the one named) that Claude can do in this session — code
  here, or a draft or write-up for any notebook — and does them, marking each
  Done once it's finished and checked.

Then state the two limits plainly, because both are surprising if discovered
later: writes only add, reschedule, or edit one line on your yes — a task
can be marked done, but nothing can be deleted or reordered — and only connected notebooks are readable, so an unconnected one is
invisible rather than private-but-visible.

Keep it short. This is an orientation, not a manual.
