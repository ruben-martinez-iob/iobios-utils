'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  async function saveTimeSheets(config) {
    const _s = window.__iobios._tsState;

    const fromVal = document.getElementById('iobios-date-from').value;
    const toVal   = document.getElementById('iobios-date-to').value;
    if (!fromVal || !toVal) { window.__iobios.closePanel(); return; }

    const saveBtn = document.getElementById('iobios-panel-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }

    const dateFrom = window.__iobios.fromDateInput(fromVal);
    const dateTo   = window.__iobios.fromDateInput(toVal);

    // Deletions
    let deleted = 0, deleteErrors = 0;
    const deletedDates = new Set();
    for (const [key, ts] of _s.markedForDelete) {
      const res = await window.__iobios.timeSheetsDb.deleteTimesheet(ts);
      if (res.ok) { deleted++; deletedDates.add(key); }
      else deleteErrors++;
    }
    if (deleted > 0) window.__iobios.timeSheetsDb.clearCache();

    // Insertions — mirror the renderer's willInsert logic using cached data
    const cached = _s.cachedData;
    const { allDates, holidaySet, vacationSet, leaveSet } = cached;

    const existing = await window.__iobios.timeSheetsDb.getTimesheets({ dateFrom, dateTo });
    const existingDates = new Set(existing.map(t => t.date.toDateString()));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let ok = 0, errors = 0;
    for (const date of allDates) {
      const key = date.toDateString();
      const dow = date.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isFuture = date > today;
      const naturallyExcluded =
        holidaySet.has(key) || vacationSet.has(key) || leaveSet.has(key) ||
        (config.rules.skipWeekends && isWeekend) || isFuture;

      const forced  = _s.manualInclude.has(key);
      const skipped = _s.manualExclude.has(key);
      const willInsert = !existingDates.has(key) && !deletedDates.has(key) &&
        (forced || (!skipped && !naturallyExcluded));

      if (!willInsert) continue;

      const h = _s.customHours.get(key) || config.timeSheets;
      const res = await window.__iobios.timeSheetsDb.createTimesheet(date, h.period1, h.period2);
      if (res.ok) ok++; else errors++;
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

  Object.assign(window.__iobios, { saveTimeSheets });

})();
