# Run: a task in seconds, refilled in the background

**Status: built 2026-10-30, not yet released (1.6.0).** Builds on ORCHESTRATOR_SPEC.md
(the conductor and its workers). That spec says how Run is built. This one
says what the user gets and how fast. Run gets rewritten from it, not from
rules added one by one.

## The idea

Every session is the same: **give me a task we can work on.** Either Juno
can do it straight away, or it needs the user's input. It doesn't matter
what time it is or how long the user was away (decided 2026-10-30).

Juno has the task within 10 seconds, because it doesn't wait for this
session's workers. It picks from what the last session's workers left
behind. This session's workers run in the background and refill the
store for the next pick and the next session.

```
 session N                          session N+1
 ─────────                          ───────────
 pick a task  ◄── pending.md ◄───┐  pick a task  ◄── pending.md ◄── …
   (≤ 10 s)                      │    (≤ 10 s)
 work on it                      │  work on it
   ║ background:                 │    ║ background:
   ║ reviewers, journal, ────────┘    ║ reviewers, journal,
   ║ next-steps                       ║ next-steps
```

Only a cold start, with an empty store and nothing in Today or Next, waits
for a worker: at most 45 s, with one line saying Juno is finding a task.

## Why

Run was rated Meh three times in a row: "over a minute … before anything
was said", "lots of 'Still…' and filler lines while workers come back",
"serves three things at once", "you did not propose any next tasks …
asked for this three times". The best sessions were fast and brought "a
task I had not thought of myself but was clearly helping me towards my
goal", with no machinery showing.

On 2026-10-30 the first task came after a do-plan worker (19 s, 10 tool
calls) and then a next-steps worker (91 s, 18 tool calls), one after the
other. Reading notebooks is fast: the server reads local files in
milliseconds. The time goes on the model round after every tool call, a
few seconds each. So: no worker on the path to the first task, and few
tool calls inside each worker.

## The session

1. **Pick (≤ 10 s).** One call (`today_context`) hands over everything:
   the work left open last session, the Today, Next and overdue tasks with
   their sections, subnotes and "Blocked by" lines, the goals with dates
   and plans, and `pending.md`. Juno picks one task, in this order:
   - the work left open last session;
   - a Today or Next task Juno can do, or one that needs the user's input;
   - from `pending.md`: a journal entry worth talking about, then a due
     plan check, then a step toward the goal whose plan most needs moving.

   Juno says the task in one line, with the goal it moves, and starts on
   it or asks the one question it needs.
2. **Refill, in the same first turn, in the background.** The reviewers
   that are due, the journal if there's a new entry, and next-steps
   whenever `pending.md` has fewer than three steps Juno could work on.
   Each saves its points to `pending.md` and hands back nothing.
   The goals and their plans keep their place: each reviewer still looks
   at the goal itself first (no number or date, a date passed) and saves
   that as a `decision` point, and saves a `plan-check` point when the
   check is due or the plan looks broken (no plan, no next step, behind
   pace). next-steps saves a plan change when no good step exists. The
   plan check itself stays a conversation with Juno (`subnotes:plan-check`),
   started from that point on the user's yes.
   **When a refill starts** (decided 2026-10-30): at the start of every
   session, and again during one when `pending.md` runs low (fewer than
   three points left that the user hasn't taken or turned down). It
   starts only the workers that are due, so a refill with nothing changed
   costs almost nothing.
3. **Work, one task at a time.** On each report Juno picks the next task
   the same way, now with whatever the workers have saved since.
4. **End.** The wrap-up, the prune and the skill update start together.
   Then one summary with everything done and everything left, a line each
   for the tidy-up and the skill changes, and the rating.

The user's own errands (an upload, a call) are never the task. They can
come in as one line ("the AfA upload is yours today").

## How the task is served: to be tested

One at a time or three to choose from? Earlier ratings point both ways.
"Serves three things at once … better one at a time" (10-30) argues for
one. But the Great sessions brought proposals the user picked from. So
both get tried, and the ratings decide (open 2026-10-30).

- **A: one task.** "Next: the H1 for the website. It moves your AI-native
  goal, and I can draft it now. Go?" The other candidates come up only
  when the user asks ("something else?").
- **B: three to choose from.** One line each, with the goal it moves,
  Juno's pick first: "1. The H1 (AI-native; I can draft it) · 2. Dry run
  of the skill update · 3. Plugin check. I'd start with 1."

**The test:** B for three sessions, then A for three (B first, decided 2026-10-30). Each rating's `did`
names the variant, and the why says how it felt. Then keep the one that
rated better, or a mix the ratings point to (for example A at the start,
B when the user says no).

## pending.md

The store between workers and Juno, in the agent folder beside `runs.md`.
Points are in the shape of reference/points.md, each under its goal.

- **Saved** by the reviewers, the journal and next-steps, with a tool
  (`save_points`).
- **Removed** once done, or once the user turns it down. A turned-down
  point leaves a learning with the reason, so it isn't proposed again.
- **Kept** until it's raised, across sessions.
- **Replaced** when the same goal's reviewer runs again, so a stale point
  never outlives a fresh look at its goal.

## Other cases

- **An idea or topic** (`/subnotes:run I have an idea about pricing`):
  answer it at once, as a thinking partner. No pick and no refill until
  the talk ends. Anything due gets one line at the end.
- **One job** (`/subnotes:run prune`, `… look at my business goal`): only
  that job, at once.

## What changes

1. **`today_context`**: one call for the pick, as above. **do-plan goes
   away**: Juno ranks from that call itself.
2. **`save_points`** and `pending.md`, as above. Workers stop handing
   points back as messages.
3. **A context pack per goal**: one call returns a goal, its plan, its
   notebooks' open sections and the learnings about it, so a reviewer or
   next-steps needs a few tool calls, not 18. Workers stop re-reading
   Goals and the same notebooks.
4. **Prune and tune move to the end,** beside the wrap-up.
5. **run.md rewritten from this spec,** under 1,200 words (it's 2,439).

## How the refill runs without waking Juno

A worker started with the Agent tool wakes Juno when it finishes, and the
harness asks for a reply: that's where the filler lines came from. So the
refill runs as its own headless session instead, started detached, which
never reports back (tested 2026-10-30):

```
nohup claude -p "/subnotes:refill" --permission-prompts none \
  --allowedTools <the read tools, save_points, add_learning, …> \
  > <agent folder>/refill.log 2>&1 &
```

- **It works:** a detached `claude -p` reaches the Subnotes tools and can
  start the plugin's workers (`subnotes:review`, `journal`, `next-steps`
  and the rest), so it runs them in parallel inside itself.
- **No wake-up:** the Bash call returns at once, and nothing notifies this
  session when it ends.
- **Safe:** `--permission-prompts none` denies anything not on the
  allowed list, so it can only read and save points and learnings.
- **Seen next time:** it logs to `refill.log`. If the last refill failed,
  `today_context` says so in one line, so a broken refill doesn't go
  unnoticed.
- **Runs the installed plugin,** like any session, so it changes with a
  release, not with the repo.

This needs a new command, `/subnotes:refill`, with no talk: what's due,
then the workers, each saving to `pending.md`.
