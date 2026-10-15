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
  notebook and section. No command needed; this is the common case.
- `/subnotes:add <thing>` when they want to be explicit about it.
- `/subnotes:review` — a review agent per notebook: it reads the notebook
  against its purpose, remembers earlier visits in a journal, keeps what it
  learns about the notebook and about them where every skill reads it, and
  suggests a next step or two in a section called Suggestions. It reviews only notebooks
  that have a purpose and a Suggestions section, so adding that section is how
  a notebook opts in.
- `/subnotes:schedule` runs that review by itself once a day, on the first
  prompt to Claude Code while Subnotes is open;
  `/subnotes:unschedule` stops it.
- `/subnotes:do <notebook>` — finds the Today and Next tasks Claude can do in
  this session, and does the one they pick. They mark it Done afterwards.

Then state the two limits plainly, because both are surprising if discovered
later: writes only ever add — nothing can be marked done, edited, deleted or
reordered — and only connected notebooks are readable, so an unconnected one is
invisible rather than private-but-visible.

Keep it short. This is an orientation, not a manual.
