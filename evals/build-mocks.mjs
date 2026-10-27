#!/usr/bin/env node
// Builds the mocks the review evals answer from. Each case gets a made-up
// Connector folder (notebooks, learnings, the review's journal), the real
// server is asked what the review would ask, and its answers are saved as
// mocks under evals/<case>/mocks/subnotes/. So the runs read exactly what the
// server returns, from a fixture that never changes under them.
//
//   node evals/build-mocks.mjs
//   claude plugin eval . --ablation none -j 3 --judge-model sonnet
//
// --ablation none: the review is a command, so a run without the plugin has
// nothing to compare against.
//
// Dates are written relative to today, so a plan check stays recent: run this
// again before a run if the last build is more than a couple of weeks old.

import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EVALS = dirname(fileURLToPath(import.meta.url));
const SERVER = join(EVALS, '..', 'server', 'index.mjs');

const day = n => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const entries = (title, about, lines) =>
  `# ${title}\n\n${about}\nWritten by Subnotes' skills, one line each, saying which skill and when. Yours to read and correct.\n\n` +
  lines.map(l => `- ${l}`).join('\n') + '\n';
const learnings = (name, lines) => entries(`What agents have learned — ${name}`,
  name === 'shared' ? 'Not about one notebook: the owner, how they work, what holds everywhere.'
    : 'About this notebook. Anything not about it is in shared.md.', lines);

// The same made-up owner in every case: a freelance designer with one goal.
const GOAL = 'Earn 4k a month from freelance design';
const GOALS = `⟦PURPOSE:What I'm working toward⟧
# Earn 4k a month from freelance design [2027-06-01]
Why: be my own boss.
What: four retainer clients by June 2027.
How: [[Freelance]] — apply to 5 posted projects a week on design job boards, and turn every finished project into a case study on my portfolio.
`;

const SHARED = [
  `${day(-12)} · review · Keep replies short: lead with the question, about 5 lines`,
  `${day(-10)} · review · Wants Claude's own ideas — options, a draft — not homework`,
];

const GOALS_LEARNINGS = [
  `${day(-3)} · plan · Goal: 4k a month from freelance design by June 2027. Plan: apply to 5 posted projects a week; a case study for every finished project. Signal: applications a week, 5 needed. Checked with the user ${day(-3)}: no gap`,
];

const CASES = {
  // The review leads with the plan's next step, not with ideas off the plan.
  'review-goal-first': {
    freelance: `⟦PURPOSE:Win and deliver freelance design work⟧
## Applications
Sent this week: 1 of 5.
• Apply to the packaging design project for an oat milk brand [Next]
	Found in the job board scan on ${day(-2)}: food packaging, 3 weeks, remote
• Apply to the brand refresh for a coffee roaster in Leeds [Next]
• Apply to the app icon set for a meditation app [Next]
## Clients
### Northwind Bakery
• Send the final logo files to Northwind [Done]
## Portfolio
• Write the Northwind case study [Soon]
## Ideas
• Try a more playful font for my portfolio headings
	Like the studios I follow on Instagram
• Switch my invoicing to a new app
• Make a Notion template to sell on the side
`,
    freelanceLearnings: [`${day(-9)} · review · Applications are the plan's engine: a week under 5 is behind pace`],
  },

  // The review's old journal noted a task's due date; the notebook has none.
  'review-stale-date': {
    freelance: `⟦PURPOSE:Win and deliver freelance design work⟧
## Applications
Sent this week: 5 of 5.
• Apply to the app icon set for a meditation app [Done]
## Clients
### Northwind Bakery
• Follow up with Dana at Northwind about the menu redesign [Soon]
	She said she'd decide after their busy season
## Portfolio
• Write the Northwind case study [Next]
`,
    freelanceLearnings: [],
    journal: `Last visit: ${day(-6)}

## Goal and plan
- Goal: 4k a month by June 2027 (Goals)
- Plan: 5 applications a week; case studies
- Next step: the Northwind case study

## Open suggestions
(none)

Tasks proposed this week: 0

## Waiting to ask
(none)

## Observations
- ${day(-6)} — The Dana follow-up is due ${day(0)}, scheduled Today
`,
  },

  // A question the user is thinking out loud gets talked through first.
  'review-talk-first': {
    freelance: `⟦PURPOSE:Win and deliver freelance design work⟧
## Applications
Sent this week: 5 of 5.
• Apply to the brand refresh for a coffee roaster in Leeds [Done]
• Apply to the packaging design project for an oat milk brand [Next]
## Clients
### Northwind Bakery
• Send the final logo files to Northwind [Done]
## Pricing
My day rate is €400. Two clients this month said yes without asking about price.
• Should I raise my day rate for new clients?
	Worried it scares off the job board leads
## Portfolio
• Write the Northwind case study [Next]
`,
    freelanceLearnings: [],
  },
};

