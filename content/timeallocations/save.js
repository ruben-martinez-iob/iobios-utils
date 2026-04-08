'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  function parseHoursFromHHMMSS(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) + (parts[1] || 0) / 60;
  }

  async function saveTimeAllocations(config) {
    const _s = window.__iobios._taState;

    const fromVal = document.getElementById('iobios-date-from').value;
    const toVal   = document.getElementById('iobios-date-to').value;
    if (!fromVal || !toVal) { window.__iobios.closePanel(); return; }

    // Skip validation for now - allow all cases to be saved
    _s.conflictKeys = new Set();

    const saveBtn = document.getElementById('iobios-panel-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }

    const dateFrom = window.__iobios.fromDateInput(fromVal);
    const dateTo   = window.__iobios.fromDateInput(toVal);

    // Deletions
    let deleted = 0, deleteErrors = 0;
    const deletedKeys = new Set();
    for (const alloc of _s.markedForDelete) {
      const res = await window.__iobios.timeAllocationsDb.deleteAllocation(alloc);
      if (res.ok) { deleted++; deletedKeys.add(`${alloc.date.toDateString()}::${alloc.project}`); }
      else deleteErrors++;
    }
    // Force a fresh read from IndexedDB for the insertions phase so any
    // softDeleteInDb patches are visible and the in-memory filter is not stale.
    if (deleted > 0) window.__iobios.timeAllocationsDb.clearCache();

    // Insertions — use the same cached data and filtering logic as the renderer
    const cached = _s.cachedData;
    const { allDates, holidaySet, vacationSet, leaveSet } = cached;

    // Refresh existingMap from DB (post-deletions)
    const existing = await window.__iobios.timeAllocationsDb.getAllocations({ dateFrom, dateTo });
    const existingMap = new Map();
    for (const a of existing) {
      const key = a.date.toDateString();
      if (!existingMap.has(key)) existingMap.set(key, []);
      existingMap.get(key).push(a);
    }

    let ok = 0, errors = 0;
    const maxH = config.rules.maxHoursPerDay || 8;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const date of allDates) {
      const dateKey = date.toDateString();
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isFuture = date > today;
      const naturallyExcluded =
        holidaySet.has(dateKey) || vacationSet.has(dateKey) || leaveSet.has(dateKey) ||
        (config.rules.skipWeekends && isWeekend) || isFuture;

      const rowState = _s.rowStates.get(dateKey);
      const inAddList = rowState?.inAddList || false;
      if (naturallyExcluded && !inAddList) continue;

      const dayAllocs = existingMap.get(dateKey) || [];
      const existingProjects = new Set(dayAllocs.map(a => a.project));
      const missingAllocs = config.timeAllocations.filter(a => !existingProjects.has(a.project));
      if (missingAllocs.length === 0) continue;

      const totalExistH = dayAllocs.reduce((sum, a) => sum + parseHoursFromHHMMSS(a.hours), 0);
      const isDayFull = dayAllocs.length > 0 && totalExistH >= maxH && !inAddList;
      if (isDayFull) continue;

      for (const alloc of missingAllocs) {
        const compositeKey = `${dateKey}::${alloc.project}`;
        if (deletedKeys.has(compositeKey)) continue; // just deleted, don't re-insert
        const hours = _s.customHours.get(compositeKey) ?? alloc.hours;
        if (_s.customHours.has(compositeKey) && Number(hours) === 0) continue;
        const project = _s.customProjects.get(compositeKey) ?? alloc.project;
        const res = await window.__iobios.timeAllocationsDb.createAllocation(date, project, window.__iobios.hoursToHHMMSS(hours));
        if (res.ok) ok++; else errors++;
      }
    }

    // Manual rows - save all without validation
    for (const [dateKey, rows] of _s.manualRows.entries()) {
      const date = new Date(dateKey);
      for (const row of rows) {
        const project = row.project.trim();
        if (!project) continue;
        const res = await window.__iobios.timeAllocationsDb.createAllocation(
          date, project, window.__iobios.hoursToHHMMSS(row.hours)
        );
        if (res.ok) ok++; else errors++;
      }
    }

    window.__iobios.closePanel();

    const parts = [];
    if (ok > 0)      parts.push(`✓ ${ok} insertado${ok !== 1 ? 's' : ''}`);
    if (deleted > 0) parts.push(`🗑 ${deleted} borrado${deleted !== 1 ? 's' : ''}`);
    const hasError = errors > 0 || deleteErrors > 0;
    if (hasError)    parts.push(`${errors + deleteErrors} error${errors + deleteErrors !== 1 ? 'es' : ''}`);

    window.__iobios.showToast(parts.join(', ') || 'Sin cambios', hasError ? 'error' : 'success');

    if (ok > 0 || deleted > 0) {
      const syncBtn = document.querySelector('button[aria-label="Sync"]');
      if (syncBtn) syncBtn.click();
    }
  }

  Object.assign(window.__iobios, { saveTimeAllocations });

})();
