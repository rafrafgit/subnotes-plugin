#!/usr/bin/env node
// Checks the skill and command text against Anthropic's Agent Skills best
// practices — what claude plugin validate doesn't: it checks the format, this
// checks the writing. Free and instant, so it can run before every commit;
// the evals check what the skills do.
//
//   node dev/lint-skills.mjs
//
// https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ...readdirSync(join(root, 'commands')).filter(f => f.endsWith('.md')).map(f => join(root, 'commands', f)),
  ...readdirSync(join(root, 'skills')).map(d => join(root, 'skills', d, 'SKILL.md')).filter(existsSync),
];

const problems = [];
const report = (file, line, what) => problems.push(`${relative(root, file)}${line ? `:${line}` : ''} — ${what}`);

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

// Lines outside fenced code, with their numbers: examples may hold dates.
function prose(text) {
  let fenced = false;
  return text.split('\n').map((l, i) => {
    if (/^\s*```/.test(l)) { fenced = !fenced; return null; }
    return fenced ? null : { n: i + 1, text: l };
  }).filter(Boolean);
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const fm = frontmatter(text);
  const isSkill = file.endsWith('SKILL.md');

  // Short enough to load whole: move rarely used parts into their own files.
  if (lines.length > 500) report(file, 0, `${lines.length} lines, over 500`);

  // Said what and when, in the third person: the description is read to pick
  // the skill, often by another model, never by the user as "you".
  const desc = fm.description ?? '';
  if (!desc) report(file, 2, 'no description');
  else {
    if (desc.length > 1024) report(file, 2, `description is ${desc.length} characters, over 1024`);
    if (/\b(you|your|you're|yours)\b/i.test(desc)) report(file, 2, 'description speaks to "you": write it in the third person');
  }
  if (isSkill) {
    const name = fm.name ?? '';
    if (!/^[a-z0-9-]{1,64}$/.test(name)) report(file, 2, `name "${name}" isn't lowercase letters, digits and hyphens, at most 64`);
    if (/anthropic|claude/.test(name)) report(file, 2, `name "${name}" uses a reserved word`);
  }

  // No dated history: a rule's reason helps, when it was said doesn't, and it
  // costs tokens on every run. Dates in examples (fenced code) are fine.
  for (const { n, text: l } of prose(text)) {
    if (/\((?:(?:said|asked|decided|agreed|seen)\s+)?20\d\d-\d\d-\d\d\)/.test(l)) report(file, n, 'dated note: keep the reason, drop the date');
  }

  // References one level deep: a file a skill points to shouldn't point on.
  for (const m of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
    const ref = join(dirname(file), m[1]);
    if (!existsSync(ref)) { report(file, 0, `links to ${m[1]}, which doesn't exist`); continue; }
    if (/\]\(([^)#\s]+\.md)\)/.test(readFileSync(ref, 'utf8'))) report(ref, 0, 'a referenced file links on to another: keep references one level deep');
  }
}

if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} in ${files.length} files`);
  process.exit(1);
}
console.log(`${files.length} files, no problems`);
