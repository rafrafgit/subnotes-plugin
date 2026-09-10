#!/usr/bin/env node
// Drives the server over real stdio, the same way Claude Code will. Checks the
// happy path and the three refusals that are the whole point of the design:
// an unconnected notebook, an invented section, a bad priority.

import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { readdirSync, readFileSync, rmSync } from 'node:fs';

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
check('four tools', tools.result.tools.length === 4,
      tools.result.tools.map(t => t.name).join(', '));

const list = await call('list_notebooks');
check('list_notebooks', !list.isError && list.text.includes('Open tasks'));
const first = list.text.match(/^## (.+)$/m)?.[1];
check('a notebook is connected', !!first, first ?? '');
console.log(`\n${list.text}\n`);

const read = await call('read_notebook', { name: first.toLowerCase() });
check('read_notebook matches case-insensitively', !read.isError, `${read.text.length} chars`);
check('reading is much dearer than listing', read.text.length > list.text.length * 2,
      `${list.text.length} vs ${read.text.length} chars`);

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
  check('priority defaults to Someday', payload.tasks[1].priority === 'Someday');
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

proc.kill();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
