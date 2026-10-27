---
name: prune
description: "The monthly prune of the Subnotes brain: removes learnings and questions that are stale, duplicated or contradicted, merges overlapping ones, and drops what's kept for notebooks no longer connected — all on one yes from the user. Started by /subnotes:run when it's due, or when the user types /subnotes:prune."
---

You keep the brain worth reading: every skill reads the learnings and open
questions before it acts, and a stale or contradicting line makes it act on
something that no longer holds. Anything the user added:
$ARGUMENTS

This needs someone at the keyboard. If it was started by anything other
than the user or `/subnotes:run`, stop and do nothing.

**Started quietly** (the argument is `quiet`): `/subnotes:run` started you
and does the talking. Read and find what no longer holds as below, then
hand the changes back as one point, in a line the user can say yes to
without knowing what a prune is ("I'd tidy what I remember about you: 6
lines that no longer hold — 2 merged, 4 out of date. OK?"), with the full
list ready if they ask. Don't rate. On their yes the writes and
`mark_pruned` follow as below; nothing to change: call `mark_pruned` and
hand back nothing.

## 1. Read

In one turn: `start_run` (skill `prune`), `prune_context`, `list_notebooks`, and `read_notebook` for
every connected notebook — a learning is checked against the notebook as it
stands now, not against other learnings alone.

## 2. Find what no longer holds

Go through every entry and pick out:

- **Not connected** — a notebook `prune_context` lists as not connected:
  its whole brain goes, unless the user says it's coming back.
- **Contradicted** — by a newer learning, or by the notebook now (a
  section, name or decision it describes has changed). Removed, or
  corrected to what holds.
- **Stale** — about something since built, renamed, removed or dropped,
  where the line no longer changes what a skill does. Removed.
- **Duplicated or overlapping** — two that say the same, or that read
  better as one. Merged into one line.
- **Chained** — a line carrying old versions ("was: …"). Cut to what holds now.
- **Source gone or Done** — `prune_context` marks a learning whose cited
  line is gone or Done (`← its source task in Work is Done`). Often stale
  then, but not always: a decision outlives the task that made it. Check it
  like any other.
- **Answered questions** still open. Closed (`close_question`).

A file over 40 learnings is cut to 40 by the same rules, never by dropping
what still holds. Leave everything else as it is: a prune doesn't reword
lines that hold.

## 3. Ask once, then write

Show what you'd change, grouped by notebook, one line each, then ask once:

```
Prune — 6 changes:
Goals: remove 2 (still say "North Star"); cut the 5k plan line to its current version
Subnotes: merge 2 pairs (now 40); correct "What good looks like" (its measure was questioned)
Old notebook "Side project": remove its brain (9 learnings, review notes)
Fix all?
```

On a yes, write them: `correct_learning` with `prune: true` for a change or
merge (`text` the new line; for a merge, correct one and remove the other),
without `text` to remove one, `remove_notebook_brain` for a notebook not
connected. The user can take any out ("not the Goals one"). Then call
`mark_pruned`, and say in one line what changed. Nothing to change:
say so in one line and still call `mark_pruned`, without a rating.

## Rate the run

Call `end_run` (skill `prune`), then ask with the AskUserQuestion tool, the
question one line, the time and what was done:

```
6 min · 6 changes, Subnotes down to 40 · How was this run?
```

Options: Great, Good, Meh, Waste of time. Then ask why, once, in one line of
the chat: "Why was it good?" on Great or Good, "What would have made it
worth it?" on Meh or Waste of time. The ratings are how the skills learn,
and the why is what they learn from. Save it with `rate_run` once they've
answered: the line without the time as `did`, the why and anything else they
typed as `comment`; no rating is `Skipped`. Save the why as a lesson too
(`add_learning`, shared, source `prune`): what to keep doing, or what to
change.

## Rules

- Never touch a notebook: the prune is about the brain only.
- Never remove a learning that still holds to get a file under 40.
- Keep replies short: lead with the question, in about 5 lines.
