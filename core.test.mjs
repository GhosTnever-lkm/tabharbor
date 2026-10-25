import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSession, dedupeTabs, exportSession, groupByWindow, importSession, LIMITS, mergeSessions, normalizeUrl, prependSession, searchSession, searchTabs, validateSession, VERSION } from './core.mjs';

const tab = (url, title = '', pinned = false) => ({ url, title, pinned });

test('release versions match between package metadata, browser manifest, and changelog', () => {
  const packageVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
  const manifestVersion = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8')).version;
  const changelog = readFileSync(new URL('./CHANGELOG.md', import.meta.url), 'utf8');
  assert.equal(manifestVersion, packageVersion);
  const versionPattern = packageVersion.replaceAll('.', '\\.');
  assert.match(changelog, new RegExp(`^## ${versionPattern}(?: - \\d{4}-\\d{2}-\\d{2})?$`, 'm'));
});

test('normalizes HTTP(S) and rejects executable or credential URLs', () => {
  assert.equal(normalizeUrl(' HTTPS://example.com:443/a '), 'https://example.com/a');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('data:text/html,hello'), null);
  assert.equal(normalizeUrl('https://user:pass@example.com/'), null);
});

test('groups windows in order, skips invalid URLs, and deduplicates per window', () => {
  const wins = groupByWindow([
    { windowId: 4, ...tab('https://b.io/', 'b') },
    { windowId: 1, ...tab('https://a.io/', 'a') },
    { windowId: 1, ...tab('https://a.io/', 'duplicate') },
    { windowId: 4, ...tab('javascript:1', 'bad') },
  ]);
  assert.deepEqual(wins.map((w) => w.windowId), [1, 4]);
  assert.equal(wins[0].tabs.length, 1);
});

test('rejects saves over window or per-window tab limits instead of truncating them', () => {
  const tooManyTabs = Array.from({ length: LIMITS.tabsPerWindow + 1 }, (_, index) => ({
    windowId: 1,
    ...tab(`https://tab-${index}.example/`, `Tab ${index}`),
  }));
  const tooManyWindows = Array.from({ length: LIMITS.windows + 1 }, (_, index) => ({
    windowId: index,
    ...tab(`https://window-${index}.example/`, `Tab ${index}`),
  }));

  assert.throws(() => buildSession({ tabs: tooManyTabs }), /tabs per window/);
  assert.throws(() => buildSession({ tabs: tooManyWindows }), /windows/);
});

test('builds stable named session and backup roundtrip', () => {
  const session = buildSession({ name: '  Work   set ', now: '2025-01-02T03:04:05Z', tabs: [{ windowId: 0, ...tab('https://a.io/', 'A', true) }] });
  assert.equal(session.version, VERSION);
  assert.equal(session.name, 'Work set');
  assert.deepEqual(importSession(exportSession(session)), session);
});

test('rejects malformed, unsafe, oversized and unsupported backups', () => {
  const session = buildSession({ name: 'Safe', tabs: [tab('https://a.io/')] });
  assert.throws(() => importSession('{'), /invalid JSON/);
  assert.throws(() => validateSession({ ...session, version: 2 }), /version/);
  assert.throws(() => validateSession({ ...session, windows: [{ tabs: [{ url: 'javascript:1' }] }] }), /invalid tab/);
  assert.throws(() => importSession('x'.repeat(2_000_001)), /size/);
});

test('deduplicates by canonical URL and filters with all query terms', () => {
  const tabs = dedupeTabs([tab('https://example.com/', 'Daily'), tab('https://example.com/', 'Duplicate'), tab('https://example.com/blog', 'Weekly')]);
  assert.equal(tabs.length, 2);
  assert.equal(searchTabs(tabs, 'weekly example').length, 1);
  assert.equal(searchTabs(tabs, 'missing').length, 0);
});

test('searchSession returns each matching tab with its saved window index', () => {
  const session = buildSession({ tabs: [{ windowId: 0, ...tab('https://a.io/', 'Alpha') }, { windowId: 1, ...tab('https://b.io/', 'Beta') }] });
  const hits = searchSession(session, 'beta');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].windowIndex, 1);
});

test('rejects imports that exceed the library limit instead of silently dropping new sessions', () => {
  const makeSession = (index) => buildSession({ name: `Session ${index}`, now: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString(), tabs: [tab(`https://example.com/${index}`, `Tab ${index}`)] });
  const existing = Array.from({ length: LIMITS.sessions }, (_, index) => makeSession(index));
  const incoming = [makeSession(LIMITS.sessions + 1)];
  assert.throws(() => mergeSessions(existing, incoming), new RegExp(`Import would exceed the ${LIMITS.sessions}-session limit`));
  assert.equal(existing.length, LIMITS.sessions);
  assert.equal(incoming[0].name, `Session ${LIMITS.sessions + 1}`);
});

test('preserves existing sessions and reports duplicates while importing within the limit', () => {
  const existing = buildSession({ name: 'Saved', now: '2025-01-01T00:00:00.000Z', tabs: [tab('https://example.com/original', 'Original')] });
  const duplicate = buildSession({ name: 'Saved', now: '2025-01-01T00:00:00.000Z', tabs: [tab('https://example.com/replacement', 'Replacement')] });
  const incoming = buildSession({ name: 'New', now: '2025-01-02T00:00:00.000Z', tabs: [tab('https://example.com/new', 'New')] });
  const result = mergeSessions([existing], [duplicate, incoming]);
  assert.deepEqual(result.sessions, [existing, incoming]);
  assert.equal(result.importedCount, 1);
  assert.equal(result.duplicateCount, 1);
});

test('refuses a new save at the library limit without dropping existing sessions', () => {
  const makeSession = (index) => buildSession({ name: `Session ${index}`, now: new Date(Date.UTC(2025, 0, 1, 0, 0, index)).toISOString(), tabs: [tab(`https://example.com/${index}`, `Tab ${index}`)] });
  const existing = Array.from({ length: LIMITS.sessions }, (_, index) => makeSession(index));
  const incoming = makeSession(LIMITS.sessions);
  assert.throws(() => prependSession(existing, incoming), /Session library is full/);
  assert.equal(existing.length, LIMITS.sessions);
  assert.equal(existing[0].name, 'Session 0');
});
