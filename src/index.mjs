import { parse } from 'csv-parse/sync';
import { parseDocument } from 'htmlparser2';

export const delimiters = Object.freeze({ comma: ',', tab: '\t', semicolon: ';', pipe: '|' });

function readRows(text, fields, delimiter) {
  if (typeof text !== 'string') throw new TypeError('Input must be UTF-8 text.');
  const headers = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.startsWith('#')) break;
    const match = /^#([^:]+):(.*)$/.exec(line);
    if (match) headers.push({ name: match[1].trim().toLowerCase(), value: match[2].trim() });
  }
  const headerNames = headers.map(h => h.name);
  if (new Set(headerNames).size !== headerNames.length) throw new Error('Duplicate Anki file headers are not supported.');
  const separator = headers.find(h => h.name === 'separator');
  if (separator && delimiters[separator.value.toLowerCase()] !== delimiter) {
    throw new Error('The #separator header conflicts with the declared delimiter, or is unsupported.');
  }
  const records = parse(text, {
    delimiter, bom: true, comment: '#', comment_no_infix: true,
    skip_empty_lines: true, relax_column_count: true, info: true, max_record_size: 2_000_000,
  });
  return { headers, rows: records.map((entry, i) => ({ row: i + 1, endLine: entry.info.lines, values: entry.record, valid: entry.record.length === fields && entry.record[0].trim() !== '' })) };
}

function mediaReferences(values) {
  const names = new Set();
  for (const value of values) {
    for (const match of value.matchAll(/\[sound:([^\]\r\n]+)\]/g)) names.add(match[1]);
    const pending = [...parseDocument(value).children];
    while (pending.length) {
      const node = pending.pop();
      if (node.name === 'img' && node.attribs?.src) names.add(node.attribs.src);
      if (node.children) pending.push(...node.children);
    }
  }
  return [...names];
}

