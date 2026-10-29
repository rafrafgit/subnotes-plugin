# One voice: Run as conductor, the skills as workers

**Status: spec, not built.** Written 2026-10-29.

## Why

Run already acts as a conductor: it decides what's due and starts the other
skills. But each of those skills is also a full conversation of its own,
used two ways: talking to the user when they start it by hand, and quiet
when Run starts it. Most of what went wrong lately comes from that:

- **A mode leaked into behaviour.** "Quiet" was meant to change who
  speaks; the review and Do read it as "do less", and the run stopped
  proposing work (rated Waste of time).
- **Everything runs in one context.** Each skill's text and all its
  reading pile into Run's conversation, so the catch-up is slow and Run's
  1,900 words partly restate the other skills' rules.
- **Each skill rates itself.** Two ratings in one session, and a rating
  of the prune taken for the whole day; lessons filed under the skill that
  wrote them, not the one that caused them.

## What the practice says

From Anthropic's agent guidance (Building effective agents; the
multi-agent research system; Agent Skills best practices) and Claude Code's
subagents:

1. **Orchestrator–workers.** One lead agent owns the conversation and
   decides; workers each do one bounded job and hand back a result. The
   user talks to one voice.
2. **Workers get their own context.** A worker starts clean with what its
   task needs, does its reading there, and returns a condensed result. The
   lead sees results, not reading.
3. **A worker's task is written out.** Its objective, what to return and in
   what shape, which tools it may use, and where its job ends. Vague tasks
   make workers duplicate each other or stop short.
4. **Independent work runs in parallel.** Workers that don't depend on
   each other start together.
