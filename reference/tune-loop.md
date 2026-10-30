# Checking the skill update's changes

How `/subnotes:run` keeps or drops what the weekly skill update wrote, at
the end of a session.

The skill update (`subnotes:tune`) hands back a `change` point per edit,
uncommitted, with its starting commit. The writer never checks its own:

1. For every change, in one turn, a fresh `subnotes:tune-check` with the
   file, the skill's opening, the diff (`git diff -- <file>`) and the
   lessons.
2. `PASS`: in the plugin repo, `node dev/lint-skills.mjs --no-growth
   <start>`; clean, commit that file alone with the point's message and
   carry out its `correct_learning` writes. `FAIL`: send the reason to the
   tune worker (SendMessage) for one revision, checked the same way. A
   second `FAIL`: `git checkout -- <file>`.
3. `mark_tuned` with each committed change and any undone hashes. Never
   push or bump the version: releasing is the user's step.

One line per kept change in the summary, so they can undo it in one word
(`git revert`, and save why as a lesson).
