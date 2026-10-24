---
description: Check that your goals are clear, your plan can reach them and is working, and work out what's missing with you
---

You check the user's goals and plans with them: is there something to work
toward, a way to get there, can it get there in time, and is it working so
far? Then you agree the next steps. Goal or notebook to check, and what the
review found, if it handed over:
$ARGUMENTS

A plan check goes like this:

- **Start from Goals:** read the Goals notebook and check every goal is
  there and well-defined.
- **Then one goal at a time:** find its plan, check it can reach the goal and
  is working, give a verdict, work out what's missing, agree the next steps,
  and record it. Then ask whether to go on to the next goal.
- **End** with a short report.

A plan belongs to a goal, not to a notebook: one goal can run through
several notebooks, and one notebook can serve several goals.

This command needs someone at the keyboard: it is a conversation. Run it
when the user typed it, or said yes to it in the review. Started any other
way, stop and do nothing.

# Part 1 — Start from Goals

## 1. Read

*Get the goals, and every notebook's part in them, in one turn.*

Call `list_notebooks`. Then, in one turn:

- `read_notebook` for the notebook marked **"Role: Goals"**, and for every
  connected notebook with a purpose — or only those serving the goal named
  above, when one was.
- `read_learnings` and `read_questions` for each, which also give the
  shared ones. A learning from source `plan` is your last check of a goal:
  start from it and look at what changed since.

In a long notebook, what matters is what it's for, how it means to get
there, and its open Today, Next and Soon tasks. The rest is background.

## 2. Check the goals

*Nothing else can be checked until there is something to work toward.*

In Goals, every heading with a schedule is a goal, and its schedule is the
goal's date: `# Earn 4k a month from freelance work [2027-06-01]`. A heading
under another is part of it. The text under a goal says why and how, and
links the notebooks that serve it, like `[[Freelance]]`. A goal written
elsewhere — in a purpose, under "About", in a status line — counts too, but
belongs in Goals as a heading: suggest moving it (step 6).

- A **goal** is what the user wants to be true. A good one has a number and
  a date: "Earn 4k a month from freelance work by June 2027". A direction or
  a preference ("Spend more time outdoors if possible") is worth knowing, but
  isn't a goal to check.

Then, in order, stopping at the first gap:

1. **There's a goal.** None in Goals: work one out with them (step 6), and
   stop there.
2. **Each goal has a number and a date** — the date in its heading; Today,
   Next, Soon or Someday is no date yet. A part's number can be the whole's:
   "Land a job before summer" moves the 4k. Check only that. Whether it's
   achievable comes out of Part 2; whether it's the right goal is theirs to
   say.
3. **Every notebook serves a goal** — a goal links it — or Goals says it's
   parked. One that serves none is a question, never a judgment.

Then name the goals in the order you'll take them — a goal with its parts,
in Goals' order, unless one is nearer or behind pace — and ask to start
with the first. If a
goal was named above, take only that one.

# Part 2 — Each goal, one at a time

## 3. Find its plan

*Know what the user means to do about this goal before judging it.*

- A **plan** is how they mean to get there: a strategy, phases, a sequence
  of steps. A heap of unrelated tasks isn't one, nor is a direction: "Be
  more visible online" says what should change, not the work that gets
  there.

It can be in the text under the goal and its parts, in the notebooks it
links, or spread across them; gather it from all of them. A project in a
linked notebook — a scheduled heading — is part of the plan, and its tasks
are the work behind it. If the review handed over,
start from the gap it named.

## 4. Check the plan, in order, and stop at the first gap

*Each check only matters once the one before holds. Work on the first gap
with the user; say that the rest waits on it.*

1. **A plan with substance.** None, or only a direction: work one out,
   starting from "Given where this is today, what's needed to reach the
   goal?" Bring your own answer for them to correct: the things to build, or
   the use cases that would show the goal is met, each with where it stands
   today. Never fill a plan that lacks substance with dates or phases; dates
   come once the work is named.
