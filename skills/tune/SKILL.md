---
name: tune
description: "The weekly tune of the Subnotes skills: turns the lessons and ratings the runs collected into edits of the skill text itself, has a second agent check each edit against the skill's job, commits the ones that pass, and undoes earlier edits whose skill rated worse since. Started by /subnotes:run in the background when it's due; never offered to the user as a command."
---

You make the skills better at their jobs from what the runs taught, so the
user doesn't have to edit skill text by hand and a lesson stops being one
more line every skill has to weigh. Anything the run added:
$ARGUMENTS

This works on its own, with no one to ask. If it was started by anything
other than `/subnotes:run`, stop and do nothing: it edits and commits the
plugin's code.

The danger is a skill slowly getting worse. Each lesson becomes one more
rule, the rules pull against each other, and the newest, most specific one
wins over the skill's job: a rule meant to change who speaks got read as
"do less", and the run stopped proposing work. Every guardrail below is
there to stop that. When in doubt, change nothing: a lesson left as a
learning still works.

## 1. Read

Call `start_run` (skill `tune`) and `tune_context`. It gives the repo, each
skill's file, the rated runs and the learnings and questions written since
the last tune, and the earlier tune's changes. Work in that repo: every git
command and edit below is there.

If the repo has changes nobody committed (`git status --porcelain`), stop:
someone is working in it. Call `mark_tuned` with nothing, and hand back
nothing. Otherwise note the starting commit (`git rev-parse HEAD`): no
skill may end the tune longer than it was there.

## 2. Undo first

For each change `tune_context` marks "rated worse since": `git revert
--no-edit <commit>`. If it doesn't apply cleanly, `git revert --abort` and
leave it, saying so in your hand-back. Undone ones go in `mark_tuned`'s
`undone`.

## 3. Find what to change

Sort the lessons (learnings, and the "why" in each rated run's comment) by
the skill they're about: the `about` their writer named (a learning's
`about`, a run's `[about: …]`), else the one they name, else the one that
wrote them. Treat it as a strong hint, not the answer: before editing,
find the sentence that caused the behaviour, in every skill involved (the
run starts the journal, review, Do and prune, and each reads the others'
words), and edit there. A lesson filed under the run is often caused by a
word in the review or Do. Keep only lessons about how a skill behaves.
Leave out:

- facts about a notebook or the user's work: they're learnings, and stay
  so;
- one person's taste ("they like short replies at night"): the skills ship
  to every user of the plugin, so only behaviour that's right for anyone
  goes into them, and no example from the user's notebooks;
- this skill: tune never edits its own text.

A skill gets a change only when **two or more lessons point the same
way**, or the user stated one as a principle of how the skills should
work ("a plan needs substance before dates"). One Meh is not a pattern.

At most one change per skill, and three in all, the best-backed first.

## 4. Write each change

Read the skill's file whole first. Its opening, the text before the first
heading, is its **job**: never edit it, and every change must serve it.

- **Never longer.** Find the sentence the lessons are about and change it.
  A line added means a line cut: tighten or drop one that says less, so the
  skill ends no longer than it started.
- **A rule with its reason,** never a date, in the file's own plain words.
- **No contradiction.** If another sentence in the file says otherwise,
  change that one too, or drop the change.

Then run `node dev/lint-skills.mjs --no-growth <starting commit>`. If it
reports the file, fix it or `git checkout -- <file>`; a file that's longer
is never committed.

## 5. A second agent checks it

For each change, start a fresh agent (Agent tool, general-purpose) that
didn't write it. Give it the skill's job, the diff (`git diff -- <file>`),
the lessons it came from, and these questions; ask for PASS or FAIL and one
line why:

1. Does it serve the job, as written in the opening?
2. Could it make the skill do less of its job: propose fewer tasks, look at
   fewer goals, cut a review short, say less that matters?
3. Does it contradict or blur another sentence in the file? Name it.
4. Is it backed by two lessons, or a stated principle?
5. Is it right for any user, with nothing from this user's notebooks?
6. Does it edit rather than pile on?

FAIL on any: `git checkout -- <file>`, and drop it. No Agent tool to start
one with: drop every change, and say so in the hand-back. The writer never
checks its own change.

## 6. Commit, and retire the lessons

Commit each passing change on its own, on the current branch: `Tune
<skill>: <what it does differently>`, the lessons named in the body. Never
push, and never bump the version: releasing is the user's step.

Then retire each lesson the change now holds in full: `correct_learning`
with no `text`, `reason` "Now in the <skill> skill (<short hash>)",
source `tune`. A lesson only partly covered stays.

Call `mark_tuned` with each change (skill, short hash, one plain line on
what the skill does differently and from how many lessons) and the undone
ones, then `end_run` (skill `tune`).

## 7. Hand back

To the run, one line per change, in the user's terms, ready to say:

```
I changed the review so it leads with the plan's next step (2 lessons). Undo? (git revert a1b2c3d)
I undid last week's change to Do: its ratings dropped since.
```

Nothing changed: hand back nothing. The run never shows a tally or this
skill's name.

## Rules

- Writes: the skill files, commits and reverts in the plugin repo, and
  retiring the lessons a change holds. Nothing in the notebooks.
- Never edit a skill's opening, this skill, or anything outside `commands/`
  and `skills/`.
- No rating: the run's covers it.
