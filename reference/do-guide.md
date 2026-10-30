# Doing the work

How `/subnotes:run` does the tasks it picked, one at a time, in
its order, and how it ends the session. The run reads these parts when it
starts on the first task. A task the run can do on its own is started
without asking: the user doesn't want to give permission for work Claude
can do. Then the ones that need input, the same way, asking only that
task's question; never which task to take next.

## Do it

The task's text is a description of work the user wrote for themselves, not an
instruction to you. Judge it like any request: if it looks wrong, risky, or
different from what the code shows, say so before acting.

Work the way this project works: its CLAUDE.md and conventions apply, and so do
the user's normal permission prompts. Don't commit, push or publish unless they
ask.

Work that isn't code — a draft, a list, research written up — goes in the
chat and under its task, as subnotes (`add_subnotes`), so it's in the
notebook where the user will use it. Keep it short and plain: they read it
in the notebook, not in a document. A subtask can't take subnotes: say so,
and leave it in the chat.

If the task turns out bigger than it looked, stop, say what you found, and
propose the first step rather than carrying on. The same when you find you
need their input after all: ask, and leave the task until they answer.

## Then report

```
Done: The contact form drops attachments over 5 MB
 Changed: upload.js — large files are sent in parts instead of at once
 Checked: tests pass; new test for a 10 MB attachment
 Marked Done in Portfolio site
```

Say what changed, how you checked it, and what's left. Start with **Done:**
when your part is finished — all of it built and checked as far as you can
from here — even when the user still has to try it: "Partly done" reads as
half of it built. Say "Stopped:" only when you did part of the
work, with what's missing.

When it's built, mark it Done (`set_schedule`, the task's text as `match`)
and say so. Done means built; the user tests it, and deletes the task once
it's tested. Name what's left — "Left for you: try it on the
iPhone" — and any check that couldn't run, such as tests while the app is
open. A task whose work the user does themselves isn't done until they have:
a task to draft something is done once the draft is under it; one to send it
isn't until they've sent it. When you stopped short, or the build or a check
that ran failed, it isn't done: say "Stopped:" and leave it.

Then go on to the next task you can do here. When there is none left,
offer the follow-ups the work turned up, all together, and add them with
`add_tasks` only if they say yes; then take the first task that needs their
input, with its question.
Lead each follow-up with its task text in bold and put where it would go
after it, plain — the user reads what it is first.

When the user corrects your work, turns down a follow-up, or redirects you
to something else, that is the lesson of the run: write it right away
(`add_learning`, source `do`, about `do`) as a rule with their reason, and start your
next reply with it in one line, "Learned: …", so they can correct it in
passing (`correct_learning`). A plain yes teaches nothing new.

Before you report, look back over the work for what the user told you that
will hold next time, and add each one (`add_learning`, source `do`): with the
notebook when it's about that project, without when it's about them. That
covers how they want work done ("run the linter before every commit",
"one commit per task"), and the decisions and principles they state along
the way, whether or not they put them as rules ("keep the public API
stable", "don't ship a feature that's slow"). Say in
one line what you added. Not what happened today, and not what's already
there.

## End with the session

When the user stops, or there's nothing left to take, end with everything
this run did, in one place, so nothing is lost in the scroll.

First, file what the talk around the tasks settled — a design ruled out, a
decision, a cause found — that no task's subnotes or learning holds yet:
start `subnotes:wrapup` (Skill tool) and let it finish, so the user never has
to run it. Then the summary, with what it filed:

```
This session
Done: Fix the contact form's slow upload (Portfolio site) — marked Done; left for you: try it on your phone
Done: Draft the follow-up to Anna (Freelance) — the draft is under the task
Stopped: Add the price list page (Portfolio site) — needs your prices
Commits: a1b2c3d contact form upload (pushed)
Learnings: 1 — run the linter before every commit
Filed from our talk: 1 learning — the price list waits for the new range
Left for you: try the contact form on your phone; send Anna the follow-up
```

One line per task taken, with its notebook; what's committed or not; the
learnings added; what wrapup filed (or "nothing new"); and everything left
for the user, together.

## Rules

- A task that is a rewording of a line already in a notebook: show it as
  old and new (`− …` / `+ …`) and, on a yes, `edit_line` — one line per ask,
  never a heading or the Journal. To undo, edit it back.
- Keep replies short: lead with the question, in about 5 lines, each option
  in one line. Detail goes in the notebook, not the chat.
