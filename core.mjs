export const VERSION = 1;
export const LIMITS = Object.freeze({ name: 100, title: 300, url: 2048, tabsPerWindow: 500, windows: 50, jsonBytes: 2_000_000, sessions: 100 });
const CONTROL = /[\u0000-\u001f\u007f]/g;
const SPACES = /\s+/g;

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }

export function sanitizeTitle(raw, max = LIMITS.title) {
  if (typeof raw !== 'string') return '';
  return raw.replace(CONTROL, ' ').replace(SPACES, ' ').trim().slice(0, max);
}

export function normalizeUrl(raw) {
  if (typeof raw !== 'string') return null;
  const input = raw.trim();
  if (!input || input.length > LIMITS.url) return null;
  let url;
  try { url = new URL(input); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null;
  return url.href;
}

export function sanitizeTab(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const url = normalizeUrl(raw.url);
  if (!url) return null;
  return { url, title: sanitizeTitle(raw.title), pinned: raw.pinned === true };
}

export function dedupeTabs(tabs) {
  const seen = new Set();
  const result = [];
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (!tab || typeof tab.url !== 'string' || seen.has(tab.url)) continue;
    seen.add(tab.url);
    result.push(tab);
  }
  return result;
}

export function groupByWindow(tabs) {
  assert(Array.isArray(tabs), 'tabs must be an array');
  const groups = new Map();
  for (const raw of tabs) {
    const tab = sanitizeTab(raw);
    if (!tab) continue;
    const id = Number.isInteger(raw.windowId) && raw.windowId >= 0 ? raw.windowId : 0;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(tab);
  }
  return [...groups.keys()].sort((a, b) => a - b).slice(0, LIMITS.windows).map((windowId) => ({
    windowId,
    tabs: dedupeTabs(groups.get(windowId)).slice(0, LIMITS.tabsPerWindow),
  }));
}

export function buildSession({ name = 'Session', tabs = [], now = new Date() } = {}) {
  const windows = groupByWindow(tabs).map(({ tabs: list }) => ({ tabs: list }));
  return {
    version: VERSION,
    name: sanitizeTitle(name, LIMITS.name) || 'Session',
    createdAt: new Date(now).toISOString(),
    windows: windows.slice(0, LIMITS.windows),
  };
}

export function validateSession(raw) {
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'session must be an object');
  assert(raw.version === VERSION, `unsupported session version: ${raw.version}`);
  const name = sanitizeTitle(raw.name, LIMITS.name);
  assert(name && name === raw.name, 'invalid session name');
  const createdAt = new Date(raw.createdAt);
  assert(Number.isFinite(createdAt.getTime()) && createdAt.toISOString() === raw.createdAt, 'invalid createdAt');
  assert(Array.isArray(raw.windows) && raw.windows.length <= LIMITS.windows, 'invalid windows');
  const windows = raw.windows.map((win) => {
    assert(win && typeof win === 'object' && Array.isArray(win.tabs) && win.tabs.length <= LIMITS.tabsPerWindow, 'invalid window');
    const tabs = win.tabs.map(sanitizeTab);
    assert(tabs.every(Boolean), 'invalid tab');
    return { tabs: dedupeTabs(tabs) };
  });
  return { version: VERSION, name, createdAt: createdAt.toISOString(), windows };
}

export function exportSession(session) {
  const valid = validateSession(session);
  const json = JSON.stringify(valid, null, 2);
  assert(new TextEncoder().encode(json).byteLength <= LIMITS.jsonBytes, 'backup exceeds size limit');
  return json;
}

export function importSession(json) {
  assert(typeof json === 'string' && new TextEncoder().encode(json).byteLength <= LIMITS.jsonBytes, 'backup exceeds size limit');
  let parsed;
  try { parsed = JSON.parse(json); } catch { fail('invalid JSON'); }
  return validateSession(parsed);
}

export function searchTabs(tabs, query = '') {
  const terms = sanitizeTitle(query).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (Array.isArray(tabs) ? tabs : []).filter((tab) => {
    const haystack = `${tab.title ?? ''} ${tab.url ?? ''}`.toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function searchSession(session, query = '') {
  return session.windows.flatMap((win, windowIndex) => searchTabs(win.tabs, query).map((tab) => ({ windowIndex, tab })));
}
