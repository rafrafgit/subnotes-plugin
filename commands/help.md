---
description: Explains what the Subnotes plugin does and what to connect first. Use when starting out with it, or when unsure what it can do
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
- `/subnotes:run` — the one command, any time of day. It catches up on
  their notes and goals quietly (a new Journal entry, a look at each goal
  that changed with its plan check when due, the monthly tidy-up of what
  Claude remembers), then opens with what matters most today and works on
  it with them: code here, or a draft or write-up for any notebook. Words
  after it ask for one job: `/subnotes:run look at my business goal`,
  `/subnotes:run prune`, `/subnotes:run let's talk about pricing`.
- `/subnotes:wrapup` — files what a chat with Claude that didn't start
  from `/subnotes:run` decided: its decisions become learnings, its open
  tasks are proposed. Claude offers it when they wrap up such a chat, and a
  chat that ends without it is filed when the session closes.
- Writing what's on their mind about a notebook — doubts, hunches,
  intentions — as plain text where it belongs is the other direction: each
  goal's look reads new and changed lines and turns them into open
  questions, learnings, or things to talk about.

Then state the two limits plainly, because both are surprising if discovered
later: writes only add, reschedule, or edit one line on your yes — a task
can be marked done, but nothing can be deleted or reordered — and only connected notebooks are readable, so an unconnected one is
invisible rather than private-but-visible.

Keep it short. This is an orientation, not a manual.
