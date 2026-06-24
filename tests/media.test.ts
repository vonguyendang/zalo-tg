import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';

process.env.TG_TOKEN ||= 'test-token';
process.env.TG_GROUP_ID ||= '-1001';
process.env.DATA_DIR ||= path.join(os.tmpdir(), `zalo-tg-media-test-${process.pid}`);

const {
  cleanTemp,
  detectMediaType,
  downloadToTemp,
  sanitizeFileName,
  telegramMediaBatches,
} = await import('../src/utils/media.js');

test('sanitizeFileName keeps Unicode while replacing unsafe characters', () => {
  assert.equal(sanitizeFileName('Hồ sơ/2026:"x"?.pdf'), 'Hồ sơ_2026__x__.pdf');
});

test('sanitizeFileName replaces dot-only and blank names with safe values', () => {
  assert.equal(sanitizeFileName('...'), '_');
  assert.equal(sanitizeFileName('   ', 'fallback.bin'), 'fallback.bin');
});

test('sanitizeFileName enforces a bounded filename length', () => {
  assert.equal(sanitizeFileName('a'.repeat(500)).length, 180);
});

test('telegramMediaBatches handles empty, exact and trailing-single batches', () => {
  assert.deepEqual(telegramMediaBatches([]), []);
  assert.deepEqual(telegramMediaBatches([1, 2], 2), [[1, 2]]);
  assert.deepEqual(telegramMediaBatches([1, 2, 3], 2), [[1, 2], [3]]);
});

test('telegramMediaBatches rejects invalid Telegram album sizes', () => {
  assert.throws(() => telegramMediaBatches([1], 1), /integer >= 2/);
  assert.throws(() => telegramMediaBatches([1], 2.5), /integer >= 2/);
});

test('detectMediaType handles case, query strings and unknown extensions', () => {
  assert.equal(detectMediaType('PHOTO.JPG?token=1'), 'image');
  assert.equal(detectMediaType('clip.WebM#x'), 'video');
  assert.equal(detectMediaType('archive.zip'), 'document');
  assert.equal(detectMediaType('https://x/y.png?download=.bin'), 'image');
});

test('downloadToTemp copies file URLs into bridge-owned storage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'zalo-tg-file-url-'));
  const src = path.join(dir, 'nguồn.txt');
  await writeFile(src, 'payload', 'utf8');
  const copied = await downloadToTemp(pathToFileURL(src).toString(), '../unsafe?.txt');
  assert.equal(await readFile(copied, 'utf8'), 'payload');
  assert.notEqual(copied, src);
  assert.equal(path.basename(copied).includes('/'), false);
  await cleanTemp(copied);
});

test('downloadToTemp rejects nonsensical retry counts before I/O', async () => {
  await assert.rejects(() => downloadToTemp('https://invalid.example/file', 'x', 0), /retries must be/);
  await assert.rejects(() => downloadToTemp('https://invalid.example/file', 'x', 1.5), /retries must be/);
});

test('cleanTemp is idempotent for missing paths', async () => {
  await cleanTemp(path.join(os.tmpdir(), `missing-${process.pid}-${Date.now()}`));
});
