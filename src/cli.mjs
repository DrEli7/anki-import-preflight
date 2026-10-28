#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { auditImport, toMarkdown } from './index.mjs';

const help = `Usage: anki-import-preflight INPUT --fields N [options]

  --delimiter tab|comma|semicolon|pipe   Default: tab
  --existing FILE                       Same field layout and scope as INPUT
  --media-dir DIRECTORY                 Check flat-directory filenames
  --html                                Enable HTML/media mode (or #html:true)
  --format markdown|json                Default: markdown
  --fail-on error|warning|never          Default: error
  --help                               Show help

UTF-8 inputs up to 20 MiB; input files are never modified.
Exit 0: threshold not met; 1: findings; 2: invalid arguments or unreadable input.
`;

async function readText(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024) throw new Error('Input must be a regular file no larger than 20 MiB.');
  return new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
}

try {
  const { values, positionals, tokens } = parseArgs({ options: {
    fields: { type: 'string' }, delimiter: { type: 'string' }, existing: { type: 'string' },
    'media-dir': { type: 'string' }, html: { type: 'boolean' }, format: { type: 'string' }, 'fail-on': { type: 'string' }, help: { type: 'boolean' },
  }, allowPositionals: true, strict: true, tokens: true });
  const names = tokens.filter(t => t.kind === 'option').map(t => t.name);
  if (new Set(names).size !== names.length) throw new Error('Duplicate options are not allowed.');
  if (values.help) { process.stdout.write(help); }
  else {
    if (positionals.length !== 1) throw new Error('Provide exactly one input file. See --help.');
    if (!/^\d+$/.test(values.fields ?? '')) throw new Error('--fields is required and must be a positive integer.');
    const format = values.format ?? 'markdown';
    const failOn = values['fail-on'] ?? 'error';
    if (!['markdown', 'json'].includes(format)) throw new Error('--format must be markdown or json.');
    if (!['error', 'warning', 'never'].includes(failOn)) throw new Error('--fail-on must be error, warning, or never.');
    const mediaFiles = values['media-dir'] === undefined ? undefined : (await readdir(values['media-dir'], { withFileTypes: true })).filter(x => x.isFile()).map(x => x.name);
    const report = auditImport(await readText(positionals[0]), {
      fields: Number(values.fields), delimiter: values.delimiter ?? 'tab', mediaFiles, html: values.html,
      existingText: values.existing === undefined ? undefined : await readText(values.existing),
    });
    process.stdout.write(format === 'json' ? JSON.stringify(report, null, 2) + '\n' : toMarkdown(report));
    if (failOn !== 'never' && (report.summary.errors || (failOn === 'warning' && report.summary.warnings))) process.exitCode = 1;
  }
} catch (error) {
  // Parser messages can contain note text. Keep errors safe to paste into bug reports.
  const message = error.code?.startsWith('CSV_') ? `Invalid CSV (${error.code}).` : error.message;
  process.stderr.write(`anki-import-preflight: ${message}\n`);
  process.exitCode = 2;
}
