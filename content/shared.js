'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // ── AppSheet session (syncToken + clientId captured from MAIN world) ────────

  const _session = { syncToken: null, clientId: null, localVersion: null };

  // Log interesting localStorage values for diagnosis
  try {
    const interesting = ['JeeneeClient', 'JeeneeNameGuidMap', 'JeeneeUserInfo',
      'launch_background_60020789-6a4e-43a6-8079-8487a74b56a3'];
    interesting.forEach(k => {
      const v = localStorage.getItem(k);
      if (v) console.log(`[ioBios] localStorage[${k}]:`, v.slice(0, 200));
    });
  } catch (e) {}

  document.addEventListener('__iobios_session', (e) => {
    if (e.detail.syncToken) _session.syncToken = e.detail.syncToken;
    if (e.detail.clientId) _session.clientId = e.detail.clientId;
    if (e.detail.localVersion) _session.localVersion = e.detail.localVersion;
  });

  // ── Config ─────────────────────────────────────────────────────────────────

  function getConfig() {
    return new Promise((resolve) =>
      chrome.storage.sync.get({
        enabled: true,
        timeAllocations: [{ project: 'ATS/SCS Roadmap Acceleration', hours: 8 }],
        rules: { skipWeekends: true, skipHolidays: false, skipVacations: false, maxHoursPerDay: 8 },
        timeSheets: {
          period1: { clockIn: '09:00', clockOut: '14:00' },
          period2: { clockIn: '14:30', clockOut: '17:30' },
        },
      }, resolve)
    );
  }

  // ── Date utilities ─────────────────────────────────────────────────────────

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromDateInput(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDayLabel(date) {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${days[date.getDay()]} ${d}/${m}/${date.getFullYear()}`;
  }

  function hoursToHHMMSS(h) {
    const total = Math.round(h * 3600);
    const hh = String(Math.floor(total / 3600)).padStart(2, '0');
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    return `${hh}:${mm}:00`;
  }

  function defaultDateRange() {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  async function buildDateRange(dateFrom, dateTo, rules) {
    const holidays = rules.skipHolidays ? await window.__iobios.getHolidays() : [];
    const holidaySet = new Set(holidays.map(h => h.date.toDateString()));
    const dates = [];
    const cur = new Date(dateFrom);
    while (cur <= dateTo) {
      const dow = cur.getDay();
      const isWeekend = dow === 0 || dow === 6;
      if ((!rules.skipWeekends || !isWeekend) && !holidaySet.has(cur.toDateString())) {
        dates.push(new Date(cur));
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  // ── AppSheet / IndexedDB shared utilities ──────────────────────────────────

  function openDb(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function findAppDb(appId) {
    return indexedDB.databases().then(dbs => {
      const match = dbs.find(db => db.name && db.name.startsWith(appId + '||'));
      return match ? match.name : null;
    });
  }

  function getKey(db, key) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('keyvaluepairs', 'readonly');
      const req = tx.objectStore('keyvaluepairs').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function decompressZlib(arrayBuffer) {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(arrayBuffer));
    writer.close();
    const out = await new Response(ds.readable).arrayBuffer();
    return new TextDecoder().decode(out);
  }

  async function readChunks(db, tableName) {
    const rows = [];
    let i = 0;
    while (true) {
      const raw = await getKey(db, `${tableName}~#${i}`);
      if (!raw || !raw.data) break;
      rows.push(...JSON.parse(await decompressZlib(raw.data)));
      i++;
    }
    return rows;
  }

  function parseAppSheetDate(str) {
    const [m, d, y] = str.split('/').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDate(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${m}/${d}/${date.getFullYear()}`;
  }

  function normalizeHours(h) {
    return h.length === 5 ? h + ':00' : h;
  }

  function randomUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getCurrentUserEmail() {
    try {
      const info = JSON.parse(localStorage.getItem('JeeneeUserInfo') || '{}');
      return (info.UserInfo && info.UserInfo.AuthUserEmail) || '';
    } catch (_) { return ''; }
  }

  // The settings JSON required by every AppSheet API call
  function appSheetSettings() {
    return JSON.stringify({
      _RowNumber: '0', _EMAIL: '', _NAME: '', _LOCATION: '',
      'Options Heading': '', 'Option 1': '', 'Option 2': '',
      'Country Option': '', 'Language Option': '',
      'Option 5': '', 'Option 6': '', 'Option 7': '', 'Option 8': '', 'Option 9': '',
      _THISUSER: 'onlyvalue',
    });
  }

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(message, type) {
    let toast = document.getElementById('iobios-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'iobios-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `iobios-toast-${type}`;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  let _currentSaveFn = null;

  function createPanel() {
    if (document.getElementById('iobios-panel')) return;

    const overlay = document.createElement('div');
    overlay.id = 'iobios-overlay';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'iobios-panel';
    panel.innerHTML = `
      <div id="iobios-panel-header">
        <button id="iobios-panel-close" aria-label="Close">✕</button>
        <div id="iobios-panel-title"></div>
        <div id="iobios-panel-actions">
          <button id="iobios-panel-cancel">Cancel</button>
          <button id="iobios-panel-save">Save</button>
        </div>
      </div>
      <div id="iobios-panel-body"></div>
    `;
    document.body.appendChild(panel);

    document.getElementById('iobios-panel-close').addEventListener('click', closePanel);
    document.getElementById('iobios-panel-cancel').addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    document.getElementById('iobios-panel-save').addEventListener('click', () => {
      if (_currentSaveFn) _currentSaveFn();
    });
  }

  function openPanel(title, renderFn, saveFn) {
    document.getElementById('iobios-panel-title').textContent = title;
    const body = document.getElementById('iobios-panel-body');
    body.innerHTML = '';
    _currentSaveFn = saveFn;
    const saveBtn = document.getElementById('iobios-panel-save');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    if (renderFn) renderFn(body);
    document.getElementById('iobios-overlay').classList.add('open');
    document.getElementById('iobios-panel').classList.add('open');
  }

  function closePanel() {
    document.getElementById('iobios-overlay').classList.remove('open');
    document.getElementById('iobios-panel').classList.remove('open');
    _currentSaveFn = null;
  }

  // ── Expose ─────────────────────────────────────────────────────────────────

  Object.assign(window.__iobios, {
    getSession: () => _session,
    getConfig,
    toDateInputValue, fromDateInput, formatDayLabel, hoursToHHMMSS,
    defaultDateRange, buildDateRange,
    showToast,
    createPanel, openPanel, closePanel,
    // DB utilities
    openDb, findAppDb, getKey, decompressZlib, readChunks,
    parseAppSheetDate, formatDate, normalizeHours, randomUuid,
    getCurrentUserEmail, appSheetSettings,
  });

})();
