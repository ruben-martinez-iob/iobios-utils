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

    // Pre-save validation: detect projects that would duplicate an existing allocation
    _s.conflictKeys = new Set();
    if (_s.cachedData) {
      for (const [dateKey, existingAllocs] of _s.cachedData.existingMap) {
        const activeProjects = new Set(
          existingAllocs
            .filter(a => !_s.markedForDelete.has(a))
            .map(a => a.project)
        );
        if (activeProjects.size === 0) continue;

        for (const alloc of config.timeAllocations) {
          const ck = `${dateKey}::${alloc.project}`;
          if (!_s.manualExclude.has(ck) && activeProjects.has(alloc.project)) {
            _s.conflictKeys.add(ck);
          }
        }

        for (const row of (_s.manualRows.get(dateKey) || [])) {
          const project = row.project.trim();
          if (project && activeProjects.has(project)) {
            _s.conflictKeys.add(`manual::${dateKey}::${row.uid}`);
          }
        }
      }
    }

    if (_s.conflictKeys.size > 0) {
      const preview = document.getElementById('iobios-preview');
      if (preview) window.__iobios.renderTAList(preview, config);
      const n = _s.conflictKeys.size;
      window.__iobios.showToast(
        `${n} proyecto${n !== 1 ? 's' : ''} ya existe${n !== 1 ? 'n' : ''} en ese día — edita las horas del registro existente`,
        'error'
      );
      return;
    }

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

    // Insertions
    const [dates, existing, nonWorkingDays] = await Promise.all([
      window.__iobios.buildDateRange(dateFrom, dateTo, { ...config.rules, skipHolidays: true }),
      window.__iobios.timeAllocationsDb.getAllocations({ dateFrom, dateTo }),
      window.__iobios.getNonWorkingDays(config),
    ]);
    const { vacationSet, leaveSet } = nonWorkingDays;

    // Composite keys already in DB: "dateStr::project"
    const existingKeys = new Set(existing.map(a => `${a.date.toDateString()}::${a.project}`));

    // Days that have reached the hours limit (skip unless manually force-included)
    const existingHoursMap = new Map();
    for (const a of existing) {
      const dk = a.date.toDateString();
      existingHoursMap.set(dk, (existingHoursMap.get(dk) || 0) + parseHoursFromHHMMSS(a.hours));
    }
    const maxH      = config.rules.maxHoursPerDay || 8;
    const fullDates = new Set(
      [...existingHoursMap.entries()]
        .filter(([, h]) => h >= maxH)
        .map(([dk]) => dk)
    );

    // Dates eligible from the range (not deleted this session)
    const allEligible = dates;

    // Force-included dates not already covered by allEligible
    const manualOnly = [..._s.manualInclude]
      .map(k => new Date(k))
      .filter(d => !allEligible.some(e => e.toDateString() === d.toDateString()));

    const candidateDates = [
      ...allEligible.filter(d => !vacationSet.has(d.toDateString()) && !leaveSet.has(d.toDateString())),
      ...manualOnly,
    ];

    let ok = 0, errors = 0;
    for (const date of candidateDates) {
      const dateKey = date.toDateString();
      for (const alloc of config.timeAllocations) {
        const compositeKey = `${dateKey}::${alloc.project}`;
        if (existingKeys.has(compositeKey)) continue;                          // already in DB
        if (deletedKeys.has(compositeKey)) continue;                           // just deleted this session
        if (_s.manualExclude.has(compositeKey)) continue;                      // manually excluded
        if (fullDates.has(dateKey) && !_s.manualInclude.has(dateKey)) continue; // day is full

        const hours   = _s.customHours.get(compositeKey) ?? alloc.hours;
        const project = _s.customProjects.get(compositeKey) ?? alloc.project;
        const res = await window.__iobios.timeAllocationsDb.createAllocation(
          date, project, window.__iobios.hoursToHHMMSS(hours)
        );
        if (res.ok) ok++; else errors++;
      }
    }

    // Manual rows
    for (const [dateKey, rows] of _s.manualRows.entries()) {
      const date = new Date(dateKey);
      for (const row of rows) {
        const project = row.project.trim();
        if (!project) continue;
        const compositeKey = `${dateKey}::${project}`;
        if (existingKeys.has(compositeKey)) continue;
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
