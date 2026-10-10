import { buildSession, exportSession, importSession, sanitizeTitle, searchSession } from './core.mjs';

const KEY = 'tabharbor.sessions';
const els = Object.fromEntries(['save-form','session-name','tab-count','session-count','search','session-list','empty-state','notice','export-all','import-open','import-file'].map((id) => [id, document.getElementById(id)]));
let sessions = [];

function tell(message, error = false) {
  els.notice.textContent = message;
  els.notice.classList.toggle('error', error);
}

async function load() {
  const data = await chrome.storage.local.get(KEY);
  sessions = Array.isArray(data[KEY]) ? data[KEY].map((raw) => {
    try { return importSession(JSON.stringify(raw)); } catch { return null; }
  }).filter(Boolean).slice(0, 100) : [];
  render();
}

function formatDate(iso) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}

function domainsFor(session) {
  return [...new Set(session.windows.flatMap((win) => win.tabs.map((tab) => {
    try { return new URL(tab.url).hostname.replace(/^www\./, ''); } catch { return ''; }
  })).filter(Boolean))].slice(0, 4);
}

function render() {
  const query = els.search.value;
  const visible = sessions.filter((session) => session.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) || searchSession(session, query).length > 0);
  els['session-count'].textContent = `${sessions.length}`;
  els['session-list'].replaceChildren();
  els['empty-state'].hidden = visible.length > 0;
  for (const session of visible) {
    const total = session.windows.reduce((count, win) => count + win.tabs.length, 0);
    const card = document.createElement('article');
    card.className = 'session-card';
    const top = document.createElement('div');
    top.className = 'card-top';
    const title = document.createElement('strong');
    title.className = 'session-title';
    title.textContent = session.name;
    const date = document.createElement('span');
    date.className = 'session-date';
    date.textContent = formatDate(session.createdAt);
    top.append(title, date);
    const meta = document.createElement('div');
    meta.className = 'session-meta';
    meta.textContent = `${total} ${total === 1 ? 'tab' : 'tabs'} · ${session.windows.length} ${session.windows.length === 1 ? 'window' : 'windows'}`;
    const pills = document.createElement('div');
    pills.className = 'domain-list';
    for (const domain of domainsFor(session)) {
      const pill = document.createElement('span');
      pill.className = 'domain-pill';
      pill.textContent = domain;
      pills.append(pill);
    }
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const restore = actionButton('↗ Restore', 'restore', () => restoreSession(session));
    const exportButton = actionButton('↓ Export', '', () => download(session.name, exportSession(session)));
    const remove = actionButton('Remove', 'delete', () => removeSession(session));
    actions.append(restore, exportButton, remove);
    card.append(top, meta, pills, actions);
    els['session-list'].append(card);
  }
}

function actionButton(text, className, click) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  if (className) button.className = className;
  button.addEventListener('click', click);
  return button;
}

async function persist() {
  const bytes = new TextEncoder().encode(JSON.stringify(sessions)).byteLength;
  if (bytes > 8_000_000) throw new Error('Session library is near the browser’s local storage limit. Export selected sessions and remove old entries.');
  await chrome.storage.local.set({ [KEY]: sessions });
  render();
}

async function saveCurrent(event) {
  event.preventDefault();
  try {
    const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
    const tabs = windows.flatMap((win) => (win.tabs ?? []).map((tab) => ({ windowId: win.id, url: tab.url, title: tab.title, pinned: tab.pinned })));
    const name = sanitizeTitle(els['session-name'].value, 100) || `Workspace ${new Date().toLocaleString()}`;
    const session = buildSession({ name, tabs });
    const total = session.windows.reduce((count, win) => count + win.tabs.length, 0);
    if (!total) throw new Error('No regular web tabs to save.');
    if (sessions.length >= 100) sessions.pop();
    sessions.unshift(session);
    await persist();
    els['session-name'].value = '';
    tell(`Saved ${total} tabs across ${session.windows.length} windows.`);
  } catch (error) { tell(error.message || 'Could not save this session.', true); }
}

async function restoreSession(session) {
  const total = session.windows.reduce((count, win) => count + win.tabs.length, 0);
  if (!confirm(`Open ${total} tabs from “${session.name}” in ${session.windows.length} new browser window(s)?`)) return;
  try {
    for (const group of session.windows) {
      const urls = group.tabs.map((tab) => tab.url);
      if (!urls.length) continue;
      const win = await chrome.windows.create({ url: urls, focused: true });
      const created = win.tabs ?? [];
      await Promise.all(group.tabs.map((saved, index) => saved.pinned && created[index]?.id ? chrome.tabs.update(created[index].id, { pinned: true }) : Promise.resolve()));
    }
    tell(`Opened ${total} tabs from “${session.name}”.`);
  } catch (error) { tell(`Restore stopped: ${error.message || 'browser error'}`, true); }
}

async function removeSession(session) {
  if (!confirm(`Remove “${session.name}” from TabHarbor? This does not close any open tabs.`)) return;
  sessions = sessions.filter((item) => item !== session);
  await persist();
  tell('Session removed.');
}

function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportAll() {
  try {
    const content = JSON.stringify({ app: 'TabHarbor', version: 1, sessions }, null, 2);
    if (new TextEncoder().encode(content).byteLength > 2_000_000) throw new Error('Full library exceeds the 2 MB backup limit. Export large sessions one at a time.');
    download('tabharbor-sessions', content);
    tell(`Exported ${sessions.length} session(s).`);
  } catch (error) { tell(error.message, true); }
}

async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Import file exceeds 2 MB.');
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incoming = Array.isArray(parsed) ? parsed : parsed?.app === 'TabHarbor' && parsed.version === 1 ? parsed.sessions : [parsed];
    if (!Array.isArray(incoming) || incoming.length > 100) throw new Error('Import must contain at most 100 sessions.');
    const valid = incoming.map((session) => importSession(JSON.stringify(session)));
    const byKey = new Map([...sessions, ...valid].map((session) => [`${session.name}\n${session.createdAt}`, session]));
    sessions = [...byKey.values()].slice(0, 100);
    await persist();
    tell(`Imported ${valid.length} session(s).`);
  } catch (error) { tell(`Import failed: ${error.message || 'invalid file'}`, true); }
  finally { els['import-file'].value = ''; }
}

els['save-form'].addEventListener('submit', saveCurrent);
els.search.addEventListener('input', render);
els['export-all'].addEventListener('click', exportAll);
els['import-open'].addEventListener('click', () => els['import-file'].click());
els['import-file'].addEventListener('change', () => importFile(els['import-file'].files?.[0]));
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.search.focus();
  }
});

try {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  els['tab-count'].textContent = `${tabs.filter((tab) => /^https?:/i.test(tab.url ?? '')).length} tabs`;
  await load();
} catch (error) { tell(error.message || 'Could not load local sessions.', true); }
