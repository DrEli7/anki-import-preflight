import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const run = args => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('CLI emits valid JSON, detects findings, preserves inputs and checks the media directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anki-preflight-test-'));
  try {
    const path = join(dir, 'input.csv'); const media = join(dir, 'media'); mkdirSync(media);
    const original = 'a,[sound:missing.mp3]\n'; writeFileSync(path, original);
    const args = [path, '--fields', '2', '--delimiter', 'comma', '--format', 'json', '--media-dir', media, '--html'];
    const report = run(args);
    assert.equal(report.status, 1, report.stderr);
    assert.equal(JSON.parse(report.stdout).issues[0].code, 'MISSING_MEDIA');
    assert.equal(readFileSync(path, 'utf8'), original);
    assert.equal(run([...args, '--fail-on', 'never']).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CLI rejects unknown, duplicate and malformed arguments', () => {
  assert.equal(run(['--wat']).status, 2);
  assert.equal(run(['input.csv', '--fields', 'two']).status, 2);
  assert.equal(run(['input.csv', '--fields', '2', '--fields', '3']).status, 2);
  assert.equal(run(['--help']).status, 0);
});

test('CLI rejects invalid UTF-8 and masks parser excerpts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anki-preflight-test-'));
  try {
    const path = join(dir, 'input.csv'); writeFileSync(path, Buffer.from([0xff, 0xfe]));
    assert.equal(run([path, '--fields', '2', '--delimiter', 'comma']).status, 2);
    writeFileSync(path, '"PRIVATE-NOTE');
    const result = run([path, '--fields', '2', '--delimiter', 'comma']);
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stderr, /PRIVATE-NOTE/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
