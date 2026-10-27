#!/usr/bin/env node
// Drives the server over real stdio, the same way Claude Code will. Checks the
// happy path and the three refusals that are the whole point of the design:
// an unconnected notebook, an invented section, a bad priority.

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.env.SUBNOTES_DIR
  ?? join(homedir(), 'Library/Containers/com.subnotes.app/Data/Documents/Connector');

const proc = spawn('node', [join(root, 'server/index.mjs')], {
  env: { ...process.env, SUBNOTES_DIR: DIR },
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buf = '';
const pending = new Map();
proc.stdout.on('data', d => {
  buf += d;
  for (let nl; (nl = buf.indexOf('\n')) >= 0; ) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    pending.get(msg.id)?.(msg);
    pending.delete(msg.id);
  }
});

let nextId = 1;
const send = (method, params) => new Promise(res => {
  const id = nextId++;
  pending.set(id, res);
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
});
const call = async (name, args = {}) => {
  const r = await send('tools/call', { name, arguments: args });
  return { text: r.result.content[0].text, isError: !!r.result.isError };
};

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const init = await send('initialize', {});
check('initialize', init.result?.serverInfo?.name === 'subnotes');

const tools = await send('tools/list', {});
check('twenty-seven tools', tools.result.tools.length === 27,
      tools.result.tools.map(t => t.name).join(', '));

const list = await call('list_notebooks');
check('list_notebooks', !list.isError && list.text.includes('Open tasks'));
const first = list.text.match(/^## (.+)$/m)?.[1];
check('a notebook is connected', !!first, first ?? '');
console.log(`\n${list.text}\n`);

const read = await call('read_notebook', { name: first.toLowerCase() });
check('read_notebook matches case-insensitively', !read.isError, `${read.text.length} chars`);
// Against this notebook's own block of the listing, not the whole listing: a
// small first notebook (Goals) can be shorter than every notebook's listing.
const block = list.text.split(/\n(?=## )/).find(b => b.startsWith(`## ${first}\n`)) ?? list.text;
check('reading is dearer than its listing', read.text.length > block.length,
      `${block.length} vs ${read.text.length} chars`);

// A word from the notebook itself, so this holds whatever the notebook says.
const word = read.text.split(/\s+/).find(w => /^\p{L}{4,}$/u.test(w));
if (word) {
  const found = await call('search_notes', { query: word.toUpperCase(), notebooks: [first] });
  check('search_notes finds a word from the notebook, ignoring case',
        !found.isError && found.text.includes(`## ${first}`), word);
}
check('search_notes refuses an empty query', (await call('search_notes', { query: ' ' })).isError);

const unknown = await call('read_notebook', { name: 'Definitely Not Connected' });
check('unknown notebook refuses and lists what is connected',
      unknown.isError && unknown.text.includes(first));

const section = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'))
  .notebooks.find(n => n.name === first)?.sections?.[0];

const before = readdirSync(join(DIR, 'inbox'));
const write = await call('add_tasks', {
  notebook: first,
  tasks: [
    { text: 'Smoke test task one', section, priority: 'Next', subnotes: ['written by dev/smoke.mjs'] },
    { text: 'Smoke test task two' },
  ],
});
check('add_tasks succeeds', !write.isError, write.text.split('\n')[0]);

const added = readdirSync(join(DIR, 'inbox')).filter(f => !before.includes(f));
check('one inbox file, no .tmp left behind', added.length === 1 && added[0].endsWith('.json'), added.join(', '));
if (added.length === 1) {
  const payload = JSON.parse(readFileSync(join(DIR, 'inbox', added[0]), 'utf8'));
  check('payload carries a version, an id and both tasks',
        payload.connectorVersion === 1 && !!payload.id && payload.tasks.length === 2);
  check('a priority not given is left to the app', !('priority' in payload.tasks[1]));
  check('section matches the manifest exactly', !section || payload.tasks[0].section === section);
  console.log(`\n${JSON.stringify(payload, null, 2)}\n`);
  rmSync(join(DIR, 'inbox', added[0]));
}

const invented = await call('add_task', { notebook: first, text: 'x', section: 'Backlogg' });
check('an invented section refuses rather than creating one',
      invented.isError && invented.text.includes('no section'));

const badPriority = await call('add_task', { notebook: first, text: 'x', priority: 'Urgent' });
check('an unknown priority refuses', badPriority.isError);

const multiline = await call('add_task', { notebook: first, text: 'line one\nline two' });
check('a multi-line task refuses and points at subnotes',
      multiline.isError && multiline.text.includes('subnotes'));

// Journals: a round trip, unless the notebook already has a real one — this
// runs against the real connector folder, and a journal is the agent's memory.
const journal = join(DIR, 'agent', 'review', `${first.replace(/[\/:\0]/g, '-')}.md`);
// Before 1.2 journals sat directly in agent/, and the server moves one on
// first read — so an old-path journal is a real one too.
const legacyJournal = join(DIR, 'agent', `${first.replace(/[\/:\0]/g, '-')}.md`);
if (existsSync(journal) || existsSync(legacyJournal)) {
  console.log('  --   journal round trip skipped: a real journal exists');
} else {
  const none = await call('read_notes', { notebook: first });
  check('read_notes says when there is none', !none.isError && none.text.includes('No notes yet'));
  const saved = await call('write_notes', { notebook: first, content: '# Smoke test journal' });
  check('write_notes saves', !saved.isError && existsSync(journal));
  const back = await call('read_notes', { notebook: first });
  check('read_notes returns it', back.text.trim() === '# Smoke test journal');
  rmSync(journal);
}
const emptyJournal = await call('write_notes', { notebook: first, content: '  ' });
check('an empty journal refuses', emptyJournal.isError);
const strayJournal = await call('read_notes', { notebook: 'Definitely Not Connected' });
check('a journal for an unconnected notebook refuses', strayJournal.isError);

// Learnings: the same rule — only in a notebook that has none of its own yet.
// The shared file is only read, never written, from here.
const learnings = join(DIR, 'agent', 'learnings', `${first.replace(/[\/:\0]/g, '-')}.md`);
if (existsSync(learnings)) {
  console.log('  --   learnings round trip skipped: real learnings exist');
} else {
  const added = await call('add_learning', { notebook: first, text: 'Smoke test learning', source: 'smoke' });
  check('add_learning adds', !added.isError && existsSync(learnings), added.text);
  const line = readFileSync(learnings, 'utf8').split('\n').find(l => l.includes('Smoke test learning'));
  check('an entry says when and which skill', /^- \d{4}-\d{2}-\d{2} · smoke · Smoke test learning$/.test(line ?? ''), line);
  const twice = await call('add_learning', { notebook: first, text: 'smoke test learning', source: 'smoke' });
  check('the same learning twice refuses', twice.isError);
  const noSource = await call('add_learning', { notebook: first, text: 'x' });
  check('a learning without a source refuses', noSource.isError);
  const read = await call('read_learnings', { notebook: first });
  check('read_learnings returns the notebook and shared', read.text.includes('Smoke test learning') && read.text.includes('— shared'));
  await call('add_learning', { notebook: first, text: 'Smoke test other', source: 'smoke' });
  const vague = await call('correct_learning', { notebook: first, match: 'smoke test', text: 'y', reason: 'r', source: 'smoke' });
  check('a correction matching two entries refuses', vague.isError && vague.text.includes('matches 2'));
  const fixed = await call('correct_learning', { notebook: first, match: 'test learning', text: 'Smoke test corrected', reason: 'testing', source: 'smoke' });
  check('a correction keeps the old wording', !fixed.isError && readFileSync(learnings, 'utf8').includes('was: "Smoke test learning"'));
  const gone = await call('correct_learning', { notebook: first, match: 'other', reason: 'testing', source: 'smoke' });
  check('a correction without text removes', !gone.isError && !readFileSync(learnings, 'utf8').includes('Smoke test other'));
  rmSync(learnings);
}

// Open questions: the same rule as learnings.
const questions = join(DIR, 'agent', 'questions', `${first.replace(/[\/:\0]/g, '-')}.md`);
const learned = join(DIR, 'agent', 'learnings', `${first.replace(/[\/:\0]/g, '-')}.md`);
if (existsSync(questions) || existsSync(learned)) {
  console.log('  --   questions round trip skipped: real questions or learnings exist');
} else {
  const asked = await call('add_question', { notebook: first, text: 'Is the smoke test committed?', source: 'smoke' });
  check('add_question records it', !asked.isError && existsSync(questions), asked.text);
  const again = await call('add_question', { notebook: first, text: 'is the smoke test committed?', source: 'smoke' });
  check('the same question twice refuses', again.isError);
  const open = await call('read_questions', { notebook: first });
  check('read_questions returns it', open.text.includes('Is the smoke test committed?'));
  const closed = await call('close_question', { notebook: first, match: 'smoke test', answer: 'Yes', source: 'smoke' });
  check('close_question removes it and learns the answer',
        !closed.isError && !readFileSync(questions, 'utf8').includes('committed?')
        && readFileSync(learned, 'utf8').includes('Answered: Is the smoke test committed? — Yes'), closed.text);
  rmSync(questions); rmSync(learned);
}

// review_context writes a snapshot and write_notes a journal, so only in a
// fixture folder too — and whatever journal the fixture had is put back.
if (process.env.SUBNOTES_DIR) {
  const safe = first.replace(/[\/:\0]/g, '-');
  const file = join(DIR, JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')).notebooks.find(n => n.name === first).file);
  const original = readFileSync(file, 'utf8');
  const journalFile = join(DIR, 'agent', 'review', `${safe}.md`);
  const savedJournal = existsSync(journalFile) ? readFileSync(journalFile, 'utf8') : null;
  const snap = join(DIR, 'agent', 'review', `${safe}.snapshot.json`);
  const pending = join(DIR, 'agent', 'review', `${safe}.pending.json`);
  rmSync(snap, { force: true }); rmSync(pending, { force: true });

  const firstVisit = await call('review_context', { notebooks: [first] });
  check('review_context: a first visit shows the whole notebook, shared learnings once',
        !firstVisit.isError && firstVisit.text.includes('No snapshot') && firstVisit.text.split('# Shared learnings').length === 2,
        firstVisit.text.slice(0, 80));
  check('review_context leaves its snapshot pending', existsSync(pending) && !existsSync(snap));
  await call('write_notes', { notebook: first, content: '# Smoke test journal' });
  check('write_notes keeps the pending snapshot', existsSync(snap) && !existsSync(pending));
  const same = await call('review_context', { notebooks: [first] });
  check('an unchanged notebook says so', same.text.includes('Nothing has changed since the last visit'));
  writeFileSync(file, original.replace(/\n*$/, '\n') + '## Smoke section\n• Smoke diff task [Next]\n• Smoke task still waiting\n');
  const diff = await call('review_context', { notebooks: [first] });
  check('a change shows only the changed section, its lines marked',
        diff.text.includes('### Smoke section (new section)') && diff.text.includes('+ • Smoke diff task [Next]   ← new task')
        && !diff.text.includes('No snapshot'), diff.text.split('## What changed')[1]);
  check('a new scheduled line comes whole under its group',
        diff.text.split('## Scheduled lines')[1]?.split('## What changed')[0].includes('### Next\n• Smoke diff task [Next]   ← task, new'),
        diff.text.split('## Scheduled lines')[1]?.split('## What changed')[0]);
  check('a snapshot holds fingerprints, not text', !readFileSync(pending, 'utf8').includes('Smoke diff'));
  await call('write_notes', { notebook: first, content:
    '## Open suggestions\n- 2026-10-18 — Smoke diff task — why: it is there\n- 2026-10-18 — Smoke task the user deleted — why: gone\n- 2026-10-18 — Smoke task still waiting — why: unscheduled\n\n## Observations\n' });
  const status = await call('review_context', { notebooks: [first] });
  check('open suggestions come with what the notebook shows of them',
        status.text.includes('- Smoke diff task: scheduled [Next] in Smoke section — accepted')
        && status.text.includes('- Smoke task the user deleted: not in the notebook')
        && status.text.includes('- Smoke task still waiting: unscheduled in Smoke section — waiting'), status.text.split('## Learnings')[0].slice(-400));
  const stray = await call('review_context', { notebooks: ['Definitely Not Connected'] });
  check('review_context refuses an unconnected notebook', stray.isError);

  writeFileSync(file, original);
  if (savedJournal === null) rmSync(journalFile, { force: true }); else writeFileSync(journalFile, savedJournal);
  rmSync(snap, { force: true }); rmSync(pending, { force: true });
}

// The review by goal: a goal in Goals that links a notebook, added for the
// test and taken out after, with its notes and snapshots.
if (process.env.SUBNOTES_DIR) {
  const nbs = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')).notebooks;
  const goalsNb = nbs.find(n => n.role === 'goals');
  const served = nbs.find(n => n.role !== 'goals' && n.role !== 'journal');
  if (goalsNb && served) {
    const goalsFile = join(DIR, goalsNb.file);
    const original = readFileSync(goalsFile, 'utf8');
    const goal = 'Smoke goal';
    const goalDir = join(DIR, 'agent', 'review', 'goals', goal);
    const safe = served.name.replace(/[\/:\0]/g, '-');
    writeFileSync(goalsFile, original.replace(/\n*$/, '\n') + `# ${goal} [2099-01-01]\nServed by [[${served.name}]]\n`);

    const ctx = await call('review_context', { goal });
    check('review_context with a goal reads the notebook it links, with the goal\'s notes once',
          !ctx.isError && ctx.text.includes(`# Goal: ${goal} [2099-01-01]`) && ctx.text.includes(`\n# ${served.name}\n`)
          && ctx.text.split('## Your notes').length === 2, ctx.text.slice(0, 300));
    check('a goal\'s look leaves its own snapshot pending', existsSync(join(goalDir, `${safe}.pending.json`)));
    const saved = await call('write_notes', { goal, content: 'Last review: smoke' });
    check('write_notes for a goal keeps its snapshots', !saved.isError && existsSync(join(goalDir, `${safe}.snapshot.json`))
          && !existsSync(join(goalDir, `${safe}.pending.json`)), saved.text);
    const back = await call('read_notes', { goal: `${goal} [2099-01-01]` });
    check('read_notes finds a goal named with its schedule', back.text.trim() === 'Last review: smoke', back.text);
    const due = await call('whats_due', {});
    check('whats_due lists the review by goal', due.text.includes(`- Goal: ${goal} (${served.name})`), due.text);
    check('an unknown goal is refused, naming the goals', (await call('review_context', { goal: 'No such goal' })).text.includes(`"${goal}"`));
    check('notes take a goal or a notebook, not both', (await call('read_notes', { goal, notebook: served.name })).isError);

    // An ongoing goal: a repeat, no notebook, due by when it last happened.
    const ongoing = 'Smoke ongoing';
    const ongoingDir = join(DIR, 'agent', 'review', 'goals', ongoing);
    writeFileSync(goalsFile, readFileSync(goalsFile, 'utf8') + `## ${ongoing} [Monthly]\n`);
    const fresh = await call('whats_due', {});
    check('whats_due lists an ongoing goal not known to have happened',
          fresh.text.includes(`- Ongoing goal: ${ongoing} [Monthly] — not known when it last happened`), fresh.text);
    check('an ongoing goal has no plan check', fresh.text.includes(`- ${ongoing} [Monthly] — ongoing, no plan check`), fresh.text);
    const octx = await call('review_context', { goal: ongoing });
    check('review_context takes an ongoing goal with no notebook', !octx.isError && octx.text.includes(`# Goal: ${ongoing} [Monthly] — ongoing`), octx.text.slice(0, 300));
    const day = new Date().toLocaleDateString('sv');
    await call('write_notes', { goal: ongoing, content: `Last review: ${day}\nLast happened: ${day} — smoke` });
    const after = await call('whats_due', {});
    check('an ongoing goal that just happened isn\'t due', after.text.includes(`last happened ${day}; raise it from`), after.text);
    await call('write_notes', { goal: ongoing, content: `Last review: 2000-01-01\nLast happened: 2000-01-01 — smoke\nPlanned: 2000-01-15 — smoke` });
    const missed = await call('whats_due', {});
    check('an ongoing goal whose plan has passed asks if it happened', missed.text.includes('was planned for 2000-01-15: did it happen?'), missed.text);

    // Every run is rated, however many there are in a day.
    const runsFile = join(DIR, 'agent', 'runs.md');
    const savedRuns = existsSync(runsFile) ? readFileSync(runsFile, 'utf8') : null;
    await call('rate_run', { skill: 'run', did: 'smoke', rating: 'Good' });
    check('a run already rated today is still asked', (await call('whats_due', {})).text.includes('## Rating — ask at the end of every run'));
    if (savedRuns === null) rmSync(runsFile, { force: true }); else writeFileSync(runsFile, savedRuns);

    writeFileSync(goalsFile, original);
    rmSync(goalDir, { recursive: true, force: true });
    rmSync(`${goalDir}.md`, { force: true });
    rmSync(ongoingDir, { recursive: true, force: true });
    rmSync(`${ongoingDir}.md`, { force: true });
  }
}

proc.kill();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
