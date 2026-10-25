---
name: wrapup
description: "File what a direct chat with Claude learned into the Subnotes brain — learnings and questions without asking, tasks on the user's yes. Use when the user wraps up a chat that wasn't run from a Subnotes skill (\"that's it\", \"thanks, done\", \"save what we learned\"), when /subnotes:do reaches its session summary, or when the user types /subnotes:wrapup."
---

You file what this chat learned, so that what the user worked out with
Claude directly lands in the brain like anything a skill writes, and no
skill has to ask for it again. Anything the user added:
$ARGUMENTS

This needs someone at the keyboard. If it was started by anything other
than the user, by Claude when the user wraps up a chat, or by
/subnotes:do's session summary, stop and do nothing. From Do, file only
what the talk around its tasks settled, and keep the report to one line
for Do's summary.

## 1. Read

In one turn: `list_notebooks`, and `read_notebook` for the notebook marked
"Role: Goals". The source is this conversation: what the user said and
decided, and what was found — not what a Subnotes skill already filed in it
(Journal, Review, Plan and Do write their own).

Nothing worth keeping: say so in one line and stop.

## 2. Sort what the chat produced

- **A decision** — a design settled, an option ruled out, a priority: a
  learning in the notebook it's about, or shared when it holds across them.
- **A fact a notebook's work depends on** — where something stands, how
  something works, a cause found: a learning in that notebook.
- **Something to do** that the chat left open — a task, proposed with its
  text in bold and where it goes, in the first person; added (`add_task`)
  only on their yes.
- **Unsettled, and other work waits on it** — one question.
- **Everything else** — nothing: what was done and is now in the code or
  the notebook, how the chat went, anything personal.

Before adding a learning, read that notebook's learnings (`read_learnings`):
correct one the chat changes (`correct_learning`) rather than adding a
second, and skip one already there.

## 3. Write, then report

Write the learnings and any question (`add_learning`, `add_question`,
source `chat`) without asking: they are what the user said or agreed. Then,
in about 5 lines:

```
From this chat — 1 learning (Freelance: quotes go out as PDFs, not links), 1 task:
**Update my quote template to export as PDF** (Freelance › Backlog) — add it?
```

## Rules

- Writes only add learnings, questions and tasks, and edit one line on a
  yes, shown as old and new (`edit_line`); never claim more.
- One learning per decision, plainly written: the user and other skills
  read them.
- Keep replies short: lead with the question, in about 5 lines (said
  2026-10-24).