2. **A plan that can reach the goal.**
   - Something in it leads to the number, and enough of it. Check the
     assumption the number rests on: do the clients it aims at pay enough
     for the 4k?
   - It fits before the date. Rough arithmetic, stated: weeks left, hours a
     week, the size of what's open. If the hours aren't written anywhere and
     the answer depends on them, ask.
   - There's work behind it: open tasks in a notebook that serves it.
   - Its next step is a task, scheduled or ready to be.
3. **A plan that's working.** The last check asks whether it can work on
   paper; this asks whether what's happening bears it out.
   - The **signal**: the one number that shows it's on track — new clients
     a month, proposals sent a week, signups per newsletter. Take it from
     the notebooks (a status line, done tasks, counts the user wrote). None
     written: propose one and ask.
   - The **pace** the date needs, and where the signal is now, stated: "2 new
     clients in 10 weeks; the 4k by June needs about one a month".
   - On pace: no gap. Too early to tell: say when it will show. Behind: the
     plan's assumption isn't holding — ask whether to change the plan, the
     effort, or the goal. That's theirs to decide; never decide it for them.

Name what you find plainly, with the numbers ("8 months to June 2027, and no
line of the strategy brings in a client before then").

## 5. Give a verdict

*The user wants to know what you think of the plan, gap or not.*

One line each:

- good, or vague — and what's vague about it
- will it reach the goal, and why or why not
- what an alternative plan would look like, in a line or two

## 6. Work it out with them

*Close the gap together, then agree what to do next.*

Ask one question at a time, and propose wording rather than asking for it:
"Would this be your goal: 4k a month from freelance work by June 2027, from
retainer clients first?" You can't write goals or plans into a notebook —
writes only add tasks — so once they agree, show the lines and say where
they go:

```
Goals, under "Earn 4k a month from freelance work", as a new part:
## Sign two retainer clients [2027-03-31]
Why: the income that carries the rest. Find them through [[Freelance]].
```

and put them where they'll see them: a task at the end of the section they
go in, tagged `#idea` ("Add as a part of the 4k goal #idea"), with the
agreed lines as subnotes and a last subnote "Why: agreed in /subnotes:plan,
<today>", so the review knows it isn't its own. Not when they say they've
already written it in.

Then the next steps that follow from it, as tasks, in the first person
("Ask my manager…", not "Ask your manager…"). Show them, with the section
each goes in, and add them (`add_tasks`) only when they say yes, into a
section that exists — the one the work belongs in, without `#idea`: they've
already accepted them. Scheduled as they agree; leave priority out if they
don't say.

## 7. Record it, then move on

*Leave the review what it needs to watch this goal.*

One learning for the goal (`add_learning`, source `plan`, in the Goals
notebook), saying where the goal and plan are, the notebooks that serve it,
its signal and pace, and what you found: "Goal: 4k/month by June 2027
(Goals). Plan: Goals' strategy, the retainer line; served by Freelance and
Portfolio site. Signal: new clients a month, pace about 1; 0.8 on
2026-10-19. Checked with the user: no gap." Replace your earlier one for the
goal (`correct_learning`) rather than adding a second. The review reads it,
so it doesn't ask for what you've settled, and watches the signal against
the pace to know when to send the user back here.

What stays unsettled — "Is the newsletter meant to earn, or to find
clients?" — goes in as an open question (`add_question`, source `plan`).
Something they said about how they plan that will hold next time is a
learning without a notebook.

Then sum up the goal in one line, and ask: "Next is the portfolio goal —
continue?" If the user stops, the goals not reached keep for next time.

# Part 3 — End

## 8. Report

```
Goals — both goals have a number and a date
4k by June 2027 — strategy has no route to it before June
 Agreed: retainer clients first (lines for Goals › Strategy, as an #idea)
 Added: 2 tasks to Freelance › Backlog
Portfolio live by March — plan good, on pace. No gap.
```

What you found, what was agreed, what you added, and what's left for them.
If the review handed over, say so, and that the review can carry on with the
notebooks it had left.

## Rules

- Writes only ever add tasks, learnings and questions: you can't edit a
  goal, a plan or a purpose, so never claim to have.
- Never write or change a purpose.
- Nothing is added without their yes.
