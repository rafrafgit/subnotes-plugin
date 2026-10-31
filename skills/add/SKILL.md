---
name: add
description: "Capture one or more tasks the user asked for into the right connected Subnotes notebook and section, and say exactly what was added. Not offered to the user as a command: they ask in their own words."
user-invocable: false
---

You add the tasks the user asked for to the right notebook and section,
and say exactly what was added.

Add this to the user's Subnotes: $ARGUMENTS

## 1. Find what to add

1. **The tasks**: take them from the line above; when it's empty, from
   what the user just asked to capture.
2. **Unclear**: when it isn't clear what they meant, ask instead of
   guessing.

## 2. Place them

1. **The notebooks**: call `list_notebooks`.
2. **A named notebook or section** ("… in Freelance", "… under Bugs"):
   use it, matched case-insensitively against `list_notebooks`.
3. **Otherwise**: place each task against the notebooks' goals; when none
   fits, ask where it belongs instead of taking the least-bad one.
4. **The wording**: write each as a physical, visible action.
5. **A task already there**: look for it first (`search_notes`, a few of
   its words); when one like it is there, say where and ask before adding
   a second.

## 3. Add and report

1. **The write**: call `add_task`, or `add_tasks` once for several.
2. **The report**: say exactly what was added, one line per task:

   ```
   Tasks added:
    * Email Sara the invoice under Admin in Freelance.
   ```

3. **The goal**: when you chose the notebook yourself, name the goal you
   placed it against.
