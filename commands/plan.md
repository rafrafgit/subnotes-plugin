---
description: Check that your goals are clear, your plan can reach them and is working, and work out what's missing with you
---

Check the user's goals and plans with them: is there something to work toward,
a way to get there, can that way actually get there in time, and is it
working so far? Then agree
the next steps. Notebook to check, if one was named:
$ARGUMENTS

This command needs someone at the keyboard: it is a conversation. If it was
started with `--scheduled`, or by anything other than the user typing it,
stop and do nothing.

## Read

Call `list_notebooks`. Then, in one turn:

- `read_notebook` for the notebook marked "Role: Goals", and for each notebook
  you're checking — the one named, or every connected notebook with a purpose.
- `read_learnings` and `read_questions` for each of them, which also give the
  shared ones. A learning from source `plan` is your last check; start from
  it and look at what changed since.

In a long notebook, what matters here is where it says what it's for, how it
means to get there, and its open Today, Next and Soon tasks. The rest is
background.

## Find the goals and the plans

By meaning, never by heading — a goal can sit under "About", in the purpose,
or in a line of a status section.

- A **goal** is what the user wants to be true. A good one has a measure and
  a date: "Earn at least 5k a month net from August 2027". A direction or a
  preference ("Be my own boss if possible") is worth knowing, but isn't a goal
  to check.
- A **plan** is how they mean to get there: a strategy, phases, months, a
  sequence of steps. A heap of unrelated tasks isn't one; scheduled steps that
  lead to the goal are.

There are two levels. The Goals notebook holds the goals and strategy across
everything. Each notebook's goal is its purpose, any goal it states, and any
goal in Goals it serves — Goals links it, or names its work. Its plan may be
in the notebook, or in what Goals' strategy says about it.

## Check, in order, and stop at the first gap

Each step only matters once the one before holds. Work on the first gap with
the user before going on; say that the rest waits on it.

1. **A goal.** None in Goals, or a notebook serving no goal: work one out
   with them.
2. **A well-defined goal.** It has a measure and a date. Only check what can
   be checked: whether it's achievable comes out of step 4, and whether it's
   the right goal is theirs to say.
3. **A plan** for each goal: how it will get there. None: work one out.
4. **A plan that can reach the goal.**
   - Something in it leads to the measure. A plan of learning and testing is
     fine, but some line has to say where the measure comes from.
   - It fits before the date. Rough arithmetic, stated: weeks left, hours a
     week, the size of what's open. If the hours aren't written anywhere and
     the answer depends on them, ask.
   - Every goal has work behind it: open tasks in a notebook that serves it.
   - Every notebook serves a goal, or Goals says it's parked. One that serves
     none is a question, never a judgment.
   - Its next step is a task in a notebook, scheduled or ready to be.
5. **A plan that's working.** Step 4 asks whether the plan can work on
   paper; this asks whether what's happening bears it out.
   - The **signal**: for each goal, the one number that shows the plan is on
     track — interviews a month, days the skills met the bar, signups per
     webinar. Take it from what the notebooks say (a status line, done
     tasks, counts the user wrote). None written: propose one and ask.
   - The **pace** the date needs, and where the signal is now, stated:
     "2 interviews in 10 weeks; landing a job by August needs about one a
     month".
   - On pace: no gap. Too early to tell: say when it will show. Behind: the
     plan's assumption isn't holding — ask whether to change the plan, the
     effort, or the goal. That's theirs to decide; never decide it for them.

Name what you find plainly, with the numbers ("10 months to August 2027, and
no line of the strategy produces income before then"). One gap at a time.

## Work it out with them

Ask one question at a time, and propose wording rather than asking for it:
"Would this be your goal: 5k a month net from August 2027, from the education
job first?" You can't write goals or plans into a notebook — writes only add
tasks — so once they agree, show the lines and say where they go:

```
Goals › Strategy, as a new first line:
- Land an education role by March 2027: the income that carries the rest.
```

and put them where they'll see them: a task at the end of the section they
go in, tagged `#idea` ("Add as the first line of Strategy #idea"), with the
agreed lines as subnotes and a last subnote "Why: agreed in
/subnotes:plan, <today>", so the review knows it isn't its own. Not when
they say they've already written it in.

Then the next steps that follow from it, as tasks, in the first person ("Ask
my manager…", not "Ask your manager…"). Show them, with the section
each goes in, and add them (`add_tasks`) only when they say yes, into a
section that exists — the one the work belongs in, without `#idea`: they've
already accepted them. Scheduled as they agree; leave priority out if they
don't say.

## Record what you agreed

For each notebook you checked, one learning (`add_learning`, source `plan`)
saying where its goal and plan are, its signal and pace, and what you found:
"Goal: 5k/month net by Aug 2027 (Goals). Plan: Goals' strategy, the
education job line. Signal: interviews a month, pace about 1; 0.8 on
2026-10-19. Checked with the user: no gap." Replace your earlier one
(`correct_learning`) rather than adding a second. The review reads these, so
it doesn't ask for what you've settled, and watches the signal against the
pace to know when to send the user back here.

What stays unsettled — "Is the webinar test meant to earn, or to learn?" —
goes in as an open question (`add_question`, source `plan`). Something they
said about how they plan that will hold next time is a learning without a
notebook.

## Then report

```
Goals — goal clear; strategy has no route to the 5k by August 2027
 Agreed: education job first (lines for Strategy in Goals › Strategy, as an #idea)
 Added: 2 tasks to Work › Backlog
Subnotes — serves learning, not income; Goals says so. No gap.
```

What you found, what was agreed, what you added, and what's left for them.

## Limits

- Writes only ever add tasks, learnings and questions: you can't edit a goal,
  a plan or a purpose, so never claim to have.
- Never write or change a purpose.
- Nothing is added without their yes.
