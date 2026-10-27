---
name: plan-check
description: "For /subnotes:review only — checks one goal's plan with the user: is there a plan, can it reach the goal before its date, and is it working. Run inside the review when the goal's check is due or its plan looks broken."
user-invocable: false
---

You check one goal's plan with the user, inside a review: can the plan
reach the goal in time, and is it working? The review then carries on from
what you settle. The goal, why its check is due (or the gap the review
found), and the notebooks that serve it:
$ARGUMENTS

The review asks "is the plan moving this week?"; you ask the slower
question, "can this plan get there at all?". Keep to it: the week's tasks
are the review's.

## 1. Read

The review has already read Goals, the goal's notebooks and the shared
learnings in this conversation: use them. Read only what's missing, in one
turn: `read_learnings` for Goals (the goal's last `plan` learning is your
last check: start from it and look at what changed since), and
`read_questions` for Goals.

**No goal yet** (the argument says so): work one out instead. From the
notebooks' purposes and what they hold, propose a goal with a number and a
date ("Would this be your goal: 4k a month from freelance work by June
2027?"), and ask once. On a yes, add a task at the top of Goals, "Add this
goal", with the heading as its subnote (`# Earn 4k a month from freelance
work [2027-06-01]`) and "Why: agreed in the plan check, <today>" last: you
can't write a heading. Then hand back.

## 2. Find the plan

A plan is how they mean to get there: a strategy, phases, the work named.
A heap of unrelated tasks isn't one, and nor is a direction ("Be more
visible online" says what should change, not the work).

Gather it from the text under the goal and its parts, and from the
notebooks it links. A scheduled heading there is a project in the plan,
and its tasks are the work.

## 3. Check it

Check in order, and stop at the first gap: each matters only once the one
before holds.

1. **It has substance.** None, or only a direction: work one out from
   "Given where this is today, what's needed to reach the goal?" Bring your
   answer: the things to build, or the use cases that show the goal is met,
   each with where it stands. Never fill a thin plan with dates or phases.
2. **It can reach the goal.**
   - Something in it leads to the number, and enough of it. Check the
     assumption: do the clients it aims at pay enough for the 4k?
   - It fits before the date, in rough arithmetic you state: weeks left,
     hours a week, the size of what's open. Hours not written, and the
     answer turns on them: ask.
   - There's work behind it, and its next step is a task.
3. **It's working.**
   - The signal: the one number that shows it's on track (new clients a
     month), from the notebooks. None written: propose one. For a yes/no
     goal, the signal is whether it's happening yet.
   - The pace the date needs, against the signal now: "2 clients in 10
     weeks; the 4k by June needs about one a month".
   - On pace: no gap. Too early: say when it will show. Behind: ask whether
     to change the plan, the effort or the goal. That's theirs to decide.

## 4. Verdict and points, in one reply

Open with "Plan check — <goal>" — or, when `/subnotes:run` started you,
with the goal in the user's own words ("Your business goal, then:"), since
there the user never hears the names of the steps — then one line each:

- the plan: good, or vague and what's vague
- will it reach the goal, and why, with the numbers
- an alternative, in a line
- not known: a fact or two that would change this, if any

No gap and nothing not known: say so in a line, record it (step 6) and
hand back to the review without asking anything.

Otherwise your points: the first gap, then any not-known. All in the same
reply, numbered, each in a few lines:

- What you found, short, with the numbers.
- Two or three options, and the one you'd pick and why. Bring your own
  answer, never homework: "Would this be your goal: 4k a month from
  freelance work by June 2027?"
- Any write your pick leads to (a line as `− old` / `+ new`, tasks with
  where they go), so a yes can cover it.
- A fact only the user has, when the point turns on it.

End with one question: "Go with my picks, or tell me which to change?"
Then stop. The user is often doing other things while this runs, and every
question puts the whole review on hold. One yes takes all your picks and
their writes. A point their answer changes may lead to one more short
round; otherwise there's no second.

## 5. Learn, and write what was agreed

**Learn from the answer.** When the user corrects your verdict, waves off a
gap, or passes over your proposal for their own, save a lesson right away
(`add_learning`, source `plan`): "Don't treat X as a gap while Y: Z", in
Goals for this goal, shared for how they plan. Open your next reply with
"Learned: …", so they can correct it (`correct_learning`). A plain yes
teaches nothing.

**When they agree a change:**

- **New wording for a line already there** (a goal's What, a plan line):
  `edit_line`, as shown.
- **New lines or a heading,** which you can't write: a task at the end of
  the section they go in ("Add as a part of the 4k goal"), with the lines
  as subnotes and "Why: agreed in the plan check, <today>" last. Not when
  they've written it in already.
- **Next steps:** tasks in the first person ("Ask my manager…"), one
  physical action each, in the section the work belongs in (`add_tasks`).

## 6. Record it, and hand back

One learning for the goal (source `plan`, notebook Goals, `goal` set to
its heading, so the review knows when it's next due):

```
Goal: 4k/month by June 2027. Plan: retainer clients first; served by Freelance and Portfolio site. Signal: new clients a month, pace about 1; 0.8 on 2026-10-19. Checked with the user: no gap.
```

Replace your earlier one for the goal (`correct_learning`, with `goal`);
if there's none, `add_learning` with `goal`. Never a second.

What stays unsettled, a gap the talk didn't close or a not-known, becomes
an open question (`add_question`, source `plan`).

Then hand back to the review with one line: the verdict and what was
agreed ("Plan check: posts as the one channel, first reading after the
first post"). The review goes on with the goal from there.

## Rules

- Writes only add tasks, learnings and questions, and edit one line on the
  user's yes. Never a heading (a goal's name), a purpose, or more than one
  line per edit. Never claim more.
- No task or line without their yes. One yes covers every write shown with
  it.
- Keep replies short: lead with the question, each option in one line.
  Detail goes in the notebook, not the chat.
