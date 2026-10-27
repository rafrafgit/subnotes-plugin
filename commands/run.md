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
- **Do** is everything else, while Today or Next has a task — even one,
  and even after today's review.
- **Today and Next empty:** with 3 or more Soon tasks, it's Do, moving
  some of them to Next first. With fewer, it's the review again — even if
  it already ran today — to work out what's next.

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
- **Do:** `subnotes:do`, with nothing as its argument. When Today and Next
  are empty it offers the Soon tasks to move up itself.
- **Review, for what's next:** `subnotes:review`, with `what's next` as its
  argument: "Today and Next are empty and only 1 Soon task is left —
  reviewing the goals for what's next."

Keep replies short: lead with the question, in about 5 lines.

When the skill you started is done, offer the next one down the line: what
else `whats_due` showed was due. When that's Do — after a review, too, when
it ended before every goal was reached — call `whats_due` again and start
what it says, as in step 2: Do while Today or Next has a task ("Do is next:
2 Next tasks — starting it"), else the Soon tasks to move up, else the
review for what's next. Stop whenever the user says so.

Don't go round in circles: once this session has offered the Soon tasks and
the user said no, or run the review for what's next, and Today and Next are
still empty, say there's nothing lined up and stop.
