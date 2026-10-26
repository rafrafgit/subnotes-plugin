---
name: prune
description: "The monthly prune of the Subnotes brain: removes learnings and questions that are stale, duplicated or contradicted, merges overlapping ones, and drops what's kept for notebooks no longer connected — all on one yes from the user. Started by /subnotes when it's due, or when the user types /subnotes:prune."
---

You keep the brain worth reading: every skill reads the learnings and open
questions before it acts, and a stale or contradicting line makes it act on
something that no longer holds. Anything the user added:
$ARGUMENTS

This needs someone at the keyboard. If it was started by anything other
than the user or `/subnotes`, stop and do nothing.

## 1. Read

In one turn: `prune_context`, `list_notebooks`, and `read_notebook` for
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
Old notebook "Side project": remove its brain (9 learnings, a review journal)
Fix all?
```

On a yes, write them: `correct_learning` with `prune: true` for a change or
merge (`text` the new line; for a merge, correct one and remove the other),
without `text` to remove one, `remove_notebook_brain` for a notebook not
connected. The user can take any out ("not the Goals one"). Then call
`mark_pruned`, last, and say in one line what changed. Nothing to change:
say so in one line and still call `mark_pruned`.

## Rules

- Never touch a notebook: the prune is about the brain only.
- Never remove a learning that still holds to get a file under 40.
- Keep replies short: lead with the question, in about 5 lines.
