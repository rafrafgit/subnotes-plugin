---
name: review-goals
description: "For /subnotes:review only — starts a review from the Goals notebook: checks there's a goal and a plan, raises what's in Goals with the user, agrees which notebooks to review in what order, and saves the review's Goals notes."
user-invocable: false
---

You start the user's review from their Goals notebook, before
`/subnotes:review` visits any one notebook. You talk with the user, then hand
back the order to visit. Notebook the user named for the review, if any:
$ARGUMENTS

## 1. Read Goals

*Get the big picture before looking at any one notebook.*

Call `list_notebooks`. Then, in one turn:

- `read_notebook` for the notebook marked **"Role: Goals"**: the user's
  goals and strategy across all notebooks.
- `review_context` for Goals alone: your notes on it, its learnings and
  questions, and the shared learnings and questions that hold everywhere.
- the `subnotes:review-ideas` skill, with Goals as its argument: it reads the
  `#idea` lines and returns replies and questions to raise.

Goals outranks any learning that disagrees with it.

## 2. Check there's a goal and a plan

*Nothing is worth suggesting until there's something to work toward and a
way to get there.*

- A **goal** is something the user wants to be true, best with a number and
  a date ("4k a month from freelance work by June 2027"). "Spend more time
  outdoors" is a direction, not a goal.
- A **plan** is how they'll get there: steps, phases, a strategy that names
  the work. A pile of unrelated tasks isn't a plan, and neither is a
  direction like "Be more visible online" — it says what should change, not
  what to do.

In Goals, every heading with a schedule is a goal, its schedule the goal's
date; a heading under another is part of it, and the text under a goal
links the notebooks that serve it (`[[Freelance]]`). Find the plan by
meaning: under the goal, or in those notebooks. If Goals has no goal, or
goals but no plan for them anywhere (in Goals or in the notebooks it links
to), stop the review here: "Goals — no goal (or plan) yet, so nothing else
was reviewed. Shall we run /subnotes:plan?" On a yes, save your Goals notes
(step 5) and start `subnotes:plan` with the Skill tool, with what's missing
as its argument.

## 3. Raise what's in Goals

*Points about the whole picture come before any one notebook.*

Worth raising, if there:

- a goal, phase or season whose date has passed — what comes next?
- a goal with no date yet (Today, Next, Soon or Someday, not a date)
- Goals says one thing comes first, but the "Last changed" dates in
  `list_notebooks` show the time going elsewhere — ask, never judge
- Goals' own `#idea` lines, as `review-ideas` returned them, and its tasks
  due now
- a vague goal, an open question other work waits on, or one open over
  three weeks

Don't raise what your notes or the learnings say was already talked through,
or what was declined, until its text changes.

Talk them through one at a time: say what you noticed, give two or three
options with the one you'd pick and why, and end on the one question that
decides it. When one is settled, save the decision as a learning
(`add_learning`, source `review`, Goals as the notebook) and close its
question (`close_question`). For an `#idea`, mark it seen as `review-ideas`
said and add the decision under it (`add_subnotes`): "Decided <today>: …".

Nothing to raise: say so in one line and go on.

## 4. Agree the order

*Decide together which notebooks to review today, and in what order.*

If a notebook was named above, it's the only one: skip this step. If it has
no purpose, say so and stop the review.

Otherwise, from `list_notebooks` and Goals, propose an order, one line each
with the reason, and ask to start with the first:

```
1. Freelance — proposal due tomorrow; Goals' main route to the 4k
2. Portfolio site — changed today; serves finding clients
Skipping: Newsletter — paused in Goals until March
Skipping: Recipes — no purpose
```

- **First:** what Goals puts first, a deadline soonest, a goal behind pace.
  A notebook serves the goals that link it.
- **Skip:** a notebook with no purpose (but review its `#idea` lines if it
  has any); one Goals parks, pauses or names as blocked; the Journal
  notebook, which `/subnotes:journal` reads.

## 5. Save your Goals notes

Rewrite the Goals notes in full (`write_notes`, Goals), under 60 lines, in
the review's notes format: Last visit, Goal and plan,
Waiting to ask, Observations — with what you saw of where the time is going
across notebooks. Facts, not plans; nothing about a task's schedule or due
date.

Then the review goes on to the first notebook in the order.

## Rules

- Keep replies short: lead with the question, in about 5 lines, each option
  in one line.
- Never write or change Goals' text or a purpose; the user does.
