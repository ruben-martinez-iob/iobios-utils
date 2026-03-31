'use strict';

(function () {

  window.__iobios = window.__iobios || {};

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

  function appSheetSettings() {
    return JSON.stringify({
      _RowNumber: '0', _EMAIL: '', _NAME: '', _LOCATION: '',
      'Options Heading': '', 'Option 1': '', 'Option 2': '',
      'Country Option': '', 'Language Option': '',
      'Option 5': '', 'Option 6': '', 'Option 7': '', 'Option 8': '', 'Option 9': '',
      _THISUSER: 'onlyvalue',
    });
  }

  Object.assign(window.__iobios, {
    openDb, findAppDb, getKey, decompressZlib, readChunks,
    parseAppSheetDate, formatDate, normalizeHours, randomUuid,
    getCurrentUserEmail, appSheetSettings,
  });

})();
