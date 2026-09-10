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
`list_notebooks` returned. Otherwise choose the notebook and section that fit. Write it as a physical, visible action. Report which
notebook and section it went to, so a wrong guess is visible immediately.

If the argument is several things, add them in one `add_tasks` call.
