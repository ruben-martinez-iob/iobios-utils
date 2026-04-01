'use strict';

(function () {

  const APP_ID = '6f5178ea-4877-4f23-9749-721b993b406a';

  let _allocationsCache = null;
  let _projectsCache = null;

  let _syncToken     = null;
  let _clientId      = null;
  let _localVersion  = null;

  async function ensureSession() {
    if (_syncToken) return;
    try {
      _clientId = _clientId || localStorage.getItem('JeeneeClient') || window.__iobios.randomUuid();
      const body = {
        settings: window.__iobios.appSheetSettings(),
        getAllTables: false, syncsOnConsent: false,
        syncUI: 'Subtle', initiatedBy: 'Refresh', isPreview: false,
        apiLevel: 2, tzOffset: new Date().getTimezoneOffset(),
        locale: 'en-US', timestamp: new Date().toISOString(), clientId: _clientId,
      };
      const res = await fetch(`https://www.appsheet.com/api/template/${APP_ID}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const token = data.syncToken || data.SyncToken;
      if (token) {
        _syncToken = token;
        _localVersion = _localVersion
          || data.localVersion || data.LocalVersion
          || data.appTemplateVersion || data.AppTemplateVersion
          || null;
        console.log('[ioBios] timeallocations-db syncToken obtained, localVersion:', _localVersion);
      }
    } catch (e) {
      console.warn('[ioBios] timeallocations-db ensureSession error:', e);
    }
  }

  // ── Parsers ──────────────────────────────────────────────────────────────

  function parseAllocationRow(raw) {
    return {
      rowNum: parseInt(raw['0'], 10) || 0,
      id: raw['1'],
      email: raw['2'],
      date: window.__iobios.parseAppSheetDate(raw['3']),
      project: raw['4'],
      hours: raw['5'],
      compositeKey: raw['6'],
      _raw: raw,
    };
  }

  function parseProjectRow(raw) {
    return {
      id: raw['1'],
      name: raw['2'],
      client: raw['3'],
      status: raw['4'],
    };
  }

  // ── Public operations ────────────────────────────────────────────────────

  async function getAllocations(opts = {}) {
    if (!_allocationsCache) {
      try {
        const dbName = await window.__iobios.findAppDb(APP_ID);
        if (!dbName) {
          _allocationsCache = [];
          return [];
        }
        const db = await window.__iobios.openDb(dbName);
        const email = window.__iobios.getCurrentUserEmail();
        const rows = await window.__iobios.readChunks(db, 'Time Allocations');
        _allocationsCache = rows
          .filter(r => r['1'] && r['3'] && r['7'] !== 'Y' && (!email || r['2'] === email))
          .map(parseAllocationRow);
      } catch (e) {
        console.warn('[ioBios] timeallocations-db getAllocations error:', e);
        _allocationsCache = [];
      }
    }

    let result = _allocationsCache;

    if (opts.dateFrom) {
      const from = opts.dateFrom.getTime();
      result = result.filter(a => a.date.getTime() >= from);
    }
    if (opts.dateTo) {
      const to = opts.dateTo.getTime();
      result = result.filter(a => a.date.getTime() <= to);
    }

    return result;
  }

  async function getProjects(opts = { onlyActive: true }) {
    if (!_projectsCache) {
      try {
        const dbName = await window.__iobios.findAppDb(APP_ID);
        if (!dbName) {
          _projectsCache = [];
          return [];
        }
        const db = await window.__iobios.openDb(dbName);
        const rows = await window.__iobios.readChunks(db, 'Projects');
        _projectsCache = rows
          .filter(r => r['1'] && r['2'])
          .map(parseProjectRow);
      } catch (e) {
        console.warn('[ioBios] timeallocations-db getProjects error:', e);
        _projectsCache = [];
      }
    }

    if (opts.onlyActive !== false) {
      return _projectsCache.filter(p => p.status === 'Activo');
    }
    return _projectsCache;
  }

  async function createAllocation(date, project, hours) {
    const existing = await getAllocations();
    const dateStr = window.__iobios.formatDate(date);
    const [m, d, y] = dateStr.split('/');
    const isoDate = `${y}-${m}-${d}`;

    const duplicate = existing.find(a =>
      a.compositeKey && a.compositeKey.includes(`|${isoDate}|${project}`)
    );
    if (duplicate) return { ok: false, error: 'duplicate' };

    try {
      const cache = _allocationsCache || [];
      const sample = existing[0] || {};
      const email = sample.email || '';
      const compositeKey = `${email}|${isoDate}|${project}`;
      const nextRowNum = cache.length > 0
        ? String(Math.max(...cache.map(a => a.rowNum)) + 1)
        : '1';
      const hexId = window.__iobios.randomUuid();

      const row = [nextRowNum, hexId, email, dateStr, project, window.__iobios.normalizeHours(hours), compositeKey];
      const pii = [false, false, false, true, false, false, false];

      const session = window.__iobios.getSession();
      if (!session.syncToken) await ensureSession();
      const syncToken = session.syncToken || _syncToken;
      const clientId  = session.clientId  || _clientId;
      const localVersion = _localVersion;
      const now = new Date().toISOString();
      const params = new URLSearchParams({
        tzOffset: String(new Date().getTimezoneOffset()),
        settings: window.__iobios.appSheetSettings(),
        apiLevel: '2', isPreview: 'false', checkCache: 'true',
        locale: 'en-US', location: 'null, null',
        ...(localVersion ? { appTemplateVersion: localVersion, localVersion } : {}),
        timestamp: now, requestStartTime: now,
        ...(clientId  ? { clientId }  : {}),
        ...(syncToken ? { syncToken } : {}),
      });

      const url = `https://www.appsheet.com/api/template/${APP_ID}/table/Time%20Allocations/row?${params}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ row, pii }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        console.warn('[ioBios] createAllocation response error:', res.status, text);
        return { ok: false, error: text };
      }

      _allocationsCache = null;
      return { ok: true };
    } catch (e) {
      console.warn('[ioBios] timeallocations-db createAllocation error:', e);
      return { ok: false, error: e.message };
    }
  }

  async function deleteAllocation(allocation) {
    try {
      const dbName = await window.__iobios.findAppDb(APP_ID);
      let syncToken = null, localVersion = null;
      if (dbName) {
        const db = await window.__iobios.openDb(dbName);
        syncToken = await window.__iobios.getKey(db, 'SyncToken');
        if (syncToken) {
          try {
            const payload = JSON.parse(atob(syncToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            localVersion = payload.appVersion || null;
          } catch (_) {}
        }
      }
      if (!syncToken) {
        if (!_syncToken) await ensureSession();
        syncToken = _syncToken;
      }
      const clientId = localStorage.getItem('JeeneeClient') || _clientId;

      const r = allocation._raw;
      const row = [r['0'], r['1'], r['2'], r['3'], r['4'], r['5'], r['6']];
      const pii = [false, false, true, false, false, false, false];

      const now = new Date().toISOString();
      const params = new URLSearchParams({
        tzOffset: String(new Date().getTimezoneOffset()),
        settings: window.__iobios.appSheetSettings(),
        apiLevel: '2', isPreview: 'false', checkCache: 'true',
        locale: 'en-US', location: 'null, null',
        ...(localVersion ? { appTemplateVersion: localVersion, localVersion } : {}),
        timestamp: now, requestStartTime: now,
        ...(clientId  ? { clientId }  : {}),
        ...(syncToken ? { syncToken } : {}),
      });

      const url = `https://www.appsheet.com/api/template/${APP_ID}/table/Time%20Allocations/row/delete?${params}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ row, pii }),
      });

      const responseText = await res.text().catch(() => res.statusText);
      console.log('[ioBios] deleteAllocation response:', res.status, responseText);

      if (!res.ok) return { ok: false, error: responseText };
      const data = JSON.parse(responseText);
      if (!data.Success) return { ok: false, error: data.ErrorDescription };

      _allocationsCache = null;
      return { ok: true };
    } catch (e) {
      console.warn('[ioBios] timeallocations-db deleteAllocation error:', e);
      return { ok: false, error: e.message };
    }
  }

  async function updateAllocationInDb(allocation, newHours) {
    try {
      const dbName = await window.__iobios.findAppDb(APP_ID);
      if (!dbName) return false;
      const db = await window.__iobios.openDb(dbName);

      let i = 0;
      while (true) {
        const raw = await window.__iobios.getKey(db, `Time Allocations~#${i}`);
        if (!raw || !raw.data) break;

        const rows = JSON.parse(await window.__iobios.decompressZlib(raw.data));
        const idx  = rows.findIndex(r =>
          r['1'] === allocation.id || r['0'] === String(allocation.rowNum)
        );

        if (idx !== -1) {
          rows[idx]['5'] = window.__iobios.hoursToHHMMSS(newHours);
          const compressed = await window.__iobios.compressZlib(JSON.stringify(rows));
          await window.__iobios.putKey(db, `Time Allocations~#${i}`, { ...raw, data: compressed });
          console.log('[ioBios] updateAllocationInDb: patched chunk', i, 'row', idx);
          return true;
        }
        i++;
      }
      console.warn('[ioBios] updateAllocationInDb: row not found');
      return false;
    } catch (e) {
      console.warn('[ioBios] updateAllocationInDb error:', e);
      return false;
    }
  }

  async function updateAllocation(allocation, newHours) {
    try {
      const dbName = await window.__iobios.findAppDb(APP_ID);
      let syncToken = null, localVersion = null;
      if (dbName) {
        const db = await window.__iobios.openDb(dbName);
        syncToken = await window.__iobios.getKey(db, 'SyncToken');
        if (syncToken) {
          try {
            const payload = JSON.parse(atob(syncToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            localVersion = payload.appVersion || null;
          } catch (_) {}
        }
      }
      if (!syncToken) {
        if (!_syncToken) await ensureSession();
        syncToken = _syncToken;
      }
      const clientId = localStorage.getItem('JeeneeClient') || _clientId;

      const r = allocation._raw;
      const row = [r['0'], r['1'], r['2'], r['3'], r['4'], window.__iobios.hoursToHHMMSS(newHours), r['6']];
      const pii = [false, false, true, false, false, false, false];

      const now = new Date().toISOString();
      const params = new URLSearchParams({
        tzOffset: String(new Date().getTimezoneOffset()),
        settings: window.__iobios.appSheetSettings(),
        apiLevel: '2', isPreview: 'false', checkCache: 'true',
        locale: 'en-US', location: 'null, null',
        ...(localVersion ? { appTemplateVersion: localVersion, localVersion } : {}),
        timestamp: now, requestStartTime: now,
        ...(clientId  ? { clientId }  : {}),
        ...(syncToken ? { syncToken } : {}),
      });

      const url = `https://www.appsheet.com/api/template/${APP_ID}/table/Time%20Allocations/row/update?${params}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ row, pii }),
      });

      const responseText = await res.text().catch(() => res.statusText);
      console.log('[ioBios] updateAllocation response:', res.status, responseText);

      if (!res.ok) return { ok: false, error: responseText };
      const data = JSON.parse(responseText);
      if (!data.Success) return { ok: false, error: data.ErrorDescription };

      // Patch local IndexedDB
      await updateAllocationInDb(allocation, newHours);

      // Update in-memory cache
      if (_allocationsCache) {
        const cached = _allocationsCache.find(a => a.id === allocation.id);
        if (cached) cached.hours = window.__iobios.hoursToHHMMSS(newHours);
      }

      return { ok: true };
    } catch (e) {
      console.warn('[ioBios] timeallocations-db updateAllocation error:', e);
      return { ok: false, error: e.message };
    }
  }

  // ── Expose ───────────────────────────────────────────────────────────────

  window.__iobios = window.__iobios || {};
  function clearCache() { _allocationsCache = null; }

  window.__iobios.timeAllocationsDb = { getAllocations, getProjects, createAllocation, deleteAllocation, updateAllocation, clearCache };

})();
