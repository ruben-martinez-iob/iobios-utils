'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  function isSummerDate(d, config) {
    const ss = config.summerSchedule;
    if (!ss || !ss.start || !ss.end) return false;
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return md >= ss.start && md <= ss.end;
  }

  // ── Panel body ───────────────────────────────────────────────────────────

  function renderTimeAllocationsBody(container, config) {
    const _s = window.__iobios._taState;

    _s.manualInclude   = new Set();
    _s.manualExclude   = new Set();
    _s.markedForDelete = new Set();
    _s.customHours     = new Map();
    _s.customProjects  = new Map();
    _s.editingRows     = new Set();
    _s.manualRows      = new Map();
    _s.cachedData      = null;
    _s.conflictKeys    = new Set();

    const { from, to } = window.__iobios.defaultDateRange();

    container.innerHTML = `
      <div class="iobios-range-form">
        <div class="iobios-range-inputs">
          <button id="iobios-month-prev" class="iobios-month-nav" title="Mes anterior">&#8249;</button>
          <div class="iobios-range-field">
            <label>Desde</label>
            <input type="text" id="iobios-date-from" class="iobios-date-text" placeholder="dd/mm/yyyy" value="${window.__iobios.toDisplayDate(from)}" />
          </div>
          <div class="iobios-range-field">
            <label>Hasta</label>
            <input type="text" id="iobios-date-to" class="iobios-date-text" placeholder="dd/mm/yyyy" value="${window.__iobios.toDisplayDate(to)}" />
          </div>
          <button id="iobios-month-next" class="iobios-month-nav" title="Mes siguiente">&#8250;</button>
        </div>
      </div>
      <div id="iobios-preview"><p class="iobios-loading">Calculando...</p></div>
    `;

    async function updatePreview(forceRefetch) {
      const fromVal = document.getElementById('iobios-date-from').value;
      const toVal   = document.getElementById('iobios-date-to').value;
      const preview = document.getElementById('iobios-preview');
      const fromDate = window.__iobios.fromDateInput(fromVal);
      const toDate   = window.__iobios.fromDateInput(toVal);
      if (!fromVal || !toVal || !fromDate || !toDate || fromDate > toDate) {
        preview.innerHTML = '<p class="iobios-preview-empty">Selecciona un rango de fechas válido.</p>';
        _s.cachedData = null;
        return;
      }

      // Get fresh config to include latest custom holidays
      const freshConfig = await window.__iobios.getConfig();

      if (!_s.cachedData || forceRefetch) {
        preview.innerHTML = '<p class="iobios-loading">Calculando...</p>';
        const dateFrom = fromDate;
        const dateTo   = toDate;
        
        const [nonWorkingDays, existing] = await Promise.all([
          window.__iobios.getNonWorkingDays(freshConfig),
          window.__iobios.timeAllocationsDb.getAllocations({ dateFrom, dateTo }),
        ]);

        const allDates = [];
        const cur = new Date(dateFrom);
        while (cur <= dateTo) { allDates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

        // Map dateStr → [allocations] for existing days
        const existingMap = new Map();
        for (const a of existing) {
          const key = a.date.toDateString();
          if (!existingMap.has(key)) existingMap.set(key, []);
          existingMap.get(key).push(a);
        }

        const { holidaySet, holidayNameMap, vacationSet, leaveSet, leaveDetailMap } = nonWorkingDays;
        _s.cachedData = {
          allDates,
          holidaySet, holidayNameMap,
          vacationSet,
          leaveSet, leaveDetailMap,
          existingMap,
        };
      }

      window.__iobios.renderTAList(document.getElementById('iobios-preview'), freshConfig);
    }

    function shiftMonth(delta) {
      const fromInput = document.getElementById('iobios-date-from');
      const toInput   = document.getElementById('iobios-date-to');
      const d = window.__iobios.fromDateInput(fromInput.value);
      const base = new Date(d.getFullYear(), d.getMonth() + delta, 1);
      fromInput.value = window.__iobios.toDisplayDate(base);
      toInput.value   = window.__iobios.toDisplayDate(new Date(base.getFullYear(), base.getMonth() + 1, 0));
      _s.cachedData      = null;
      _s.manualInclude   = new Set();
      _s.manualExclude   = new Set();
      _s.markedForDelete = new Set();
      _s.customHours     = new Map();
      _s.customProjects  = new Map();
      _s.editingRows     = new Set();
      _s.manualRows      = new Map();
      updatePreview(true);
    }

    document.getElementById('iobios-preview').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const key     = btn.dataset.date;
      const project = btn.dataset.project;
      if (!key) return;

      if (btn.classList.contains('iobios-toggle-delete')) {
        const id = btn.dataset.id;
        const allocs = _s.cachedData && _s.cachedData.existingMap.get(key);
        const alloc = allocs && allocs.find(a => a.id === id);
        if (alloc) _s.markedForDelete.add(alloc);
      } else if (btn.classList.contains('iobios-toggle-undelete')) {
        const id = btn.dataset.id;
        const allocs = _s.cachedData && _s.cachedData.existingMap.get(key);
        const alloc = allocs && allocs.find(a => a.id === id);
        if (alloc) _s.markedForDelete.delete(alloc);
      } else if (btn.classList.contains('iobios-toggle-include')) {
        if (project) {
          // Re-include a specific excluded project row
          _s.manualExclude.delete(`${key}::${project}`);
        } else {
          // Force-include whole day (naturally excluded or full days)
          _s.manualInclude.add(key);
          for (const excKey of [..._s.manualExclude]) {
            if (excKey.startsWith(`${key}::`)) _s.manualExclude.delete(excKey);
          }
        }
      } else if (btn.classList.contains('iobios-add-manual-row')) {
        if (!_s.manualRows.has(key)) _s.manualRows.set(key, []);
        _s.manualRows.get(key).push({ uid: ++_s.uidCounter, project: '', hours: config.rules.maxHoursPerDay || 8 });
      } else if (btn.classList.contains('iobios-remove-manual-row')) {
        const uid = Number(btn.dataset.uid);
        const rows = _s.manualRows.get(key);
        if (rows) {
          const idx = rows.findIndex(r => r.uid === uid);
          if (idx !== -1) rows.splice(idx, 1);
        }
        _s.conflictKeys.delete(`manual::${key}::${uid}`);
      } else if (btn.classList.contains('iobios-toggle-exclude') && project) {
        _s.manualExclude.add(`${key}::${project}`);
      } else if (btn.classList.contains('iobios-toggle-edit')) {
        _s.editingRows.add(`${key}::${project}`);
      } else if (btn.classList.contains('iobios-cancel-edit')) {
        _s.editingRows.delete(`${key}::${project}`);
      } else if (btn.classList.contains('iobios-save-edit')) {
        const row = btn.closest('.iobios-preview-row');
        const hoursInput = row && row.querySelector('.iobios-alloc-hours-input:not([disabled])');
        const newHours = hoursInput ? parseFloat(hoursInput.value) : NaN;
        if (!isNaN(newHours) && newHours > 0) {
          const allocs = _s.cachedData.existingMap.get(key);
          const alloc = allocs && allocs.find(a => a.project === project);
          if (alloc) {
            btn.disabled = true;
            btn.textContent = '⏳';
            const res = await window.__iobios.timeAllocationsDb.updateAllocation(alloc, newHours);
            if (res.ok) {
              alloc.hours = window.__iobios.hoursToHHMMSS(newHours);
              _s.editingRows.delete(`${key}::${project}`);
              window.__iobios.showToast('✏ 1 actualizado', 'success');
            } else {
              btn.disabled = false;
              btn.textContent = '✓';
              window.__iobios.showToast('Error al guardar', 'error');
            }
            window.__iobios.renderTAList(document.getElementById('iobios-preview'), config);
            return;
          }
        }
      }
      window.__iobios.renderTAList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-preview').addEventListener('input', (e) => {
      const manualInput = e.target.closest('input.iobios-manual-project-input');
      if (!manualInput) return;

      const key = manualInput.dataset.date;
      const uid = Number(manualInput.dataset.uid);
      const val = manualInput.value.trim();
      const conflictKey = `manual::${key}::${uid}`;

      let isConflict = false;
      if (val && _s.cachedData) {
        const dayAllocs = _s.cachedData.existingMap.get(key) || [];
        const activeExisting = new Set(dayAllocs.filter(a => !_s.markedForDelete.has(a)).map(a => a.project));
        const configNames = new Set(
          config.timeAllocations
            .filter(a => !_s.manualExclude.has(`${key}::${a.project}`))
            .map(a => _s.customProjects.get(`${key}::${a.project}`) ?? a.project)
        );
        const rows = _s.manualRows.get(key) || [];
        const otherManual = new Set(rows.filter(r => r.uid !== uid).map(r => r.project).filter(Boolean));
        isConflict = activeExisting.has(val) || configNames.has(val) || otherManual.has(val);
      }

      manualInput.classList.toggle('iobios-input-error', isConflict);
      if (isConflict) {
        _s.conflictKeys.add(conflictKey);
      } else {
        _s.conflictKeys.delete(conflictKey);
      }

      const saveBtn = document.getElementById('iobios-panel-save');
      if (saveBtn) saveBtn.disabled = _s.conflictKeys.size > 0 || (!val && saveBtn.disabled);
    });

    document.getElementById('iobios-preview').addEventListener('change', (e) => {
      const manualProjectInput = e.target.closest('input.iobios-manual-project-input');
      const manualHoursInput   = e.target.closest('input.iobios-manual-hours-input');
      const hoursInput   = e.target.closest('input.iobios-alloc-hours-input:not([disabled])');
      const projectInput = e.target.closest('input.iobios-alloc-project-input:not([disabled])');

      if (manualProjectInput) {
        const key = manualProjectInput.dataset.date;
        const uid = Number(manualProjectInput.dataset.uid);
        const val = manualProjectInput.value.trim();
        const rows = _s.manualRows.get(key);
        const row  = rows && rows.find(r => r.uid === uid);
        if (row) {
          if (val) {
            const dayAllocs = (_s.cachedData && _s.cachedData.existingMap.get(key)) || [];
            const activeExisting = new Set(dayAllocs.filter(a => !_s.markedForDelete.has(a)).map(a => a.project));
            const configNames = config.timeAllocations
              .filter(a => !_s.manualExclude.has(`${key}::${a.project}`))
              .map(a => _s.customProjects.get(`${key}::${a.project}`) ?? a.project);
            const otherManual = rows.filter(r => r.uid !== uid).map(r => r.project).filter(Boolean);
            const takenNames = new Set([...activeExisting, ...configNames, ...otherManual]);
            if (takenNames.has(val)) {
              manualProjectInput.value = row.project;
              window.__iobios.showToast('Ya existe ese proyecto en este día', 'error');
              return;
            }
          }
          row.project = val;
          window.__iobios.renderTAList(document.getElementById('iobios-preview'), config);
        }
        return;
      }

      if (manualHoursInput) {
        const key = manualHoursInput.dataset.date;
        const uid = Number(manualHoursInput.dataset.uid);
        const val = parseFloat(manualHoursInput.value);
        const rows = _s.manualRows.get(key);
        const row  = rows && rows.find(r => r.uid === uid);
        if (row && !isNaN(val) && val > 0) {
          row.hours = val;
          window.__iobios.renderTAList(document.getElementById('iobios-preview'), config);
        }
        return;
      }

      if (hoursInput) {
        const key     = hoursInput.dataset.date;
        const project = hoursInput.dataset.project;
        const val     = parseFloat(hoursInput.value);
        if (key && project && !isNaN(val) && val > 0) {
          _s.customHours.set(`${key}::${project}`, val);
          // Update day label in-place to avoid replacing the DOM mid-edit
          if (_s.cachedData) {
            const date = new Date(key);
            const dayAllocs = _s.cachedData.existingMap.get(key) || [];
            const existingProjects = new Set(dayAllocs.map(a => a.project));
            const maxH = config.rules.maxHoursPerDay || 8;
            const inSummer = isSummerDate(date, config);
            const dayMaxH  = (inSummer && config.summerSchedule?.hours) ? config.summerSchedule.hours : maxH;
            const totalExistH = dayAllocs.reduce((sum, a) => {
              const ek = `${key}::${a.project}`;
              return sum + (_s.editingRows.has(ek) && _s.customHours.has(ek)
                ? _s.customHours.get(ek) : parseHoursFromHHMMSS(a.hours));
            }, 0);
            const missingAllocs = config.timeAllocations.filter(a => !existingProjects.has(a.project));
            const isDayFull = totalExistH >= maxH && !_s.manualInclude.has(key);
            const naturallyExcluded = _s.cachedData.holidaySet.has(key) || _s.cachedData.vacationSet.has(key) ||
              (_s.cachedData.leaveSet && _s.cachedData.leaveSet.has(key)) ||
              (config.rules.skipWeekends && (date.getDay() === 0 || date.getDay() === 6)) ||
              date > new Date();
            const showMissingRows = !naturallyExcluded && !isDayFull;
            const totalNewH = showMissingRows
              ? missingAllocs.filter(a => !_s.manualExclude.has(`${key}::${a.project}`))
                  .reduce((sum, a) => sum + Number(_s.customHours.get(`${key}::${a.project}`) ?? a.hours), 0)
              : 0;
            const totalDayH = totalExistH + totalNewH;
            const dayLabelClass = totalDayH > dayMaxH ? ' iobios-day-hours-excess'
              : totalDayH < dayMaxH * 0.99 ? ' iobios-day-hours-warning' : '';
            const label = document.querySelector(`.iobios-day-hours-label[data-day="${key}"]`);
            if (label) {
              label.textContent = fmtH(totalDayH);
              label.className = 'iobios-day-hours-label' + dayLabelClass;
            }
          }
        }
      } else if (projectInput) {
        const key     = projectInput.dataset.date;
        const project = projectInput.dataset.project;
        const val     = projectInput.value.trim();
        if (key && project && val) {
          // Collect all project names that will exist on this day after the rename
          const dayAllocs = (_s.cachedData && _s.cachedData.existingMap.get(key)) || [];
          const activeExisting = new Set(
            dayAllocs
              .filter(a => !_s.markedForDelete.has(a))
              .map(a => a.project)
          );
          const otherNewNames = config.timeAllocations
            .filter(a => a.project !== project && !_s.manualExclude.has(`${key}::${a.project}`))
            .map(a => _s.customProjects.get(`${key}::${a.project}`) ?? a.project);
          const takenNames = new Set([...activeExisting, ...otherNewNames]);
          if (takenNames.has(val)) {
            projectInput.value = _s.customProjects.get(`${key}::${project}`) ?? project;
            window.__iobios.showToast('Ya existe ese proyecto en este día', 'error');
            return;
          }
          _s.customProjects.set(`${key}::${project}`, val);
        }
      }
    });

    // Re-render (updates footer totals) when focus leaves a hours input.
    // Skip if moving to the save/cancel buttons of the same row to avoid
    // destroying them before the click fires.
    document.getElementById('iobios-preview').addEventListener('focusout', (e) => {
      const input = e.target.closest('input.iobios-alloc-hours-input:not([disabled])');
      if (!input) return;
      const next = e.relatedTarget;
      if (next && next.matches('.iobios-save-edit, .iobios-cancel-edit') &&
          next.dataset.date === input.dataset.date &&
          next.dataset.project === input.dataset.project) return;
      window.__iobios.renderTAList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-date-from').addEventListener('change', () => { _s.cachedData = null; updatePreview(true); });
    document.getElementById('iobios-date-to').addEventListener('change',   () => { _s.cachedData = null; updatePreview(true); });
    document.getElementById('iobios-month-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('iobios-month-next').addEventListener('click', () => shiftMonth(+1));

    // When AppSheet sync runs, refresh the preview so it reflects the new DB state
    const syncBtn = document.querySelector('button[aria-label="Sync"]');
    if (syncBtn && !syncBtn._iobiosAllocHooked) {
      syncBtn._iobiosAllocHooked = true;
      syncBtn.addEventListener('click', () => {
        setTimeout(() => {
          const panel = document.getElementById('iobios-panel');
          if (panel && panel.classList.contains('open')) {
            _s.cachedData = null;
            window.__iobios.timeAllocationsDb.clearCache();
            window.__iobios.clearAbsencesCache();
            updatePreview(true);
          }
        }, 2000);
      });
    }

    updatePreview(true);
  }

  // ── Helpers used in the change handler (local copies) ────────────────────

  function parseHoursFromHHMMSS(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) + (parts[1] || 0) / 60;
  }

  function fmtH(h) {
    return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
  }

  Object.assign(window.__iobios, { renderTimeAllocationsBody });

})();
