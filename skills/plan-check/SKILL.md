---
name: plan-check
description: "For /subnotes:run only — checks one goal's plan with the user: is there a plan, can it reach the goal before its date, and is it working. Started by the run on the user's yes when a reviewer hands back that a goal's check is due or its plan looks broken."
user-invocable: false
---

You check one goal's plan with the user, inside the session: can it reach
the goal before its date at all, and is it working?

The goal, why its check is due (or the gap its reviewer found), and the
notebooks that serve it: $ARGUMENTS

## 1. Read

1. **The goal's context**: in one turn, call `review_context` with the
   goal (its notebooks, their learnings and the shared ones), and
   `read_notebook`, `read_learnings` and `read_questions` for Goals.
2. **The last check**: the goal's `plan` learning in Goals; start from it
   and look at what changed since.
3. **This week's tasks**: leave them out; ask only whether the plan can
   get there at all.

## 2. No goal yet

1. **The proposal**: when the arguments say there's no goal, work one out
   from the notebooks' goals and what they hold, with a number and a
   date, and ask once: "Would this be your goal: 4k a month from
   freelance work by June 2027?"
2. **On a yes**: add a task "Add this goal" at the top of Goals, with the
   heading as a subnote and the Why last:

   ```
   # <goal> [<yyyy-MM-dd>]
   Why: agreed in the plan check, <today>
   ```

3. **Then**: hand back.

## 3. Find the plan

1. **The plan**: how the user means to get there: a strategy, phases,
   the work named; not a heap of unrelated tasks, and not a direction
   ("Be more visible online").
2. **Where**: the text under the goal and its parts, and the notebooks it
   links; a scheduled heading there is a project in the plan, and its
   tasks are the work.

## 4. Check it

Check in order, and stop at the first gap.

1. **Substance**: none, or only a direction: work one out from "Given
   where this is today, what's needed to reach the goal?", with the
   things to build, or the use cases that show the goal is met, each with
   where it stands. Never fill a thin plan with dates or phases.
2. **It can reach the goal**:
   - **The number**: something in it leads to the number, and enough of
     it; check the assumption (do the clients it aims at pay enough for
     the 4k?).
   - **The date**: it fits before the date, in rough arithmetic you
     state: weeks left, hours a week, the size of what's open; when the
     hours aren't written and the answer turns on them, ask.
   - **The work**: there's work behind it, and its next step is a task.
3. **It's working**:
   - **The signal**: the one number that shows it's on track (new clients
     a month), from the notebooks; propose one when none is written; for a
     yes/no goal, whether it's happening yet.
   - **The pace**: the pace the date needs, against the signal now: "2
     clients in 10 weeks; the 4k by June needs about one a month".
   - **The verdict**: on pace, no gap; too early, say when it will show;
     behind, ask whether to change the plan, the effort or the goal.

## 5. Verdict and points, in one reply

1. **The opening**: the goal in the user's own words ("Your business
   goal, then:"); never the names of these steps.
2. **The verdict**, one line each:
   - the plan: good, or vague and what's vague;
   - will it reach the goal, and why, with the numbers;
   - an alternative, in a line;
   - not known: a fact or two that would change this, if any.
3. **No gap and nothing not known**: say so in a line, record it (section
   7) and hand back without asking anything.
4. **The points**: otherwise, the first gap, then any not-known, numbered
   in the same reply, each in a few lines:
   - what you found, short, with the numbers;
   - two or three options, and your pick and why: your own answer, never
     homework;
   - any write your pick leads to (a line as `− old` / `+ new`, tasks with
     where they go);
   - a fact only the user has, when the point turns on it.
5. **The question**: end with "Go with my picks, or tell me which to
   change?", then stop.
6. **The answer**: one yes takes all your picks and their writes; a point
   their answer changes may get one more short round, never more.

## 6. Learn, and write what was agreed

1. **A lesson**: when the user corrects your verdict, waves off a gap, or
   passes over your proposal for their own, save it right away
   (`add_learning`, source `plan`): "Don't treat X as a gap while Y: Z",
   in Goals for this goal, shared for how they plan; open your next reply
   with "Learned: …". A plain yes teaches nothing.
2. **New wording for a line already there** (a goal's What, a plan line):
   `edit_line`, as shown.
3. **New lines or a heading**: a task at the end of the section they go
   in ("Add as a part of the 4k goal"), with the lines as subnotes and
   "Why: agreed in the plan check, <today>" last; not when they've written
   it in already.
4. **Next steps**: tasks in the first person ("Ask my manager…"), one
   physical action each, in the section the work belongs in (`add_tasks`).

## 7. Record it, and hand back

1. **The check**: one learning for the goal (source `plan`, notebook
   Goals, `goal` its heading), replacing your earlier one
   (`correct_learning` with `goal`), else `add_learning` with `goal`;
   never a second:

   ```
   Goal: 4k/month by June 2027. Plan: retainer clients first; served by Freelance and Portfolio site. Signal: new clients a month, pace about 1; 0.8 on 2026-10-19. Checked with the user: no gap.
   ```

2. **Unsettled**: a gap the talk didn't close, or a not-known, becomes an
   open question (`add_question`, source `plan`).
3. **The reply**: hand back one line: the verdict and what was agreed
   ("Plan check: posts as the one channel, first reading after the first
   post").

## Rules

1. **Writes**: only add tasks, learnings and questions, and edit one line
   on the user's yes; never a heading (a goal's name), a notebook's goal,
   or more than one line per edit; never claim more.
2. **Yes first**: no task or line without their yes; one yes covers every
   write shown with it.
3. **Replies**: short, leading with the question, each option in one
   line; detail goes in the notebook.
