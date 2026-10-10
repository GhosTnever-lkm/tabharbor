import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSession, dedupeTabs, exportSession, groupByWindow, importSession, normalizeUrl, searchSession, searchTabs, validateSession, VERSION } from './core.mjs';

const tab = (url, title = '', pinned = false) => ({ url, title, pinned });

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
