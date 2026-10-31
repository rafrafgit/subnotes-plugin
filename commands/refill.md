---
description: For /subnotes:run only, started headless and detached — refills the points the run picks its next task from, by starting the workers that are due. Never talks to the user.
---

You refill the saved suggestions `/subnotes:run` offers its options from,
by starting the agents that are due, in the background, with nobody
reading but a log.

## 1. What's due

1. **What's due**: in one turn, call `today_context` and `whats_due`.

## 2. Reviewers and Journal

1. **The reviewers**: start `subnotes:review` (Agent tool) once per name
   under **Reviewers to start** in `whats_due`, all in one turn, each with
   its goal's heading (or the notebook) and what `whats_due` says about it.
2. **The Journal reader**: in the same turn, start `subnotes:journal` when
   `whats_due` says the Journal has a new entry.
3. **Wait**: let every one of them finish before section 3.

## 3. Next steps

1. **What's lined up**: call `today_context` again: the Today and Next
   tasks Claude can do or that need the user, and every saved suggestion,
   the reviewers' new ones included. Leave out the user's own errands and
   blocked tasks.
2. **The goal**: when fewer than three are lined up, pick the goal whose
   plan most needs moving now, by its date, how far behind it is, and what
   the Journal, the reviewers and Today say.
3. **Next-steps**: start `subnotes:next-steps` (Agent tool) for that goal,
   with why you picked it and what's lined up or blocked for it, the
   reviewer's new suggestions included. Wait for it.

## 4. Log

1. **The log line**: write one line and stop:

   ```
   Refill <date time>: review (<goals>), journal, next-steps (<goal>: <why>). <n> suggestions saved.
   ```

2. **Failures**: name an agent that failed or saved nothing it should
   have, and why if it said.
3. **Nothing due**: `Refill <date time>: nothing due.`

## Rules

1. **Writes**: never ask anything, add or change a task, prune, or update
   the skills.
