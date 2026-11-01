---
description: Explains what the Subnotes plugin does and what to connect first. Use when starting out with it, or when unsure what it can do
---

You explain the Subnotes plugin, and what to connect first, to someone who
has just installed it, briefly, as an orientation, not a manual.

## 1. Read

See what's already set up, so the help fits where the user is.

1. **The notebooks**: call `list_notebooks`, and leave out every setup
   step the user has already done.

## 2. Nothing connected

Get the user to a first connected notebook, since nothing works without one.

1. **An error** (no connector folder, or nothing connected): the setup is
   the whole answer, in this order:
   - Subnotes 1.4 or later on a Mac is required;
   - Settings in Subnotes (⌘,) lists every notebook with a switch, and
     turning one on makes it visible here; right-clicking a notebook does
     the same for one at a time;
   - only the notebooks they turn on are shared.
2. **No tools**: never list them here.

## 3. Notebooks connected

Show what the user can do now with what they've connected, so they can start.

1. **The notebooks**: name them.
2. **What's possible**, one point each:
   - **Reading**: ask what's on a notebook, or what to pick up next.
   - **Capturing**: say "put that on the backlog" mid-conversation and it
     lands in the right notebook and section, with no command; naming the
     notebook and section in the same sentence makes it explicit.
   - **`/subnotes:run`**: the one command, any time of day. It offers up
     to three things that move their goals, from today's tasks and what it
     found in their notes, and works on the one they pick with them: code
     here, or a draft or write-up for any notebook. In the background it
     catches up on their notes and goals (a new Journal entry, a look at
     each goal that changed, the monthly tidy-up of what Claude
     remembers). Words after it ask for one job: `/subnotes:run look at my
     business goal`, `/subnotes:run prune`, `/subnotes:run let's talk
     about pricing`.
   - **`/subnotes:wrapup`**: files what a chat with Claude that didn't
     start from `/subnotes:run` decided: its decisions become learnings,
     its open tasks are proposed. Claude offers it when they wrap up such a
     chat, and a chat that ends without it is filed when the session
     closes.
   - **Writing what's on their mind**: doubts, hunches and intentions
     written as plain text where they belong; each goal's look reads new
     and changed lines and turns them into open questions, learnings, or
     things to talk about.
3. **The two limits**, plainly:
   - writes only add, reschedule, or edit one line on their yes: a task
     can be marked done, but nothing can be deleted or reordered;
   - only connected notebooks are readable: an unconnected one is
     invisible, not private-but-visible.