5. **Decide in code what code can decide.** Routing that follows rules
   (what's due, in what order) is code; the model decides what needs
   judgement.
6. **One job per worker.** Narrow skills are smarter skills: the review
   got drastically better at one goal at a time.
7. **Results go in a place, not in a chain of messages.** A worker writes
   what lasts (learnings, notes) itself and returns only what the lead
   must say or ask, so nothing is lost passing it along.

## The shape

```
                   ┌──────────────── Run (the conductor, the only voice) ────────────────┐
whats_due (code) → │ opening · points · work · follow-up · end · one rating              │
                   └───┬──────────┬──────────────┬──────────┬──────────┬────────────────┘
                       │ parallel │              │          │          │ background
                   journal   review: one     prune      do-plan     tune
                   worker    worker per goal  worker     worker      worker
                       └──────────┴──── points (the contract below) ──┘
```

- **Run** is the conductor: the only skill that talks to the user, holds
  the conversation, asks every question, does the work, and asks for the
  one rating.
- **Workers** are plugin agents (`agents/*.md`): each one job, its own
  context, a limited set of tools, and a model to fit (Sonnet for reading
  and judging; the conductor stays on the user's model). They never talk
  to the user: they write what lasts and return points.
- **Guides** are text the conductor reads when it needs it, not workers:
  the plan check, which is a conversation, and how to do a task well
  (today's Do rules).

## Workers

| Worker | One job | Starts when | Writes itself | Returns |
|---|---|---|---|---|
| journal | Turn new Journal entries into learnings and questions | `whats_due`: new entry | learnings, questions, marks read | points: what an entry raises that needs the user |
| review | One goal: its notebooks, its next step, what moves it | per goal `whats_due` lists, or every goal when Today and Next are empty | the goal's notes, `Why:` learnings | points, the first always the goal's next step when it has none; "plan check due" as a point |
| prune | What no longer holds in the brain | `whats_due`: due | nothing until the yes | one point: the changes, ready to apply |
| do-plan | Sort Today and Next: can do now, needs input, only the user | always | nothing | the ranked plan, each task with its group and reason |
| tune | Improve the skills from the week's lessons | `whats_due`: due | skill edits, commits, retired lessons | one line per change; its changes for the conductor to have checked |

Each worker's file says: its objective, its inputs (the conductor passes
what `whats_due` said), its tools, what it writes, the exact shape of what
it returns, and where it stops ("never asks; never adds a task; never edits
a notebook").

Started in parallel: journal, the review workers, prune, do-plan. A review
that depends on the journal (a new entry about a goal) gets the journal's
points passed in; it starts after it.

## The points contract

Every worker returns the same shape, so the conductor never has to know
how a worker thinks:

```
- goal: Land a job before the summer      (or notebook, or none)
  about: review                            (the worker, for the rating)
  rank: 1                                  (within this worker)
  noticed: one plain line
  pick: one plain line, with Claude's own answer (a draft, a date)
  options: up to two others, one line each
  writes: what a yes does — add_task …, set_schedule …, edit_line …
  kind: next-step | decision | plan-check | ongoing | prune | info
```

The conductor merges them: most important first across workers, at most
three shown at once, the rest held for later. A yes carries out `writes`
exactly; a correction becomes a lesson with `about` set to the worker.

## The conductor's flow

1. **At once:** `whats_due`, and one or two real lines from it alone.
2. **Start the workers** due, in parallel, in the background; keep talking
   while they read. Nothing waits on a worker that isn't needed for the
   opening.
3. **Open with today** once do-plan and the review workers are back:
   what matters most, the points (three at most), what it starts on.
4. **Work:** the tasks, one at a time, the way the Do guide says; the
   answers to points, carried out from their `writes`; a plan check, held
   as a conversation with the plan-check guide.
5. **Late results** (prune, tune) join the next report as one line each.
6. **End:** the summary, the filing of what the talk settled, and one
   rating for the session, with each lesson's `about` naming its worker.

## Starting a single job

The separate commands go. The user asks Run: `/subnotes:run look at my
business goal`, `/subnotes:run prune`, or "let's talk about pricing". Run
starts only the workers that request needs. One command, one voice, one
rating, matching the "few commands" decision.

## Limits to design around

- **A worker can't ask the user.** So anything that's a conversation
  stays with the conductor: the plan check, a talk about an idea, a
  correction. Workers only notice and propose.
- **A worker can't start another worker.** The tune's second-agent check
  is started by the conductor: tune returns its uncommitted changes, the
  conductor has a fresh checker judge each, and commits the ones that
  pass.
- **Workers start cold.** Each re-reads what it needs; `whats_due`,
  `review_context` and `tune_context` keep that to one call each.
- **Cost.** Parallel workers spend more tokens than one context, in
  exchange for time and focus. Sonnet for workers keeps it in check.

## What moves where

- `commands/run.md` → the conductor. Loses the parts that restate other
  skills; gains the points contract and how to merge.
- `commands/review.md` → `agents/review.md`, one goal per start; loses
  "Started quietly", the talking, the score and the rating. Plan check
  becomes a returned point.
- `commands/journal.md` → `agents/journal.md`; loses its talk and rating.
- `skills/prune` → `agents/prune.md`, returning the change list; the
  conductor applies it on the yes.
- `commands/do.md` → `agents/do-plan.md` (the sort) and a Do guide the
  conductor reads for doing the work.
- `skills/plan-check` → a guide the conductor reads.
- `skills/tune` → `agents/tune.md`; the check moves to the conductor.
- `skills/wrapup`, `add`, `notebooks` stay skills: they serve direct chats.
- `commands/help.md` stays.

## Steps, each one shippable

1. **The contract.** Write the points shape; have today's quiet skills
   return it. Nothing else changes; the run keeps working.
2. **Review as a worker.** `agents/review.md`, one per goal, in parallel.
   The biggest gain: speed and one job per worker.
3. **Journal, prune, do-plan as workers.**
4. **One voice.** Remove the talking modes and the per-skill ratings;
   the commands become Run's arguments.
5. **Tune's check in the conductor.**

## How we'll know it worked

- First real reply within 30 seconds, the opening within 90.
- One rating a session, and no lesson filed under the wrong skill.
- No mode bug: nothing a worker returns depends on how it was started.
- The ratings of the next two weeks no worse than this week's.

## Open questions

- Does a worker's `about` need finer grain than the worker (a section of
  its text), for the tune?
- Should do-plan and the review be one worker per goal, giving each goal
  its next step and today's tasks together?