/** Exact, literal first-field comparison, within one caller-selected note type/deck scope. */
export function auditImport(text, options = {}) {
  const { fields, delimiter = 'tab', existingText, mediaFiles, html } = options;
  if (!Number.isSafeInteger(fields) || fields < 1 || fields > 1000) throw new Error('fields must be an integer from 1 to 1000.');
  if (!Object.hasOwn(delimiters, delimiter)) throw new Error('delimiter must be comma, tab, semicolon, or pipe.');
  if (mediaFiles !== undefined && (!Array.isArray(mediaFiles) || mediaFiles.some(x => typeof x !== 'string'))) throw new Error('mediaFiles must be an array of file names.');
  const incoming = readRows(text, fields, delimiters[delimiter]);
  const htmlHeader = incoming.headers.find(h => h.name === 'html');
  if (html !== undefined && typeof html !== 'boolean') throw new Error('html must be a boolean.');
  if (htmlHeader && !['true', 'false'].includes(htmlHeader.value.toLowerCase())) throw new Error('#html must be true or false.');
  const declaredHtml = htmlHeader ? htmlHeader.value.toLowerCase() === 'true' : undefined;
  if (html !== undefined && declaredHtml !== undefined && html !== declaredHtml) throw new Error('The #html header conflicts with the html option.');
  const htmlEnabled = html ?? declaredHtml ?? false;
  const existing = existingText === undefined ? undefined : readRows(existingText, fields, delimiters[delimiter]);
  const issues = [];
  const add = (severity, code, source, row, message, extra = {}) => issues.push({ severity, code, source, row, message, ...extra });
  for (const [source, data] of [['incoming', incoming], ['existing', existing]]) {
    if (!data) continue;
    if (!data.rows.length) add('error', 'EMPTY_INPUT', source, null, 'No data records were found.');
    for (const header of data.headers) {
      if (!['separator', 'html'].includes(header.name)) {
        add('warning', 'HEADER_NOT_MODELED', source, null, `Anki header ${header.name} is not modeled. Select a single scope and compare the correct first field.`);
      }
    }
    for (const row of data.rows) {
      if (row.values.length !== fields) add('error', 'FIELD_COUNT', source, row.row, `Expected ${fields} fields, found ${row.values.length}.`, { endLine: row.endLine });
      if (!row.values[0].trim()) add('error', 'EMPTY_FIRST_FIELD', source, row.row, 'The first field is empty or whitespace.');
    }
  }
  const existingIndex = new Map();
  for (const row of existing?.rows ?? []) {
    if (!row.valid) continue;
    const list = existingIndex.get(row.values[0]) ?? [];
    list.push(row); existingIndex.set(row.values[0], list);
  }
  const seen = new Map();
  const records = [];
  const media = mediaFiles === undefined ? undefined : new Set(mediaFiles);
  for (const row of incoming.rows) {
    if (!row.valid) { records.push({ row: row.row, status: 'invalid' }); continue; }
    const first = seen.get(row.values[0]);
    if (first) {
      const identical = JSON.stringify(first.values) === JSON.stringify(row.values);
      add(identical ? 'warning' : 'error', identical ? 'DUPLICATE_RECORD' : 'FIRST_FIELD_CONFLICT', 'incoming', row.row,
        identical ? 'An identical record occurs earlier in the input.' : 'The same literal first field has different remaining fields.', { relatedRow: first.row });
    } else seen.set(row.values[0], row);
    const matches = existingIndex.get(row.values[0]) ?? [];
    let status = existing ? 'new' : 'uncompared';
    if (matches.length > 1) {
      status = 'ambiguous';
      add('warning', 'AMBIGUOUS_EXISTING', 'incoming', row.row, 'Multiple baseline records share this first field; no update prediction is made.', { existingRows: matches.map(x => x.row) });
    } else if (matches.length === 1) {
      status = JSON.stringify(matches[0].values) === JSON.stringify(row.values) ? 'unchanged' : 'changed';
    }
    records.push({ row: row.row, status, ...(matches.length ? { existingRows: matches.map(x => x.row) } : {}) });
    for (const name of htmlEnabled ? mediaReferences(row.values) : []) {
      if (/^[a-z][a-z\d+.-]*:/i.test(name) || name.startsWith('//')) {
        add('warning', 'REMOTE_MEDIA_UNCHECKED', 'incoming', row.row, 'A remote or embedded media reference was not checked.');
      } else if (/[\\/\x00-\x1f]/.test(name) || name === '.' || name === '..') {
        add('error', 'MEDIA_NOT_FLAT', 'incoming', row.row, 'Media must be a plain filename in the flat collection.media directory.');
      } else if (media && !media.has(name)) {
        add('error', 'MISSING_MEDIA', 'incoming', row.row, 'Referenced media file was not present.', { filename: name });
      }
    }
  }
  const counts = Object.fromEntries(['new', 'changed', 'unchanged', 'ambiguous', 'invalid', 'uncompared'].map(key => [key, records.filter(x => x.status === key).length]));
  return {
    schemaVersion: 1, tool: 'anki-import-preflight',
    scope: { comparison: 'literal-first-field', fields, delimiter, htmlEnabled, existingProvided: Boolean(existing), mediaChecked: Boolean(media) && htmlEnabled },
    summary: { records: incoming.rows.length, errors: issues.filter(x => x.severity === 'error').length, warnings: issues.filter(x => x.severity === 'warning').length, ...counts },
    records, issues,
  };
}

const cell = value => String(value ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\|/g, '&#124;').replace(/[\r\n]/g, ' ');
export function toMarkdown(report) {
  const s = report.summary;
  return [
    '# Anki import preflight', '',
    `Records: **${s.records}** · Errors: **${s.errors}** · Warnings: **${s.warnings}**`, '',
    'Exact first-field comparison only; this is not a simulation of Anki import behavior.', '',
    '| Status | Records |', '| --- | ---: |',
    ...['new', 'changed', 'unchanged', 'ambiguous', 'invalid', 'uncompared'].map(k => `| ${k} | ${s[k]} |`), '',
    '| Source | Record | Severity | Code | Detail |', '| --- | ---: | --- | --- | --- |',
    ...report.issues.map(i => `| ${cell(i.source)} | ${cell(i.row)} | ${i.severity} | ${i.code} | ${cell(i.message)}${i.relatedRow ? ` Earlier record: ${i.relatedRow}.` : ''}${i.filename ? ` File: ${cell(i.filename)}` : ''} |`), '',
    report.issues.length ? '' : 'No findings within the declared scope.', '',
    report.scope.mediaChecked ? 'Media checked against supplied flat-directory filenames.' : 'Media existence was not checked (HTML mode and a media directory are both required).', '',
  ].join('\n');
}