function writeFixture(dir, c) {
  const notebooks = [
    { name: 'Goals', file: 'notebooks/Goals.txt', role: 'goals', purpose: "What I'm working toward", id: 'g1',
      headings: [{ level: 1, name: 'Earn 4k a month from freelance design' }], sections: [], openTasks: 0 },
    { name: 'Freelance', file: 'notebooks/Freelance.txt', purpose: 'Win and deliver freelance design work', id: 'f1',
      sections: [...c.freelance.matchAll(/^##+ (.*)$/gm)].map(m => m[1]),
      openTasks: c.freelance.split('\n').filter(l => l.startsWith('• ') && !l.includes('[Done]')).length },
  ];
  for (const d of ['notebooks', 'inbox', 'failed', 'agent/learnings', 'agent/questions', 'agent/review'])
    mkdirSync(join(dir, d), { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ appVersion: 'eval', connectorVersion: 1,
    exportedAt: new Date().toISOString(), notebooks }, null, 2));
  writeFileSync(join(dir, 'notebooks/Goals.txt'), GOALS);
  writeFileSync(join(dir, 'notebooks/Freelance.txt'), c.freelance);
  writeFileSync(join(dir, 'agent/learnings/shared.md'), learnings('shared', SHARED));
  writeFileSync(join(dir, 'agent/learnings/Goals.md'), learnings('Goals', GOALS_LEARNINGS));
  if (c.freelanceLearnings.length)
    writeFileSync(join(dir, 'agent/learnings/Freelance.md'), learnings('Freelance', c.freelanceLearnings));
  if (c.journal) {
    mkdirSync(join(dir, 'agent/review/goals'), { recursive: true });
    writeFileSync(join(dir, 'agent/review/goals', `${GOAL}.md`), c.journal);
  }
}

// One server per case, asked over stdio as Claude Code would.
function ask(dir, calls) {
  return new Promise((resolve, reject) => {
    const p = spawn('node', [SERVER], { env: { ...process.env, SUBNOTES_DIR: dir } });
    let out = '';
    p.stdout.on('data', d => out += d);
    p.on('error', reject);
    p.on('close', () => {
      const byId = {};
      for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);
        if (msg.id >= 10) byId[msg.id] = msg.result?.content?.map(c => c.text).join('\n') ?? JSON.stringify(msg.error);
      }
      resolve(calls.map((_, i) => byId[10 + i]));
    });
    const send = m => p.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'build-mocks', version: '1' } } });
    send({ method: 'notifications/initialized' });
    calls.forEach(([name, args], i) => send({ id: 10 + i, method: 'tools/call', params: { name, arguments: args } }));
    setTimeout(() => p.stdin.end(), 1500);
  });
}

// Tools whose answer depends on a notebook name read it from a fixture file
// named after the input; an array input like ["Goals"] reads as "Goals".
const NAMES = ['Goals', 'Freelance', 'Goals,Freelance'];
const perName = [
  ['read_notebook', 'name', ['Goals', 'Freelance']],
  ['review_context', 'goal', [GOAL]],
  ['read_learnings', 'notebook', ['Goals', 'Freelance']],
  ['read_questions', 'notebook', ['Goals', 'Freelance']],
  ['read_notes', 'goal', [GOAL]],
];
const fixed = ['list_notebooks', 'whats_due', 'start_run', 'review_elapsed'];

for (const [name, c] of Object.entries(CASES)) {
  const dir = mkdtempSync(join(tmpdir(), `subnotes-eval-${name}-`));
  writeFixture(dir, c);
  const calls = [
    ...fixed.map(t => [t, t === 'start_run' ? { skill: 'review' } : {}]),
    ...perName.flatMap(([t, field, names]) =>
      names.map(n => [t, { [field]: field === 'notebooks' ? n.split(',') : n }])),
  ];
  const answers = await ask(dir, calls);
  const mocks = join(EVALS, name, 'mocks', 'subnotes');
  rmSync(mocks, { recursive: true, force: true });
  mkdirSync(join(mocks, 'fixtures'), { recursive: true });
  let i = 0;
  for (const t of fixed) writeFileSync(join(mocks, `${t}.md`), `---\ntype: fixed\n---\n\n${answers[i++]}\n`);
  for (const [t, field, names] of perName) {
    mkdirSync(join(mocks, 'fixtures', t), { recursive: true });
    for (const n of names) writeFileSync(join(mocks, 'fixtures', t, `${n}.md`), answers[i++] + '\n');
    writeFileSync(join(mocks, `${t}.md`), `---\ntype: fixed\n---\n\n{{file:fixtures/${t}/{input.${field}}.md}}\n`);
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`${name}: ${answers.length} answers saved`);
}
