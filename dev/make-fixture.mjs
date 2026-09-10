#!/usr/bin/env node
// Builds a Connector folder from a Subnotes backup file, so the plugin can be
// built and used before the app can produce one itself.
//
// This is a stand-in for app-side work item 3 (export on change). It writes to
// the real container path on purpose: same hidden ~/Library location, same
// permissions, so anything surprising about reaching it from a terminal shows
// up now rather than after the schema deploy.
//
//   node dev/make-fixture.mjs [backup.txt] [--connect A,B,C]
//
// With no --connect, every notebook is connected. Real usage should pass a
// subset — "reads are opt-in per notebook" is the whole privacy model, and a
// fixture that connects everything cannot show you when that filter is wrong.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONTAINER = join(homedir(), 'Library/Containers/com.subnotes.app/Data/Documents');
const CONNECTOR = join(CONTAINER, 'Connector');

const args = process.argv.slice(2);
const connectFlag = args.indexOf('--connect');
const connectOnly = connectFlag >= 0 ? args[connectFlag + 1].split(',').map(s => s.trim()) : null;
const positional = args.filter((a, i) => !a.startsWith('--') && i !== connectFlag + 1);

function newestBackup() {
  const dir = join(CONTAINER, 'Subnotes Backups');
  const files = readdirSync(dir).filter(f => f.endsWith('.txt')).sort();
  if (!files.length) throw new Error(`no backups in ${dir}`);
  return join(dir, files[files.length - 1]);
}

const source = positional[0] ?? newestBackup();

// Split on ⟦NOTE:…⟧ exactly as TextParser.parseSections does: the marker is the
// document boundary, deliberately distinct from a "## " line a user can type.
function parseSections(text) {
  const out = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const note = line.match(/^⟦NOTE:(.*)⟧$/);
    if (note) {
      if (cur) out.push(cur);
      cur = { name: note[1], purpose: null, lines: [] };
      continue;
    }
    const purpose = line.match(/^⟦PURPOSE:(.*)⟧$/);
    if (purpose && cur) { cur.purpose = purpose[1]; continue; }
    // Unknown ⟦KEY:value⟧ markers are skipped, matching the app's forward
    // tolerance — a newer app writing a marker this script predates must not
    // turn into body text here.
    if (/^⟦[A-Z_]+:.*⟧$/.test(line)) continue;
    if (cur) cur.lines.push(line);
  }
  if (cur) out.push(cur);
  return out;
}

const isTask = l => l.startsWith('• ') || l.startsWith('* ');

function summarize(section) {
  const sections = [];
  let open = 0;
  for (const line of section.lines) {
    if (line.startsWith('### ')) sections.push(line.slice(4).trim());
    else if (isTask(line) && !line.includes('[Done]')) open++;
  }
  return { sections, open };
}

// A notebook name is not a filename. Keep it recognisable but safe, and let the
// manifest carry the real name — the plugin addresses notebooks by name and
// never has to reconstruct one from a path.
const seen = new Set();
function fileNameFor(name) {
  let base = name.replace(/[/\\:]/g, '-').trim() || 'Untitled';
  let candidate = base, n = 2;
  while (seen.has(candidate.toLowerCase())) candidate = `${base} ${n++}`;
  seen.add(candidate.toLowerCase());
  return `${candidate}.txt`;
}

const all = parseSections(readFileSync(source, 'utf8'));
const chosen = connectOnly
  ? all.filter(s => connectOnly.some(c => c.toLowerCase() === s.name.toLowerCase()))
  : all;

if (connectOnly) {
  const missing = connectOnly.filter(c => !all.some(s => s.name.toLowerCase() === c.toLowerCase()));
  if (missing.length) throw new Error(`not in backup: ${missing.join(', ')}`);
}

if (existsSync(CONNECTOR)) rmSync(CONNECTOR, { recursive: true });
mkdirSync(join(CONNECTOR, 'notebooks'), { recursive: true });
mkdirSync(join(CONNECTOR, 'inbox'), { recursive: true });
mkdirSync(join(CONNECTOR, 'failed'), { recursive: true });

const notebooks = chosen.map(s => {
  const file = fileNameFor(s.name);
  // Same format the app exports, minus the ⟦NOTE:…⟧ boundary: one notebook per
  // file makes the boundary redundant. ⟦PURPOSE:…⟧ stays.
  const header = s.purpose ? `⟦PURPOSE:${s.purpose}⟧\n` : '';
  writeFileSync(join(CONNECTOR, 'notebooks', file), header + s.lines.join('\n'));
  const { sections, open } = summarize(s);
  return { name: s.name, purpose: s.purpose, file: `notebooks/${file}`, sections, openTasks: open };
});

writeFileSync(join(CONNECTOR, 'manifest.json'), JSON.stringify({
  appVersion: '1.4.0-fixture',
  connectorVersion: 1,
  exportedAt: new Date().toISOString(),
  notebooks,
}, null, 2) + '\n');

console.log(`${CONNECTOR}\nfrom ${source}\n${notebooks.length} of ${all.length} notebooks connected:`);
for (const n of notebooks) console.log(`  ${n.name} — ${n.openTasks} open, ${n.sections.length} sections${n.purpose ? '' : ' (no purpose)'}`);
