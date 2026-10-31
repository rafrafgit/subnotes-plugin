---
name: write-skill
description: Rewrites one of the plugin's skill, command or agent files so every section is a list of short, clear instructions with bold labels naming what each step reads or produces. Use when writing or editing any file in commands/, agents/ or skills/, or when asked to make a skill clearer.
---

You rewrite one skill file so an agent that knows nothing else can follow
it step by step.

## 1. Read

1. **The file**: read it whole, and the parts of any file it points to
   that its steps depend on.
2. **The job**: find what the skill is for, and what it reads and
   produces.

## 2. Rewrite

1. **The opening**: one sentence saying what the skill is for.
2. **The sections**: one per stage of the work, in the order it happens,
   each headed by what it does.
3. **The steps**: in each section, a numbered list, one instruction per
   item, as short as it can be.
4. **The labels**: start each item with a bold label naming the
   deliverable it reads or produces ("**Today's overview**", "**The
   options**").
5. **Names**: define each deliverable where it's first used, saying what
   it is, and call it by that name after. No separate list of names.
6. **Code**: put every command to run in a code block, with placeholders
   in `<angle brackets>`.
7. **Deletions**: delete every line that can't be written as an
   instruction: reasons, background, what another agent does.
8. **Order**: when a step needs something no earlier step gives, or two
   steps pull against each other, reorder or merge them.
9. **The frontmatter**: keep it; make its description match the opening.

## 3. Check and report

1. **The lint**: run it, and fix what it reports:

   ```
   node dev/lint-skills.mjs
   ```

2. **The report**: tell the user, in short lines, what changed in each
   section, every line you deleted and why, and every change to what the
   skill does, apart from the rewording. Commit nothing.

## Rules

1. **Behaviour**: change what the skill does only as a change you name in
   the report, never inside a rewording.
2. **Examples**: keep one only when it shows the shape of an output;
   never take one from the user's own notebooks.
