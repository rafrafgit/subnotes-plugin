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
check('fifteen tools', tools.result.tools.length === 15,
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
  const none = await call('read_journal', { notebook: first });
  check('read_journal says when there is none', !none.isError && none.text.includes('No journal yet'));
  const saved = await call('write_journal', { notebook: first, content: '# Smoke test journal' });
  check('write_journal saves', !saved.isError && existsSync(journal));
  const back = await call('read_journal', { notebook: first });
  check('read_journal returns it', back.text.trim() === '# Smoke test journal');
  rmSync(journal);
}
const emptyJournal = await call('write_journal', { notebook: first, content: '  ' });
check('an empty journal refuses', emptyJournal.isError);
const strayJournal = await call('read_journal', { notebook: 'Definitely Not Connected' });
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

// Thoughts need a section in a notebook file, so only in a fixture folder.
if (process.env.SUBNOTES_DIR) {
  const file = join(DIR, JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')).notebooks.find(n => n.name === first).file);
  const original = readFileSync(file, 'utf8');
  // A notebook with a Thoughts section of its own (Goals has one) would be
  // read instead of the test's, so its heading is renamed while this runs.
  const bare = original.replace(/^(#{1,3})\s+thoughts\b(.*)$/gim, '$1 Earlier notes$2');
  const store = join(DIR, 'agent', 'thoughts', `${first.replace(/[\/:\0]/g, '-')}.json`);
  rmSync(store, { force: true });
  writeFileSync(file, bare + '\n## Thoughts\nI wonder about one thing\n\twith a detail\n• A task-like thought [Next]\n## After\nnot a thought\n');
  const fresh = await call('new_thoughts', { notebook: first });
  check('new_thoughts lists the section, subnotes joined, tags dropped',
        fresh.text.includes('1. I wonder about one thing — with a detail') && fresh.text.includes('2. A task-like thought')
        && !fresh.text.includes('not a thought'), fresh.text);
  const wrong = await call('mark_thoughts_seen', { notebook: first, thoughts: ['made up'] });
  check('marking a thought the notebook lacks refuses', wrong.isError);
  await call('mark_thoughts_seen', { notebook: first, thoughts: [{ text: 'I wonder about one thing — with a detail', became: 'suggestion: Pick one of three' }] });
  const after = await call('new_thoughts', { notebook: first });
  check('a seen thought is not new again, but still open with what it became',
        after.text.includes('1. A task-like thought') && after.text.includes('still open')
        && after.text.includes('I wonder about one thing — with a detail (seen ') && after.text.includes('became: suggestion: Pick one of three'), after.text);
  await call('mark_thoughts_seen', { notebook: first, thoughts: ['I wonder about one thing — with a detail'] });
  const kept = await call('new_thoughts', { notebook: first });
  check('marking it again without a note keeps what it became', kept.text.includes('became: suggestion: Pick one of three'), kept.text);
  check('the store holds fingerprints and notes, not the text', !readFileSync(store, 'utf8').includes('wonder'));
  writeFileSync(file, bare + '\n## Thoughts\n• A task-like thought [Next]\n');
  await call('mark_thoughts_seen', { notebook: first, thoughts: ['A task-like thought'] });
  check('a thought the user deleted leaves the store', !readFileSync(store, 'utf8').includes('Pick one of three'));
  writeFileSync(file, bare);
  const none = await call('new_thoughts', { notebook: first });
  check('no Thoughts section says so', none.text.includes('no Thoughts section'));
  writeFileSync(file, original);
  rmSync(store, { force: true });
}

// review_context writes a snapshot and write_journal a journal, so only in a
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
  await call('write_journal', { notebook: first, content: '# Smoke test journal' });
  check('write_journal keeps the pending snapshot', existsSync(snap) && !existsSync(pending));
  const same = await call('review_context', { notebooks: [first] });
  check('an unchanged notebook says so', same.text.includes('Nothing has changed since the last visit'));
  writeFileSync(file, original.replace(/\n*$/, '\n') + '## Smoke section\n• Smoke diff task [Next]\n');
  const diff = await call('review_context', { notebooks: [first] });
  check('a change shows only the changed section, its lines marked',
        diff.text.includes('### Smoke section (new section)') && diff.text.includes('+ • Smoke diff task [Next]   ← new task')
        && !diff.text.includes('No snapshot'), diff.text.split('## What changed')[1]);
  check('a snapshot holds fingerprints, not text', !readFileSync(pending, 'utf8').includes('Smoke diff'));
  await call('write_journal', { notebook: first, content:
    '## Open suggestions\n- 2026-10-18 — Smoke diff task — why: it is there\n- 2026-10-18 — Smoke task the user deleted — why: gone\n\n## Observations\n' });
  const status = await call('review_context', { notebooks: [first] });
  check('open suggestions come with what the notebook shows of them',
        status.text.includes('- Smoke diff task: scheduled [Next] in Smoke section — accepted')
        && status.text.includes('- Smoke task the user deleted: not in the notebook'), status.text.split('## Learnings')[0].slice(-400));
  const stray = await call('review_context', { notebooks: ['Definitely Not Connected'] });
  check('review_context refuses an unconnected notebook', stray.isError);

  writeFileSync(file, original);
  if (savedJournal === null) rmSync(journalFile, { force: true }); else writeFileSync(journalFile, savedJournal);
  rmSync(snap, { force: true }); rmSync(pending, { force: true });
}

proc.kill();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
