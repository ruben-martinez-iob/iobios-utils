'use strict';

(function () {

  const APP_ID = '60020789-6a4e-43a6-8079-8487a74b56a3';

  let _timesheetsCache = null;
  let _syncToken = null;
  let _clientId  = null;

  // ── Parsers ──────────────────────────────────────────────────────────────

  function parseTimesheetRow(raw) {
    return {
      rowNum: parseInt(raw['0'], 10) || 0,
      id: raw['1'],
      employeeId: raw['2'],
      email: raw['3'],
      date: window.__iobios.parseAppSheetDate(raw['4']),
      clockIn1: raw['5'],
      clockOut1: raw['6'],
      clockIn2: raw['7'],
      clockOut2: raw['8'],
      _raw: raw,
    };
  }

  function calcTotalHours(p1, p2) {
    function toMinutes(t) {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    }
    const mins = (toMinutes(p1.clockOut) - toMinutes(p1.clockIn))
               + (toMinutes(p2.clockOut) - toMinutes(p2.clockIn));
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    return `${hh}:${mm}:00`;
  }

  // ── IndexedDB direct write helpers ──────────────────────────────────────

  async function compressZlib(str) {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(str));
    writer.close();
    return await new Response(cs.readable).arrayBuffer();
  }

  function putKey(db, key, value) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction('keyvaluepairs', 'readwrite');
      const req = tx.objectStore('keyvaluepairs').put(value, key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  // Mark the timesheet row as deleted directly in the local IndexedDB chunk
  async function softDeleteInDb(timesheet) {
    try {
      const dbName = await window.__iobios.findAppDb(APP_ID);
      if (!dbName) return false;
      const db = await window.__iobios.openDb(dbName);

      let i = 0;
      while (true) {
        const raw = await window.__iobios.getKey(db, `Timesheet~#${i}`);
        if (!raw || !raw.data) break;

        const rows = JSON.parse(await window.__iobios.decompressZlib(raw.data));
        const idx  = rows.findIndex(r =>
          r['1'] === timesheet.id || r['0'] === String(timesheet.rowNum)
        );

        if (idx !== -1) {
          rows[idx]['11'] = 'Y';
          const compressed = await compressZlib(JSON.stringify(rows));
          await putKey(db, `Timesheet~#${i}`, { ...raw, data: compressed });
          console.log('[ioBios] softDeleteInDb: patched chunk', i, 'row', idx);
          return true;
        }
        i++;
      }
      console.warn('[ioBios] softDeleteInDb: row not found');
      return false;
    } catch (e) {
      console.warn('[ioBios] softDeleteInDb error:', e);
      return false;
    }
  }

  // ── AppSheet sync (get syncToken + fresh data) ───────────────────────────

  async function ensureSession() {
    if (_syncToken) return;
    try {
      _clientId = _clientId || window.__iobios.randomUuid();
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
      console.log('[ioBios] ensureSession response keys:', Object.keys(data));
      const token = data.syncToken || data.SyncToken;
      if (token) {
        _syncToken = token;
        console.log('[ioBios] syncToken obtained');
      } else {
        console.warn('[ioBios] no syncToken in sync response:', JSON.stringify(data).slice(0, 300));
      }
    } catch (e) {
      console.warn('[ioBios] ensureSession error:', e);
    }
  }

  // ── Public operations ────────────────────────────────────────────────────

  async function getTimesheets(opts = {}) {
    if (!_timesheetsCache) {
      try {
        const dbName = await window.__iobios.findAppDb(APP_ID);
        if (!dbName) { _timesheetsCache = []; return []; }
        const db    = await window.__iobios.openDb(dbName);
        const email = window.__iobios.getCurrentUserEmail();
        const rows  = await window.__iobios.readChunks(db, 'Timesheet');
        _timesheetsCache = rows
          .filter(r => r['1'] && r['4'] && r['11'] !== 'Y' && (!email || r['3'] === email))
          .map(parseTimesheetRow);
      } catch (e) {
        console.warn('[ioBios] timesheets-db getTimesheets error:', e);
        _timesheetsCache = [];
      }
    }

    let result = _timesheetsCache;
    if (opts.dateFrom) {
      const from = opts.dateFrom.getTime();
      result = result.filter(t => t.date.getTime() >= from);
    }
    if (opts.dateTo) {
      const to = opts.dateTo.getTime();
      result = result.filter(t => t.date.getTime() <= to);
    }
    return result;
  }

  async function createTimesheet(date, period1, period2) {
    const existing = await getTimesheets();
    const dateStr   = window.__iobios.formatDate(date);
    const duplicate = existing.find(t => window.__iobios.formatDate(t.date) === dateStr);
    if (duplicate) return { ok: false, error: 'duplicate' };

    try {
      const cache      = _timesheetsCache || [];
      const sample     = cache[0] || {};
      const employeeId = sample.employeeId || '';
      const email      = sample.email || '';
      const nextRowNum = cache.length > 0
        ? String(Math.max(...cache.map(t => t.rowNum)) + 1) : '1';
      const totalHours = calcTotalHours(period1, period2);

      const row = [
        nextRowNum, window.__iobios.randomUuid(), employeeId, email, dateStr,
        window.__iobios.normalizeHours(period1.clockIn),
        window.__iobios.normalizeHours(period1.clockOut),
        window.__iobios.normalizeHours(period2.clockIn),
        window.__iobios.normalizeHours(period2.clockOut),
        totalHours, '', 'N', '', '', 'N',
      ];
      const pii = row.map((_, i) => i === 3);

      const session = window.__iobios.getSession();
      if (!session.syncToken) await ensureSession();
      const syncToken    = session.syncToken || _syncToken;
      const clientId     = session.clientId  || _clientId;
      const localVersion = session.localVersion;
      console.log('[ioBios] session at createTimesheet:', { syncToken: !!syncToken, clientId: !!clientId });
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

      const url = `https://www.appsheet.com/api/template/${APP_ID}/table/Timesheet/row?${params}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ row, pii }),
      });

      const responseText = await res.text().catch(() => res.statusText);
      console.log('[ioBios] createTimesheet response:', res.status, responseText);

      if (!res.ok) return { ok: false, error: responseText };

      _timesheetsCache = null;
      return { ok: true };
    } catch (e) {
      console.warn('[ioBios] timesheets-db createTimesheet error:', e);
      return { ok: false, error: e.message };
    }
  }

  async function deleteTimesheet(timesheet) {
    try {
      const session = window.__iobios.getSession();
      if (!session.syncToken) await ensureSession();
      const syncToken    = session.syncToken || _syncToken;
      const clientId     = session.clientId  || _clientId;
      const localVersion = session.localVersion;

      // AppSheet uses soft-delete: mark column 11 as 'Y' via /row/update
      const r = timesheet._raw;
      const now = new Date();
      const deletedAt = `${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${now.getFullYear()} ` +
        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

      // Build full row from _raw (preserving all columns) then apply soft-delete fields
      const numericKeys = Object.keys(r).map(Number).filter(n => !isNaN(n));
      const maxKey = numericKeys.length > 0 ? Math.max(...numericKeys) : 14;
      const row = Array.from({ length: maxKey + 1 }, (_, i) => r[String(i)] ?? '');
      row[11] = 'Y';
      row[12] = deletedAt;
      row[13] = r['3'] || '';
      const pii = row.map((_, i) => i === 3);

      const nowIso = now.toISOString();
      const params = new URLSearchParams({
        tzOffset: String(new Date().getTimezoneOffset()),
        settings: window.__iobios.appSheetSettings(),
        apiLevel: '2', isPreview: 'false', checkCache: 'true',
        locale: 'en-US', location: 'null, null',
        ...(localVersion ? { appTemplateVersion: localVersion, localVersion } : {}),
        timestamp: nowIso, requestStartTime: nowIso,
        ...(clientId  ? { clientId }  : {}),
        ...(syncToken ? { syncToken } : {}),
      });

      const url = `https://www.appsheet.com/api/template/${APP_ID}/table/Timesheet/row/update?${params}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ row, pii }),
      });

      const responseText = await res.text().catch(() => res.statusText);
      console.log('[ioBios] deleteTimesheet response:', res.status, responseText);

      if (!res.ok) return { ok: false, error: responseText };

      // Patch the local IndexedDB chunk directly (API update may not persist immediately)
      await softDeleteInDb(timesheet);

      // Remove from in-memory cache so it disappears immediately
      if (_timesheetsCache) {
        _timesheetsCache = _timesheetsCache.filter(t => t.id !== timesheet.id);
      }
      return { ok: true };
    } catch (e) {
      console.warn('[ioBios] timesheets-db deleteTimesheet error:', e);
      return { ok: false, error: e.message };
    }
  }

  // Update timesheet row columns 5-9 directly in the local IndexedDB chunk
  async function updateTimesheetInDb(timesheet, newTimes) {
    try {
      const dbName = await window.__iobios.findAppDb(APP_ID);
      if (!dbName) return false;
      const db = await window.__iobios.openDb(dbName);

      function normalizeHours(h) { return h.length === 5 ? h + ':00' : h; }

      let i = 0;
      while (true) {
        const raw = await window.__iobios.getKey(db, `Timesheet~#${i}`);
        if (!raw || !raw.data) break;

        const rows = JSON.parse(await window.__iobios.decompressZlib(raw.data));
        const idx  = rows.findIndex(r =>
          r['1'] === timesheet.id || r['0'] === String(timesheet.rowNum)
        );

        if (idx !== -1) {
          rows[idx]['5'] = normalizeHours(newTimes.clockIn1);
          rows[idx]['6'] = normalizeHours(newTimes.clockOut1);
          rows[idx]['7'] = normalizeHours(newTimes.clockIn2);
          rows[idx]['8'] = normalizeHours(newTimes.clockOut2);
          rows[idx]['9'] = calcTotalHours(
            { clockIn: newTimes.clockIn1, clockOut: newTimes.clockOut1 },
            { clockIn: newTimes.clockIn2, clockOut: newTimes.clockOut2 }
          );
          const compressed = await compressZlib(JSON.stringify(rows));
          await putKey(db, `Timesheet~#${i}`, { ...raw, data: compressed });
          console.log('[ioBios] updateTimesheetInDb: patched chunk', i, 'row', idx);
          return true;
        }
        i++;
      }
      console.warn('[ioBios] updateTimesheetInDb: row not found');
      return false;
    } catch (e) {
      console.warn('[ioBios] updateTimesheetInDb error:', e);
      return false;
    }
  }

  async function updateTimesheet(timesheet, newTimes) {
    // newTimes = { clockIn1, clockOut1, clockIn2, clockOut2 }
    try {
      const session = window.__iobios.getSession();
      if (!session.syncToken) await ensureSession();
      const syncToken    = session.syncToken || _syncToken;
      const clientId     = session.clientId  || _clientId;
      const localVersion = session.localVersion;

      function normalizeHours(h) { return h.length === 5 ? h + ':00' : h; }

      const r = timesheet._raw;
      const numericKeys = Object.keys(r).map(Number).filter(n => !isNaN(n));
      const maxKey = numericKeys.length > 0 ? Math.max(...numericKeys) : 14;
      const row = Array.from({ length: maxKey + 1 }, (_, i) => r[String(i)] ?? '');
      row[5] = normalizeHours(newTimes.clockIn1);
      row[6] = normalizeHours(newTimes.clockOut1);
      row[7] = normalizeHours(newTimes.clockIn2);
      row[8] = normalizeHours(newTimes.clockOut2);
      row[9] = calcTotalHours(
        { clockIn: newTimes.clockIn1, clockOut: newTimes.clockOut1 },
        { clockIn: newTimes.clockIn2, clockOut: newTimes.clockOut2 }
      );
      const pii = row.map((_, i) => i === 3);

      const nowIso = new Date().toISOString();
      const params = new URLSearchParams({
        tzOffset: String(new Date().getTimezoneOffset()),
        settings: window.__iobios.appSheetSettings(),
        apiLevel: '2', isPreview: 'false', checkCache: 'true',
        locale: 'en-US', location: 'null, null',
        ...(localVersion ? { appTemplateVersion: localVersion, localVersion } : {}),
        timestamp: nowIso, requestStartTime: nowIso,
        ...(clientId  ? { clientId }  : {}),
        ...(syncToken ? { syncToken } : {}),
      });

      const url = `https://www.appsheet.com/api/template/${APP_ID}/table/Timesheet/row/update?${params}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ row, pii }),
      });

      const responseText = await res.text().catch(() => res.statusText);
      console.log('[ioBios] updateTimesheet response:', res.status, responseText);

      if (!res.ok) return { ok: false, error: responseText };

      // Patch the local IndexedDB chunk
      await updateTimesheetInDb(timesheet, newTimes);

      // Update in-memory cache
      if (_timesheetsCache) {
        const cached = _timesheetsCache.find(t => t.id === timesheet.id);
        if (cached) {
          cached.clockIn1  = newTimes.clockIn1;
          cached.clockOut1 = newTimes.clockOut1;
          cached.clockIn2  = newTimes.clockIn2;
          cached.clockOut2 = newTimes.clockOut2;
        }
      }

      return { ok: true };
    } catch (e) {
      console.warn('[ioBios] timesheets-db updateTimesheet error:', e);
      return { ok: false, error: e.message };
    }
  }

  function clearCache() { _timesheetsCache = null; }

  // ── Expose ───────────────────────────────────────────────────────────────

  window.__iobios = window.__iobios || {};
  window.__iobios.timeSheetsDb = { getTimesheets, createTimesheet, deleteTimesheet, updateTimesheet, clearCache };

})();
