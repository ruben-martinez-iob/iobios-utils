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
    for (const [, ts] of _s.markedForDelete) {
      const res = await window.__iobios.timeSheetsDb.deleteTimesheet(ts);
      if (res.ok) deleted++; else deleteErrors++;
    }

    // Insertions
    const [dates, existing, nonWorkingDays] = await Promise.all([
      window.__iobios.buildDateRange(dateFrom, dateTo, { ...config.rules, skipHolidays: true }, config),
      window.__iobios.timeSheetsDb.getTimesheets({ dateFrom, dateTo }),
      window.__iobios.getNonWorkingDays(config),
    ]);
    const { vacationSet, leaveSet } = nonWorkingDays;
    const existingDates = new Set(existing.map(t => t.date.toDateString()));

    const allEligible = dates.filter(d =>
      !existingDates.has(d.toDateString()) && !_s.markedForDelete.has(d.toDateString())
    );
    const manualOnly = [..._s.manualInclude]
      .map(k => new Date(k))
      .filter(d => !existingDates.has(d.toDateString()) && !allEligible.some(e => e.toDateString() === d.toDateString()));

    const toInsert = [
      ...allEligible.filter(d =>
        !vacationSet.has(d.toDateString()) &&
        !leaveSet.has(d.toDateString()) &&
        !_s.manualExclude.has(d.toDateString())
      ),
      ...manualOnly,
    ];

    let ok = 0, errors = 0;
    for (const date of toInsert) {
      const h = _s.customHours.get(date.toDateString()) || config.timeSheets;
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
