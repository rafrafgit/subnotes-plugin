---
description: Start here — what this plugin does and what to connect first
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
- `/subnotes:review` — a review agent per notebook: it reads the notebook
  against its purpose, remembers earlier visits in a journal, keeps what it
  learns about the notebook and about them where every skill reads it, and
  talks through what it finds, one question at a time, adding a next step as
  a task only once the talk shows it's worth doing. It reviews every
  connected notebook that has a purpose.
- Tagging any line `#idea` is the other direction: what's on their mind about
  a notebook — doubts, hunches, intentions — written where it belongs. The
  review reads new ones each visit and turns them into open questions,
  learnings, or things to talk about, never quoting them.
- `/subnotes:plan [notebook]` — checks with them that their goals have a
  measure and a date, that a plan exists for each, and that the plan can reach
  the goal in time; works out what's missing with them. The review won't
  suggest anything else in a notebook until it has a goal and a plan, and
  points here.
- `/subnotes:do <notebook>` — finds the Today and Next tasks Claude can do in
  this session, and does them, marking each Done once it's finished and checked.

Then state the two limits plainly, because both are surprising if discovered
later: writes only add or reschedule — a task can be marked done, but nothing
can be edited, deleted or reordered — and only connected notebooks are readable, so an unconnected one is
invisible rather than private-but-visible.

Keep it short. This is an orientation, not a manual.
