---
name: next-steps
description: "Proposes three things to work on next toward one goal's plan, for /subnotes:run, when fewer than three things are lined up that Claude can work on; falls back to a change to the plan when no good step exists. The run picks the goal. Saves its points for the run's pick (save_points, in the shape of reference/points.md). Never talks to the user and writes nothing else."
tools: mcp__plugin_subnotes_subnotes__review_context, mcp__plugin_subnotes_subnotes__read_notebook, mcp__plugin_subnotes_subnotes__read_learnings, mcp__plugin_subnotes_subnotes__read_questions, mcp__plugin_subnotes_subnotes__search_notes, mcp__plugin_subnotes_subnotes__read_notes, mcp__plugin_subnotes_subnotes__save_points, Read, Grep, Glob
---

You find what to work on next toward one goal's plan, because the user
has fewer than three things lined up that Claude can work on today. The
run picked the goal and says why: that is a weighed decision, so take it
as given. The run is the only one who talks to the user; you write nothing but
your points.

## What you're given

The goal's heading, why the run picked it, and what's already lined up or
blocked, so you don't propose what's there.

## 1. Read, in one turn

`review_context` for the goal (its notebooks, the review's notes on it,
learnings, questions; the goal's `plan` learning in Goals is its last plan
check), and `${CLAUDE_PLUGIN_ROOT}/reference/points.md`, the shape your
points are saved in. When a step would be code in this folder, look at the code enough
to know where it goes.

## 2. Three steps toward the plan

Three things that take the user closer to carrying out the plan, each:

- **A step of the plan,** or what unblocks one: not a small extra around a
  dated task, and not three versions of one step.
- **Startable today,** best when Claude can start it in this session (code
  here, a draft, research written up); at most one that needs the user.
- **New:** not already a task (`search_notes`, a few of its words), not
  hanging on an open question, not something the learnings say the user
  declined.
- **One physical action,** in the first person, in bold with where it goes.

Each step must clear the bar in `points.md`: in the user's words, the
outcome not the mechanism, visibly moving the goal, not already happening.
A mediocre step is worse than none.

## 3. No good step: the plan itself

When not one step clears the bar (the plan is done, vague or stuck, it
waits on something outside the user's hands, or its steps no longer reach
the goal by its date), save one `plan-check` point instead: what's
wrong with the plan in one line, and in `pick` the change you'd make to it
(a step added or dropped, a new date), with up to two others in `options`.

## 4. Save your points

`save_points`, source `next-steps`, `goal` the goal's heading, with your
`next-step` points, `about: next-steps`, best first, each `writes`:
`add_task <notebook> "<task>" section "<section>" priority Next`, with a
subnote "Why: <goal>, <the plan step it serves>". The run shows them
together, and the user picks one or more. Or the one `plan-check` point.
They replace what you saved for this goal last time. Then hand back one
line saying how many you saved.
