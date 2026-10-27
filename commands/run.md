---
description: The one command to start work from: runs whatever is due — the journal, a review of the goals with any plan checks due, a prune — or else the prioritized tasks
---

The one command to start from: it finds what's due across the user's
connected notebooks and starts it. Anything the user added after the
command:
$ARGUMENTS

This command needs someone at the keyboard. If it was started by anything
other than the user typing it, stop and do nothing.

## 1. See what's due

Call `whats_due`. It says which to run — Journal, then Review, then Prune,
then Do, the first that's due — and why:

- **Journal** is due when the Journal notebook has an entry since Journal
  last ran. Before the review, so it has that context.
- **Review** is due once a day, for the goals whose notebooks changed since
  their last review, and for notebooks no goal links that changed. It's
  also due when a goal's plan check is: 30 days after its last check, when
  its text has changed since, or when its date has passed. The review runs
  those checks itself. Once it has run today, what it didn't reach waits
  until tomorrow.
- **Prune** is due 30 days after the last prune: it clears what no longer
  holds out of the learnings and questions every skill reads.
- **Do** is everything else.

If the user added something after the command ("just do", "review Work"),
that wins over what's due.

## 2. Say it, then start it

One line, what you're starting and why, then start it straight away with the
Skill tool — the user redirects you if they want something else; don't wait
for a yes:

```
A review is due: 2 goals changed, and "Portfolio site live" is due its plan check — starting it.
```

- **Journal:** `subnotes:journal`, with nothing as its argument.
- **Review:** `subnotes:review`, with nothing as its argument: it reads
  `whats_due` itself and skips the goals with nothing new.
- **Prune:** `subnotes:prune`, with nothing as its argument.
- **Do:** `subnotes:do`, with nothing as its argument.

Keep replies short: lead with the question, in about 5 lines.

When the skill you started is done, offer the next one down the line: what
else `whats_due` showed was due. When that's Do — after a review, too, when
it ended before every goal was reached — start it straight away, as in
step 2, if it has tasks (Today, Next, or Soon when those are fewer than
three): "Do is next: 1 Next and 4 Soon tasks — starting it." No tasks: say
so and stop. Stop whenever the user says so.
