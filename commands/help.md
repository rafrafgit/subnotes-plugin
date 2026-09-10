---
description: What this plugin can do, and what to do first
---

Explain the Subnotes plugin to someone who has just installed it.

Call `list_notebooks` first — the answer depends on what it returns, and a
setup instruction the user has already completed is noise.

**If it reports an error** (no connector folder, or nothing connected), the
setup step is the whole answer. Tell them, in this order: Subnotes 1.4 or later
on a Mac is required; right-clicking a notebook and choosing "Connect to Claude
Code" is what makes it visible here; only the notebooks they connect are shared.
Do not list the tools — none of them work yet, and the one next step is what
they need.

**If notebooks come back**, name them and say what is now possible:

- Ask what is on a notebook, or what to pick up next — reading is the point,
  not just writing.
- Say "put that on the backlog" mid-conversation and it lands in the right
  notebook and section. No command needed; this is the common case.
- `/subnotes:add <thing>` when they want to be explicit about it.

Then state the two limits plainly, because both are surprising if discovered
later: writes only ever add — nothing can be marked done, edited, deleted or
reordered — and only connected notebooks are readable, so an unconnected one is
invisible rather than private-but-visible.

Keep it short. This is an orientation, not a manual.
