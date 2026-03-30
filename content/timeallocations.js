'use strict';

(function () {

  // ── Helpers ──────────────────────────────────────────────────────────────

  function parseHoursFromHHMMSS(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) + (parts[1] || 0) / 60;
  }

  function fmtH(h) {
    return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
  }

  // ── Override state (reset each time the panel opens) ─────────────────────
  let _manualInclude   = new Set(); // dateStr — force-include naturally excluded days
  let _manualExclude   = new Set(); // "dateStr::project" — granular exclusion
  let _markedForDelete = new Map(); // dateStr → [allocation, ...]
  let _customHours     = new Map(); // "dateStr::project" → hours
  let _customProjects  = new Map(); // "dateStr::project" → overridden project name
  let _editingRows     = new Set(); // "dateStr::project" keys for rows in edit mode

  // ── Panel body ───────────────────────────────────────────────────────────

  function renderTimeAllocationsBody(container, config) {
    _manualInclude   = new Set();
    _manualExclude   = new Set();
    _markedForDelete = new Map();
    _customHours     = new Map();
    _customProjects  = new Map();
    _editingRows     = new Set();

    const { from, to } = window.__iobios.defaultDateRange();

    container.innerHTML = `
      <div class="iobios-range-form">
        <div class="iobios-range-inputs">
          <button id="iobios-month-prev" class="iobios-month-nav" title="Mes anterior">&#8249;</button>
          <div class="iobios-range-field">
            <label>Desde</label>
            <input type="date" id="iobios-date-from" lang="es" value="${window.__iobios.toDateInputValue(from)}" />
          </div>
          <div class="iobios-range-field">
            <label>Hasta</label>
            <input type="date" id="iobios-date-to" lang="es" value="${window.__iobios.toDateInputValue(to)}" />
          </div>
          <button id="iobios-month-next" class="iobios-month-nav" title="Mes siguiente">&#8250;</button>
        </div>
      </div>
      <div id="iobios-preview"><p class="iobios-loading">Calculando...</p></div>
    `;

    let _cachedData = null;

    function isSummerDate(d) {
      const ss = config.summerSchedule;
      if (!ss || !ss.start || !ss.end) return false;
      const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return md >= ss.start && md <= ss.end;
    }

    async function updatePreview(forceRefetch) {
      const fromVal = document.getElementById('iobios-date-from').value;
      const toVal   = document.getElementById('iobios-date-to').value;
      const preview = document.getElementById('iobios-preview');
      if (!fromVal || !toVal || fromVal > toVal) {
        preview.innerHTML = '<p class="iobios-preview-empty">Selecciona un rango de fechas válido.</p>';
        _cachedData = null;
        return;
      }

      if (!_cachedData || forceRefetch) {
        preview.innerHTML = '<p class="iobios-loading">Calculando...</p>';
        const dateFrom = window.__iobios.fromDateInput(fromVal);
        const dateTo   = window.__iobios.fromDateInput(toVal);
        const email = window.__iobios.getCurrentUserEmail();
        const [holidays, vacations, existing] = await Promise.all([
          window.__iobios.getHolidays(),
          window.__iobios.getApprovedVacations(email),
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

        _cachedData = {
          allDates,
          holidaySet:  new Set(holidays.map(h => h.date.toDateString())),
          vacationSet: new Set(vacations.map(v => v.toDateString())),
          existingMap,
        };
      }

      renderList(document.getElementById('iobios-preview'), config);
    }

    function renderList(preview, config) {
      const { allDates, holidaySet, vacationSet, existingMap } = _cachedData;
      const todayKey    = new Date().toDateString();
      let insertRecords = 0;
      let insertDays    = 0;
      let deleteDays    = 0;
      let hoursToInsert = 0;
      let hoursExisting = 0;
      let workingDays   = 0;
      let html = '<div class="iobios-preview-list">';

      for (const date of allDates) {
        const key        = date.toDateString();
        const dow        = date.getDay();
        const isWeekend  = dow === 0 || dow === 6;
        const isHoliday  = holidaySet.has(key);
        const isVacation = vacationSet.has(key);
        const forced     = _manualInclude.has(key);
        const toDelete   = _markedForDelete.has(key);

        const isFuture = date > new Date();
        const naturallyExcluded = (config.rules.skipWeekends && isWeekend) || isHoliday || isVacation || isFuture;
        const daySkipped = naturallyExcluded && !forced;

        const dayAllocs = existingMap.get(key) || [];
        const existingProjects = new Set(dayAllocs.map(a => a.project));

        // Config projects not yet in DB for this day
        const missingAllocs = config.timeAllocations.filter(a => !existingProjects.has(a.project));

        const hasExisting        = dayAllocs.length > 0;
        const totalExistingHours = dayAllocs.reduce((sum, a) => {
          const ek = `${key}::${a.project}`;
          return sum + (_editingRows.has(ek) && _customHours.has(ek)
            ? _customHours.get(ek)
            : parseHoursFromHHMMSS(a.hours));
        }, 0);
        const maxH               = config.rules.maxHoursPerDay || 8;
        const isDayFull          = hasExisting && totalExistingHours >= maxH && !forced;

        const inSummer = isSummerDate(date);
        const dayMaxH  = (inSummer && config.summerSchedule?.hours) ? config.summerSchedule.hours : maxH;

        if (!naturallyExcluded) workingDays++;
        if (hasExisting && !toDelete) hoursExisting += totalExistingHours;

        // Whether missing rows should be shown at all for this day
        const showMissingRows = !daySkipped && !isDayFull;

        // Day total hours label (first row of day)
        const totalNewH = showMissingRows
          ? missingAllocs
              .filter(a => !_manualExclude.has(`${key}::${a.project}`))
              .reduce((sum, a) => sum + Number(_customHours.get(`${key}::${a.project}`) ?? a.hours), 0)
          : 0;
        const totalDayH = (toDelete ? 0 : totalExistingHours) + totalNewH;
        const dayLabelClass = totalDayH > dayMaxH ? ' iobios-day-hours-excess'
          : totalDayH < dayMaxH * 0.99 ? ' iobios-day-hours-warning'
          : '';
        const dayLabelHtml = totalDayH > 0
          ? `<span class="iobios-day-hours-label${dayLabelClass}" data-day="${key}">${fmtH(totalDayH)}</span>`
          : '';

        if (toDelete) {
          deleteDays++;
          dayAllocs.forEach((alloc, i) => {
            html += `<div class="iobios-preview-row iobios-status-delete${key === todayKey && i === 0 ? ' iobios-today' : ''}">
              <span class="iobios-preview-date${i > 0 ? ' iobios-date-continuation' : ''}">${i === 0 ? window.__iobios.formatDayLabel(date) : ''}</span>
              <span class="iobios-preview-detail">${alloc.project} — ${alloc.hours}</span>
              ${i === 0 ? `<span class="iobios-preview-badge iobios-badge-delete">Borrar</span><button class="iobios-toggle-btn iobios-toggle-undelete" data-date="${key}" title="Cancelar borrado">✕</button>` : ''}
            </div>`;
          });
        } else if (hasExisting || (showMissingRows && missingAllocs.length > 0)) {
          let firstRow = true;

          const insertableCount = showMissingRows
            ? missingAllocs.filter(a => !_manualExclude.has(`${key}::${a.project}`)).length
            : 0;
          if (insertableCount > 0) insertDays++;

          // Existing rows (gray, read-only or edit mode)
          dayAllocs.forEach(alloc => {
            const isEditing = _editingRows.has(`${key}::${alloc.project}`);
            const editKey   = `${key}::${alloc.project}`;
            const existingH = (isEditing && _customHours.has(editKey))
              ? _customHours.get(editKey)
              : parseHoursFromHHMMSS(alloc.hours);
            if (isEditing) {
              html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey && firstRow ? ' iobios-today' : ''}">
                <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                <input type="text" class="iobios-alloc-project-input iobios-alloc-hours-ro" value="${alloc.project}" disabled>
                <input type="number" class="iobios-alloc-hours-input" data-date="${key}" data-project="${alloc.project}" value="${existingH}" min="0.5" max="24" step="0.5">
                <span class="iobios-alloc-spacer"></span>
                ${firstRow ? dayLabelHtml : ''}
                <button class="iobios-toggle-btn iobios-save-edit" data-date="${key}" data-project="${alloc.project}" title="Guardar">✓</button>
                <button class="iobios-toggle-btn iobios-cancel-edit" data-date="${key}" data-project="${alloc.project}" title="Cancelar">✕</button>
              </div>`;
            } else {
              html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey && firstRow ? ' iobios-today' : ''}">
                <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                <input type="text" class="iobios-alloc-project-input iobios-alloc-hours-ro" value="${alloc.project}" disabled>
                <input type="number" class="iobios-alloc-hours-input iobios-alloc-hours-ro" value="${existingH}" disabled>
                <span class="iobios-alloc-spacer"></span>
                ${firstRow ? dayLabelHtml : ''}
                <button class="iobios-toggle-btn iobios-toggle-edit" data-date="${key}" data-project="${alloc.project}" title="Editar">✏</button>
                ${firstRow ? `<button class="iobios-toggle-btn iobios-toggle-delete" data-date="${key}" title="Marcar para borrar">🗑</button>` : ''}
              </div>`;
            }
            firstRow = false;
          });

          // Full-day indicator: show badge + button to force-include more
          if (isDayFull && missingAllocs.length > 0) {
            html += `<div class="iobios-preview-row iobios-status-existing">
              <span class="iobios-preview-date iobios-date-continuation"></span>
              <span class="iobios-preview-badge iobios-badge-excluded">Completo · ${fmtH(totalExistingHours)}</span>
              <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" title="Añadir más proyectos">+</button>
            </div>`;
          }

          // Missing alloc rows: green (to insert) or yellow (excluded)
          if (showMissingRows) {
            missingAllocs.forEach(alloc => {
              const isExcluded = _manualExclude.has(`${key}::${alloc.project}`);
              if (!isExcluded) {
                insertRecords++;
                const customH = _customHours.get(`${key}::${alloc.project}`) ?? alloc.hours;
                hoursToInsert += Number(customH);
                html += `<div class="iobios-preview-row iobios-status-new${key === todayKey && firstRow ? ' iobios-today' : ''}">
                  <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                  <input type="text" class="iobios-alloc-project-input" data-date="${key}" data-project="${alloc.project}" value="${_customProjects.get(`${key}::${alloc.project}`) ?? alloc.project}">
                  <input type="number" class="iobios-alloc-hours-input" data-date="${key}" data-project="${alloc.project}" value="${customH}" min="0.5" max="24" step="0.5">
                  <span class="iobios-alloc-spacer"></span>
                  ${firstRow ? dayLabelHtml : ''}
                  <button class="iobios-toggle-btn iobios-toggle-exclude" data-date="${key}" data-project="${alloc.project}" title="No añadir">✕</button>
                </div>`;
              } else {
                html += `<div class="iobios-preview-row iobios-status-excluded${key === todayKey && firstRow ? ' iobios-today' : ''}">
                  <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                  <span class="iobios-preview-detail">${alloc.project}</span>
                  <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" data-project="${alloc.project}" title="Añadir">+</button>
                </div>`;
              }
              firstRow = false;
            });
          }
        } else if (daySkipped) {
          // Naturally excluded day — show badge
          const statusClass = isVacation ? 'iobios-status-vacation'
            : isHoliday ? 'iobios-status-holiday'
            : isWeekend ? 'iobios-status-weekend'
            : 'iobios-status-excluded';
          const badge = isVacation ? 'Ausencia' : isHoliday ? 'Festivo'
            : isWeekend ? 'Fin de semana' : isFuture ? 'Futuro' : 'Excluido';
          const badgeClass = isVacation ? 'iobios-badge-vacation' : isHoliday ? 'iobios-badge-holiday'
            : isWeekend ? 'iobios-badge-weekend' : 'iobios-badge-excluded';
          html += `<div class="iobios-preview-row ${statusClass}${key === todayKey ? ' iobios-today' : ''}">
            <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
            <span class="iobios-preview-badge ${badgeClass}">${badge}</span>
            <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" title="Incluir">+</button>
          </div>`;
        }
      }
      html += '</div>';

      const summary = [];
      if (insertRecords > 0) summary.push(`${insertRecords} registro${insertRecords !== 1 ? 's' : ''} a insertar (${insertDays} día${insertDays !== 1 ? 's' : ''})`);
      if (deleteDays > 0) summary.push(`${deleteDays} día${deleteDays !== 1 ? 's' : ''} a borrar`);
      const summaryText = summary.length ? summary.join(', ') : '0 cambios';

      const hoursExpected = workingDays * (config.rules.maxHoursPerDay || 8);
      const totalCovered  = hoursToInsert + hoursExisting;
      const hoursLine = hoursExpected > 0
        ? `<p class="iobios-hours-summary${totalCovered < hoursExpected ? ' iobios-hours-warning' : ''}">↑ ${fmtH(hoursToInsert)} a insertar · ✓ ${fmtH(hoursExisting)} imputadas · ⏱ ${fmtH(hoursExpected)} esperadas</p>`
        : '';

      preview.innerHTML = `<div class="iobios-preview-footer"><p class="iobios-preview-summary">${summaryText}</p>${hoursLine}</div>` + html;

      const saveBtn = document.getElementById('iobios-panel-save');
      if (saveBtn) saveBtn.disabled = insertRecords === 0 && deleteDays === 0;
    }

    function shiftMonth(delta) {
      const fromInput = document.getElementById('iobios-date-from');
      const toInput   = document.getElementById('iobios-date-to');
      const d = window.__iobios.fromDateInput(fromInput.value);
      const base = new Date(d.getFullYear(), d.getMonth() + delta, 1);
      fromInput.value = window.__iobios.toDateInputValue(base);
      toInput.value   = window.__iobios.toDateInputValue(new Date(base.getFullYear(), base.getMonth() + 1, 0));
      _cachedData = null;
      _manualInclude   = new Set();
      _manualExclude   = new Set();
      _markedForDelete = new Map();
      _customHours     = new Map();
      _customProjects  = new Map();
      _editingRows     = new Set();
      updatePreview(true);
    }

    document.getElementById('iobios-preview').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const key     = btn.dataset.date;
      const project = btn.dataset.project;
      if (!key) return;

      if (btn.classList.contains('iobios-toggle-delete')) {
        const allocs = _cachedData && _cachedData.existingMap.get(key);
        if (allocs) _markedForDelete.set(key, allocs);
      } else if (btn.classList.contains('iobios-toggle-undelete')) {
        _markedForDelete.delete(key);
      } else if (btn.classList.contains('iobios-toggle-include')) {
        if (project) {
          // Re-include a specific excluded project row
          _manualExclude.delete(`${key}::${project}`);
        } else {
          // Force-include whole day (naturally excluded or full days)
          _manualInclude.add(key);
          for (const excKey of [..._manualExclude]) {
            if (excKey.startsWith(`${key}::`)) _manualExclude.delete(excKey);
          }
        }
      } else if (btn.classList.contains('iobios-toggle-exclude') && project) {
        _manualExclude.add(`${key}::${project}`);
      } else if (btn.classList.contains('iobios-toggle-edit')) {
        _editingRows.add(`${key}::${project}`);
      } else if (btn.classList.contains('iobios-cancel-edit')) {
        _editingRows.delete(`${key}::${project}`);
      } else if (btn.classList.contains('iobios-save-edit')) {
        const row = btn.closest('.iobios-preview-row');
        const hoursInput = row && row.querySelector('.iobios-alloc-hours-input:not([disabled])');
        const newHours = hoursInput ? parseFloat(hoursInput.value) : NaN;
        if (!isNaN(newHours) && newHours > 0) {
          const allocs = _cachedData.existingMap.get(key);
          const alloc = allocs && allocs.find(a => a.project === project);
          if (alloc) {
            btn.disabled = true;
            btn.textContent = '⏳';
            const res = await window.__iobios.timeAllocationsDb.updateAllocation(alloc, newHours);
            if (res.ok) {
              alloc.hours = window.__iobios.hoursToHHMMSS(newHours);
              _editingRows.delete(`${key}::${project}`);
              window.__iobios.showToast('✏ 1 actualizado', 'success');
            } else {
              btn.disabled = false;
              btn.textContent = '✓';
              window.__iobios.showToast('Error al guardar', 'error');
            }
            renderList(document.getElementById('iobios-preview'), config);
            return;
          }
        }
      }
      renderList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-preview').addEventListener('change', (e) => {
      const hoursInput   = e.target.closest('input.iobios-alloc-hours-input:not([disabled])');
      const projectInput = e.target.closest('input.iobios-alloc-project-input:not([disabled])');

      if (hoursInput) {
        const key     = hoursInput.dataset.date;
        const project = hoursInput.dataset.project;
        const val     = parseFloat(hoursInput.value);
        if (key && project && !isNaN(val) && val > 0) {
          _customHours.set(`${key}::${project}`, val);
          // Update day label in-place to avoid replacing the DOM mid-edit
          if (_cachedData) {
            const date = new Date(key);
            const dayAllocs = _cachedData.existingMap.get(key) || [];
            const existingProjects = new Set(dayAllocs.map(a => a.project));
            const maxH = config.rules.maxHoursPerDay || 8;
            const inSummer = isSummerDate(date);
            const dayMaxH  = (inSummer && config.summerSchedule?.hours) ? config.summerSchedule.hours : maxH;
            const totalExistH = dayAllocs.reduce((sum, a) => {
              const ek = `${key}::${a.project}`;
              return sum + (_editingRows.has(ek) && _customHours.has(ek)
                ? _customHours.get(ek) : parseHoursFromHHMMSS(a.hours));
            }, 0);
            const missingAllocs = config.timeAllocations.filter(a => !existingProjects.has(a.project));
            const isDayFull = totalExistH >= maxH && !_manualInclude.has(key);
            const naturallyExcluded = _cachedData.holidaySet.has(key) || _cachedData.vacationSet.has(key) ||
              (config.rules.skipWeekends && (date.getDay() === 0 || date.getDay() === 6)) ||
              date > new Date();
            const showMissingRows = !naturallyExcluded && !isDayFull;
            const totalNewH = showMissingRows
              ? missingAllocs.filter(a => !_manualExclude.has(`${key}::${a.project}`))
                  .reduce((sum, a) => sum + Number(_customHours.get(`${key}::${a.project}`) ?? a.hours), 0)
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
          _customProjects.set(`${key}::${project}`, val);
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
      renderList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-date-from').addEventListener('change', () => { _cachedData = null; updatePreview(true); });
    document.getElementById('iobios-date-to').addEventListener('change',   () => { _cachedData = null; updatePreview(true); });
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
            _cachedData = null;
            window.__iobios.timeAllocationsDb.clearCache();
            updatePreview(true);
          }
        }, 2000);
      });
    }

    updatePreview(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function saveTimeAllocations(config) {
    const fromVal = document.getElementById('iobios-date-from').value;
    const toVal   = document.getElementById('iobios-date-to').value;
    if (!fromVal || !toVal) { window.__iobios.closePanel(); return; }

    const saveBtn = document.getElementById('iobios-panel-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }

    const dateFrom = window.__iobios.fromDateInput(fromVal);
    const dateTo   = window.__iobios.fromDateInput(toVal);
    const email    = window.__iobios.getCurrentUserEmail();

    // Deletions
    let deleted = 0, deleteErrors = 0;
    for (const [, allocs] of _markedForDelete) {
      for (const alloc of allocs) {
        const res = await window.__iobios.timeAllocationsDb.deleteAllocation(alloc);
        if (res.ok) deleted++; else deleteErrors++;
      }
    }

    // Insertions
    const [dates, existing, vacations] = await Promise.all([
      window.__iobios.buildDateRange(dateFrom, dateTo, { ...config.rules, skipHolidays: true }),
      window.__iobios.timeAllocationsDb.getAllocations({ dateFrom, dateTo }),
      window.__iobios.getApprovedVacations(email),
    ]);

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
    const vacationSet  = new Set(vacations.map(v => v.toDateString()));

    // Dates eligible from the range (not deleted this session)
    const allEligible = dates.filter(d => !_markedForDelete.has(d.toDateString()));

    // Force-included dates not already covered by allEligible
    const manualOnly = [..._manualInclude]
      .map(k => new Date(k))
      .filter(d => !allEligible.some(e => e.toDateString() === d.toDateString()));

    const candidateDates = [
      ...allEligible.filter(d => !vacationSet.has(d.toDateString())),
      ...manualOnly,
    ];

    let ok = 0, errors = 0;
    for (const date of candidateDates) {
      const dateKey = date.toDateString();
      for (const alloc of config.timeAllocations) {
        const compositeKey = `${dateKey}::${alloc.project}`;
        if (existingKeys.has(compositeKey)) continue;                          // already in DB
        if (_manualExclude.has(compositeKey)) continue;                        // manually excluded
        if (fullDates.has(dateKey) && !_manualInclude.has(dateKey)) continue; // day is full

        const hours   = _customHours.get(compositeKey) ?? alloc.hours;
        const project = _customProjects.get(compositeKey) ?? alloc.project;
        const res = await window.__iobios.timeAllocationsDb.createAllocation(
          date, project, window.__iobios.hoursToHHMMSS(hours)
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

  // ── Expose ────────────────────────────────────────────────────────────────

  window.__iobios = window.__iobios || {};
  window.__iobios.renderTimeAllocationsBody = renderTimeAllocationsBody;
  window.__iobios.saveTimeAllocations = saveTimeAllocations;

})();
