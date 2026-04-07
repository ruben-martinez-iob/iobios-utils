'use strict';

(function () {

  const TIMESHEET_APP_ID = '60020789-6a4e-43a6-8079-8487a74b56a3';
  const ABSENCES_APP_ID  = '3857d717-2030-4b76-94fa-1acc0805ea88';

  let _holidaysCache     = null;
  let _vacationsCache    = null;
  let _leavesCache       = null;
  // null = not yet fetched; array = cached result (may be empty)
  // Use a separate flag so we can distinguish "empty because DB not found" (don't cache)
  // from "empty because no matching rows" (cache it).
  let _absenceRowsCache  = null;
  let _absenceRowsReady  = false;   // true only when rows were successfully read from DB

  // Flexible date regex: accepts M/D/YYYY or MM/DD/YYYY
  const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

  // ── Internal: read all rows from the absences table ─────────────────────

  async function _getAbsenceRows() {
    if (_absenceRowsReady) return _absenceRowsCache;
    try {
      const dbName = await window.__iobios.findAppDb(ABSENCES_APP_ID);
      if (!dbName) {
        console.warn('[ioBios] absences-db: Absences app DB not found — open the Absences app first');
        return [];   // do NOT cache — retry on next call
      }
      const db = await window.__iobios.openDb(dbName);

      const keys = await new Promise((res, rej) => {
        const tx = db.transaction('keyvaluepairs', 'readonly');
        const req = tx.objectStore('keyvaluepairs').getAllKeys();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });

      const chunkKey = keys.find(k => typeof k === 'string' && k.endsWith('~#0') &&
        !['Bank Holidays', 'Employees', 'Timesheet', 'Time Allocations', 'Projects',
          '_Per User Settings', 'AppGalleryTable'].some(t => k.startsWith(t)));
      if (!chunkKey) {
        console.warn('[ioBios] absences-db: no absences table found in keys:', keys);
        return [];   // do NOT cache — retry on next call
      }
      const tableName = chunkKey.replace('~#0', '');
      console.log('[ioBios] absences-db: using table', tableName);
      _absenceRowsCache = await window.__iobios.readChunks(db, tableName);
      _absenceRowsReady = true;
    } catch (e) {
      console.warn('[ioBios] absences-db _getAbsenceRows error:', e);
      return [];   // do NOT cache on error — retry on next call
    }
    return _absenceRowsCache;
  }

  // ── Internal: get holidays from database only ────────────────────────

  async function getDbHolidays() {
    if (_holidaysCache !== null) return _holidaysCache;
    try {
      const dbName = await window.__iobios.findAppDb(TIMESHEET_APP_ID);
      if (!dbName) { return []; }   // do NOT cache — retry on next call
      const db = await window.__iobios.openDb(dbName);
      const rows = await window.__iobios.readChunks(db, 'Bank Holidays');
      _holidaysCache = rows
        .filter(r => r['2'] && r['3'])
        .map(r => ({ date: window.__iobios.parseAppSheetDate(r['2']), name: r['3'] }));
    } catch (e) {
      console.warn('[ioBios] absences-db getDbHolidays error:', e);
      return [];   // do NOT cache on error
    }
    return _holidaysCache;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  async function getHolidays(config = null) {
    // Get holidays from database
    const dbHolidays = await getDbHolidays();
    
    // If config provided, add custom holidays
    if (config && config.holidays) {
      const customHolidays = [];
      for (const [year, entries] of Object.entries(config.holidays)) {
        for (const entry of entries) {
          const dateStr = typeof entry === 'string' ? entry : entry.date;
          const name = typeof entry === 'string' ? '' : (entry.name || '');
          if (dateStr) {
            const d = new Date(dateStr + 'T00:00:00');
            if (!isNaN(d)) {
              customHolidays.push({ date: d, name });
            }
          }
        }
      }
      return [...dbHolidays, ...customHolidays];
    }
    
    return dbHolidays;
  }

  // Returns approved Holiday-type absences (vacations) for the given email.
  async function getApprovedVacations(email) {
    if (_vacationsCache && _vacationsCache.email === email) return _vacationsCache.dates;
    try {
      const rows = await _getAbsenceRows();
      const dates = [];
      for (const row of rows) {
        const values = Object.values(row);
        const rowEmail = values.find(v => typeof v === 'string' && v.includes('@'));
        if (email && rowEmail !== email) continue;
        const hasApproved = values.some(v => typeof v === 'string' && /approved/i.test(v));
        if (!hasApproved) continue;
        // Must be Holiday type (not Leave) — AppSheet stores "Holidays" (plural)
        const hasHoliday = values.some(v => typeof v === 'string' && /holiday/i.test(v) && !/leave/i.test(v));
        if (!hasHoliday) continue;

        const dateFields = values.filter(v => typeof v === 'string' && DATE_RE.test(v));
        if (dateFields.length >= 2) {
          const start = window.__iobios.parseAppSheetDate(dateFields[0]);
          const end   = window.__iobios.parseAppSheetDate(dateFields[1]);
          const cur   = new Date(start);
          while (cur <= end) {
            dates.push(new Date(cur));
            cur.setDate(cur.getDate() + 1);
          }
        } else if (dateFields.length === 1) {
          dates.push(window.__iobios.parseAppSheetDate(dateFields[0]));
        }
      }
      // Only cache if rows were actually read from DB (not a "DB not found" empty result)
      if (_absenceRowsReady) _vacationsCache = { email, dates };
      return dates;
    } catch (e) {
      console.warn('[ioBios] absences-db getApprovedVacations error:', e);
      return [];
    }
  }

  // Returns approved Leave-type absences for the given email.
  // Each entry: { date: Date, subtype: string }
  async function getApprovedLeaves(email) {
    if (_leavesCache && _leavesCache.email === email) return _leavesCache.data;
    try {
      const rows = await _getAbsenceRows();
      const result = [];
      for (const row of rows) {
        const values = Object.values(row);
        const rowEmail = values.find(v => typeof v === 'string' && v.includes('@'));
        if (email && rowEmail !== email) continue;
        const hasApproved = values.some(v => typeof v === 'string' && /approved/i.test(v));
        if (!hasApproved) continue;
        // Must be Leave type — could be "Leave", "Full Day Leave", etc.
        const hasLeave = values.some(v => typeof v === 'string' && /leave/i.test(v) && !/holiday/i.test(v));
        if (!hasLeave) continue;

        // Heuristic: find subtype (non-email, non-date, non-status, non-type string)
        const subtype = values.find(v =>
          typeof v === 'string' && v.length > 2 &&
          !v.includes('@') &&
          !/^(approved|pending|rejected|deleted)$/i.test(v) &&
          !/leave|holiday/i.test(v) &&
          !DATE_RE.test(v) &&
          !/^\d{2}\/\d{2}\/\d{4}\s/.test(v) &&
          !/^\d+$/.test(v) &&
          v.length < 100
        ) || '';

        const dateFields = values.filter(v => typeof v === 'string' && DATE_RE.test(v));
        if (dateFields.length >= 2) {
          const start = window.__iobios.parseAppSheetDate(dateFields[0]);
          const end   = window.__iobios.parseAppSheetDate(dateFields[1]);
          const cur   = new Date(start);
          while (cur <= end) {
            result.push({ date: new Date(cur), subtype });
            cur.setDate(cur.getDate() + 1);
          }
        } else if (dateFields.length === 1) {
          result.push({ date: window.__iobios.parseAppSheetDate(dateFields[0]), subtype });
        }
      }
      // Only cache if rows were actually read from DB
      if (_absenceRowsReady) _leavesCache = { email, data: result };
      return result;
    } catch (e) {
      console.warn('[ioBios] absences-db getApprovedLeaves error:', e);
      return [];
    }
  }

  function clearAbsencesCache() {
    _holidaysCache    = null;
    _vacationsCache   = null;
    _leavesCache      = null;
    _absenceRowsCache = null;
    _absenceRowsReady = false;
  }

  window.__iobios = window.__iobios || {};
  window.__iobios.getHolidays          = getHolidays;
  window.__iobios.getApprovedVacations = getApprovedVacations;
  window.__iobios.getApprovedLeaves    = getApprovedLeaves;
  window.__iobios.clearAbsencesCache   = clearAbsencesCache;

})();
