---
name: wrapup
description: "File what a direct chat with Claude learned into the Subnotes brain — learnings and questions without asking, tasks on the user's yes. Use when the user wraps up a chat that wasn't run from a Subnotes skill (\"that's it\", \"thanks, done\", \"save what we learned\"), when /subnotes:run reaches its session summary, or when the user types /subnotes:wrapup."
---

You file what this chat learned into the Subnotes brain: learnings and
questions without asking, tasks on the user's yes.

Anything the user added: $ARGUMENTS

## 1. Check who started it

Only file when the user wants it, so nothing is written behind their back.

1. **Allowed**: the user, Claude when the user wraps up a chat, or
   `/subnotes:run`'s session summary; anything else, stop and do nothing.
2. **From the run**: file only what the talk settled that the session
   didn't already file, report in one line for the run's summary, and
   skip the rating; skip section 2's reads, and when nothing is left to
   file, say "nothing new" and stop.

## 2. Read

See the notebooks and goals, so what's filed lands in the right place.

1. **The notebooks**: in one turn, call `start_run` (skill `wrapup`),
   `list_notebooks`, and `read_notebook` for the notebook marked "Role:
   Goals".
2. **The source**: this conversation: what the user said and decided, and
   what was found; never what a Subnotes skill or worker already filed.
3. **Nothing worth keeping**: say so in one line and stop, without a
   rating.

## 3. Sort what the chat produced

Keep what the chat settled and what's still open, and drop the rest.

1. **A decision**: a design settled, an option ruled out, a priority
   becomes a learning in the notebook it's about, or shared when it holds
   across them.
2. **A fact**: where something stands, how something works or a cause
   found, that a notebook's work depends on, becomes a learning in that
   notebook.
3. **Something to do** the chat left open: a task, proposed in bold, in
   the first person, with where it goes; added (`add_task`) only on their
   yes.
4. **A task already there**: look for it first (`search_notes`, a few of
   its words); when it's there, reschedule it on their yes
   (`set_schedule`) instead of adding it again.
5. **Unsettled, and other work waits on it**: one question.
6. **Everything else**: nothing: what's now in the code or the notebook,
   how the chat went, anything personal.

## 4. Write, then report

File it where the skills will use it, and tell the user in a few lines.

1. **The notebook's learnings**: before adding a learning, read that
   notebook's learnings (`read_learnings`); correct one the chat changes
   (`correct_learning`) instead of adding a second, and skip one already
   there.
2. **The writes**: add the learnings and any question without asking
   (`add_learning`, `add_question`, source `chat`), one learning per
   decision, plainly written.
3. **The report**: in about 5 lines:

   ```
   From this chat — 1 learning (Freelance: quotes go out as PDFs, not links), 1 task:
   **Update my quote template to export as PDF** (Freelance › Backlog) — add it?
   ```

## 5. Rate it

Learn from the user's rating, so filing gets better.

1. **When**: not when the run started you; otherwise once any task is
   added or declined.
2. **The clock**: call `end_run` (skill `wrapup`).
3. **The rating**: ask with AskUserQuestion, in one line naming the work
   it rates, with the options Great, Good, Meh, Waste of time:

   ```
   How was filing what we talked about?
   ```

4. **The why**: ask once, in one line: "Why was it good?" on Great or
   Good, "What would have made it worth it?" on Meh or Waste of time.
5. **The saved rating**: call `rate_run`: the report line without the
   time as `did`, the why and anything else they typed as `comment`;
   `Skipped` when there's no rating.
6. **The lesson**: save the why with `add_learning`, shared, source
   `wrapup`: what to keep doing, or what to change.

## Rules

1. **Writes**: only add learnings, questions and tasks, reschedule a task
   on a yes, and edit or add one line on a yes, shown as old and new
   (`edit_line`) or as `+ …` (`add_line`); never claim more.
2. **Replies**: short, leading with the question, in about 5 lines.
