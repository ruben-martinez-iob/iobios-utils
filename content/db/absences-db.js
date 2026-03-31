'use strict';

(function () {

  const TIMESHEET_APP_ID = '60020789-6a4e-43a6-8079-8487a74b56a3';
  const ABSENCES_APP_ID  = '3857d717-2030-4b76-94fa-1acc0805ea88';

  let _holidaysCache  = null;
  let _vacationsCache = null;

  // ── Public API ───────────────────────────────────────────────────────────

  async function getHolidays() {
    if (_holidaysCache) return _holidaysCache;
    try {
      const dbName = await window.__iobios.findAppDb(TIMESHEET_APP_ID);
      if (!dbName) { _holidaysCache = []; return _holidaysCache; }
      const db = await window.__iobios.openDb(dbName);
      const rows = await window.__iobios.readChunks(db, 'Bank Holidays');
      _holidaysCache = rows
        .filter(r => r['2'] && r['3'])
        .map(r => ({ date: window.__iobios.parseAppSheetDate(r['2']), name: r['3'] }));
    } catch (e) {
      console.warn('[ioBios] absences-db getHolidays error:', e);
      _holidaysCache = [];
    }
    return _holidaysCache;
  }

  // Returns approved vacation days for the given email.
  // Reads from the Absences app (ABSENCES_APP_ID) — the app must have been
  // visited at least once so its IndexedDB is populated.
  async function getApprovedVacations(email) {
    if (_vacationsCache && _vacationsCache.email === email) return _vacationsCache.dates;
    try {
      const dbName = await window.__iobios.findAppDb(ABSENCES_APP_ID);
      if (!dbName) {
        console.warn('[ioBios] absences-db: Absences app DB not found — open the Absences app first');
        return [];
      }
      const db = await window.__iobios.openDb(dbName);

      // Discover available table names from IndexedDB keys
      const keys = await new Promise((res, rej) => {
        const tx = db.transaction('keyvaluepairs', 'readonly');
        const req = tx.objectStore('keyvaluepairs').getAllKeys();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      });
      console.log('[ioBios] absences-db keys:', keys);

      // Find the absences/vacations table (first chunk key ending in ~#0)
      const chunkKey = keys.find(k => typeof k === 'string' && k.endsWith('~#0') &&
        !['Bank Holidays', 'Employees', 'Timesheet', 'Time Allocations', 'Projects',
          '_Per User Settings', 'AppGalleryTable'].some(t => k.startsWith(t)));
      if (!chunkKey) {
        console.warn('[ioBios] absences-db: no absences table found in keys:', keys);
        return [];
      }
      const tableName = chunkKey.replace('~#0', '');
      console.log('[ioBios] absences-db: using table', tableName);

      const rows = await window.__iobios.readChunks(db, tableName);
      console.log('[ioBios] absences-db sample row:', rows[0]);

      // Filter by email and approved status — adjust field indices once schema is known
      const dates = [];
      for (const row of rows) {
        const rowEmail  = Object.values(row).find(v => typeof v === 'string' && v.includes('@'));
        const rowStatus = Object.values(row).find(v => typeof v === 'string' && /approved/i.test(v));
        if (email && rowEmail !== email) continue;
        if (!rowStatus) continue;

        // Find date fields (MM/DD/YYYY pattern)
        const dateFields = Object.values(row).filter(v => typeof v === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(v));
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
      _vacationsCache = { email, dates };
      return dates;
    } catch (e) {
      console.warn('[ioBios] absences-db getApprovedVacations error:', e);
      return [];
    }
  }

  window.__iobios = window.__iobios || {};
  window.__iobios.getHolidays = getHolidays;
  window.__iobios.getApprovedVacations = getApprovedVacations;

})();
