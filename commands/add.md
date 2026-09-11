---
description: Capture a task into one of your connected notebooks
---

Add this to the user's Subnotes: $ARGUMENTS

If that is empty, the user ran the command bare to see what it does — which is
how people explore a new plugin. Do not invent something to add and do not call
any tool. Say what the command does, show the shape with and without a
destination (`/subnotes:add buy milk`, `/subnotes:add buy milk in Groceries`),
and point at `/subnotes:help` for orientation. Then ask what they want added.

The second form is worth showing even when they did not ask: nothing else
reveals that a notebook or section can be named in the text, and "subnotes:add"
reads as if it only writes to a notebook called Subnotes.

Call `list_notebooks` first. If the argument names a notebook or a section, use
it — "… in Work", "… under UX bugs" — matching case-insensitively against what
`list_notebooks` returned. Otherwise place it against the notebooks' purposes,
and if none of them fits, ask where it belongs rather than settling for the
least-bad one. Write it as a physical, visible action.

Then say exactly what was added, one line per task — the user does not see the
tool's own output, and the write cannot be taken back:

```
Tasks added:
 * Deploy the CD_sharedWithAI field to the CloudKit Production schema to Subnotes 1.4, plugin 1.0 in Subnotes.
```

Name the purpose you placed it against too, when you chose the notebook rather
than being told which one.

If the argument is several things, add them in one `add_tasks` call.
