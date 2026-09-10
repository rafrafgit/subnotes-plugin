---
description: Capture a task into one of your connected notebooks
---

Add this to the user's Subnotes: $ARGUMENTS

If that is empty, the user ran the command bare to see what it does — which is
how people explore a new plugin. Do not invent something to add and do not call
any tool. Say what the command does, show the shape (`/subnotes:add buy milk`),
and point at `/subnotes:help` for orientation. Then ask what they want added.

Call `list_notebooks` first and choose the notebook and section that fit, unless
the argument names them. Write it as a physical, visible action. Report which
notebook and section it went to, so a wrong guess is visible immediately.

If the argument is several things, add them in one `add_tasks` call.
