import test from 'node:test';
import assert from 'node:assert/strict';
import { auditImport, toMarkdown } from '../src/index.mjs';

const audit = (text, extra = {}) => auditImport(text, { fields: 2, delimiter: 'comma', ...extra });

test('CSV parsing preserves quoted multiline fields, commas, Unicode and hash literals', () => {
  const result = audit('\uFEFF#separator:Comma\n# comment\n"你好,世界","line1\nline2"\nkey#1,answer\n');
  assert.equal(result.summary.records, 2);
  assert.equal(result.summary.errors, 0);
});

test('field width, empty first fields, duplicate and conflicting records are distinguished', () => {
  const result = audit('a,b\na,b\na,c\nx,y,z\n,b\n');
  assert.deepEqual(result.issues.map(i => i.code).sort(), ['DUPLICATE_RECORD', 'EMPTY_FIRST_FIELD', 'FIELD_COUNT', 'FIRST_FIELD_CONFLICT'].sort());
  assert.equal(result.summary.invalid, 2);
  assert.equal(result.summary.errors, 3);
});

test('baseline comparison reports exact unchanged, changed, new and ambiguous rows', () => {
  const result = audit('one,1\ntwo,2\nthree,3\nfour,4\n', { existingText: 'one,1\ntwo,old\nfour,4\nfour,other\n' });
  assert.deepEqual(result.records.map(x => x.status), ['unchanged', 'changed', 'new', 'ambiguous']);
  assert.equal(result.summary.ambiguous, 1);
  assert.deepEqual(result.records[3].existingRows, [3, 4]);
});

test('literal comparison does not silently strip HTML or whitespace', () => {
  const result = audit('<b>a</b>,b\na ,b\n', { existingText: 'a,b\n' });
  assert.equal(result.summary.new, 2);
});

test('media uses HTML parsing and catches missing, remote and non-flat references', () => {
  const result = audit('one,"<IMG SRC=""good&amp;one.png"">[sound:missing.mp3]<img src=../escape.png><img src=https://example.org/remote>"\n', { mediaFiles: ['good&one.png'], html: true });
  assert.deepEqual(result.issues.map(x => x.code).sort(), ['MISSING_MEDIA', 'MEDIA_NOT_FLAT', 'REMOTE_MEDIA_UNCHECKED'].sort());
  assert.equal(result.issues.find(x => x.code === 'MISSING_MEDIA').filename, 'missing.mp3');
});

test('media existence is not claimed without a supplied inventory', () => {
  const result = audit('one,[sound:missing.mp3]\n');
  assert.equal(result.summary.errors, 0);
  assert.equal(result.scope.mediaChecked, false);
  assert.match(toMarkdown(result), /not checked/);
});

test('HTML false treats image and sound strings as text; conflicting declarations fail', () => {
  const result = audit('#html:false\none,<img src=x.png>[sound:y.mp3]\n', { mediaFiles: [] });
  assert.equal(result.summary.errors, 0);
  assert.equal(result.scope.mediaChecked, false);
  assert.throws(() => audit('#html:false\na,b', { html: true }), /conflicts/);
  const enabled = audit('#html:true\na,[sound:x.mp3]', { mediaFiles: [] });
  assert.equal(enabled.issues[0].code, 'MISSING_MEDIA');
});

test('baseline invalid rows are reported and excluded from matching', () => {
  const result = audit('a,b\n', { existingText: 'a,b,c\n' });
  assert.equal(result.records[0].status, 'new');
  assert.equal(result.issues[0].source, 'existing');
  assert.equal(result.issues[0].code, 'FIELD_COUNT');
});

test('Anki directives outside supported semantics are explicitly flagged', () => {
  const result = audit('#notetype column:1\na,b\n');
  assert.equal(result.issues[0].code, 'HEADER_NOT_MODELED');
});

test('empty input, unsupported options, mismatching separator and malformed CSV fail clearly', () => {
  assert.equal(audit('').issues[0].code, 'EMPTY_INPUT');
  assert.throws(() => audit('a,b', { fields: 0 }), /fields/);
  assert.throws(() => audit('a,b', { delimiter: 'auto' }), /delimiter/);
  assert.throws(() => audit('#separator:Tab\na,b'), /separator/);
  assert.throws(() => audit('#html:true\n#html:false\na,b'), /Duplicate/);
  assert.throws(() => audit('"unterminated,b'));
});

test('Markdown escapes media filename markup and reports no note contents', () => {
  const result = audit('private note,[sound:<img|bad>.mp3]\n', { mediaFiles: [], html: true });
  const output = toMarkdown(result);
  assert.doesNotMatch(output, /private note|<img/);
  assert.match(output, /&lt;img&#124;bad>/);
});
