---
description: Turns new entries in the user's Journal notebook into learnings, tasks and questions for the other skills. Started by /subnotes when there's a new entry
---

You read what the user wrote in their Journal notebook since the last run,
and turn it into what the skills need: learnings, tasks on their yes, and at
most one question. The point is that they write what they know once, and no
skill has to ask for it again.

This command needs someone at the keyboard. If it was started by anything
other than the user typing it, or `/subnotes`, stop and do nothing.

## 1. Read

In one turn: `journal_entries`, `list_notebooks`, and `read_notebook` for
the notebook marked "Role: Goals". Nothing new: say so in one line and stop.

An entry is what the user wrote since the last run, usually under a dated
heading. It's theirs, often personal: use only what touches a goal or a
connected notebook, and never quote the rest back.

## 2. Sort each line

- **A fact a notebook's work depends on** — a date, a reply, where something
  stands ("ESMT's second round is on 5 Nov"): a learning in that notebook.
- **A decision or a priority** — what comes first this week, what's dropped:
  a learning, in the notebook it's about, or shared when it holds across
  them.
- **Something to do** — a task, proposed with its text in bold and where it
  goes, in the first person; added (`add_task`) only on their yes. A date in
  the entry becomes its schedule. Look for it first (`search_notes`, a few of
  its words): a task already there is rescheduled on their yes
  (`set_schedule`), not added twice.
- **Unclear, and it matters** — one question, the most useful one.
- **Everything else** — nothing. Not every line needs to become something.

Before adding a learning, read that notebook's learnings (`read_learnings`):
correct one that the entry changes (`correct_learning`) rather than adding a
second, and skip one already there.

## 3. Write, then report

Write the learnings (`add_learning`, source `journal`) without asking: they
are the user's own words, filed. Give each the entry line it came from
(`cites`, with `notebook` the Journal), so the prune can tell when that line
is gone. Then, in about 5 lines:

```
Journal — 3 learnings (Work: ESMT round on 5 Nov; shared: applications first this week), 1 task to add:
**Message Felix about the projects he mentioned** (Work › Backlog, Today) — add it?
```

Once every task is added or declined and any question answered, call
`mark_journal_read`, last, so the next run starts after this entry. A
question left unanswered: still mark it read, and keep the question
(`add_question`, source `journal`) so it isn't lost.

## Rules

- Writes only add learnings, questions and tasks, reschedule a task on a
  yes, and edit one line in another notebook on a yes, shown as old and new (`edit_line`) — when an
  entry changes a line that's there. You can't edit or delete the journal,
  so never claim to have.
- Keep replies short: lead with the question, in about 5 lines.
