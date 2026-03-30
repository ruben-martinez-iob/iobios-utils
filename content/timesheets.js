'use strict';

(function () {

  // ── Override state (reset each time the panel opens) ─────────────────────
  let _manualInclude   = new Set(); // excluded dates forced to insert
  let _manualExclude   = new Set(); // insertable dates forced to skip
  let _markedForDelete = new Map(); // dateStr → timesheet object
  let _customHours     = new Map(); // dateStr → { period1, period2 }
  let _editingRows     = new Set(); // dateStr keys for rows in edit mode

  // ── Panel body ───────────────────────────────────────────────────────────

  function renderTimeSheetsBody(container, config) {
    _manualInclude   = new Set();
    _manualExclude   = new Set();
    _markedForDelete = new Map();
    _customHours     = new Map();
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
          window.__iobios.timeSheetsDb.getTimesheets({ dateFrom, dateTo }),
        ]);
        const allDates = [];
        const cur = new Date(dateFrom);
        while (cur <= dateTo) { allDates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

        // Map dateStr → timesheet for existing rows (needed for delete)
        const existingMap = new Map(existing.map(t => [t.date.toDateString(), t]));

        _cachedData = {
          allDates,
          holidaySet:  new Set(holidays.map(h => h.date.toDateString())),
          vacationSet: new Set(vacations.map(v => v.toDateString())),
          existingMap,
        };
      }

      try {
        renderList(document.getElementById('iobios-preview'), config);
      } catch (e) {
        console.error('[ioBios] timesheets renderList error:', e);
        document.getElementById('iobios-preview').innerHTML =
          `<p class="iobios-preview-empty">Error al cargar la lista: ${e.message}</p>`;
      }
    }

    function renderList(preview, config) {
      const { allDates, holidaySet, vacationSet, existingMap } = _cachedData;
      function periodH(cin, cout) {
        if (!cin || !cout) return 0;
        const [hi, mi] = cin.split(':').map(Number);
        const [ho, mo] = cout.split(':').map(Number);
        return Math.max(0, (ho * 60 + mo - hi * 60 - mi) / 60);
      }

      function fmtH(h) {
        return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
      }

      function subtractOneHour(time) {
        if (!time) return time;
        const [h, m] = time.split(':').map(Number);
        const total = h * 60 + m - 60;
        return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      }

      function dayHoursClass(h, maxH) {
        if (h > maxH)        return ' iobios-day-hours-excess';
        if (h < maxH * 0.99) return ' iobios-day-hours-warning';
        return '';
      }

      const defaultDayH = periodH(config.timeSheets?.period1?.clockIn, config.timeSheets?.period1?.clockOut)
        + periodH(config.timeSheets?.period2?.clockIn, config.timeSheets?.period2?.clockOut);

      const todayKey    = new Date().toDateString();
      let insertCount   = 0;
      let deleteCount   = 0;
      let hoursToInsert = 0;
      let hoursExisting = 0;
      let hoursExpected = 0;
      let html = '<div class="iobios-preview-list">';

      for (const date of allDates) {
        const key        = date.toDateString();
        const dow        = date.getDay();
        const isWeekend  = dow === 0 || dow === 6;
        const isHoliday  = holidaySet.has(key);
        const isVacation = vacationSet.has(key);
        const isExisting = existingMap.has(key);
        const forced     = _manualInclude.has(key);
        const skipped    = _manualExclude.has(key);
        const toDelete   = _markedForDelete.has(key);

        const isFuture = date > new Date();
        const naturallyExcluded = (config.rules.skipWeekends && isWeekend) || isHoliday || isVacation || isFuture;
        const willInsert = !isExisting && (forced || (!skipped && !naturallyExcluded));

        const inSummer = isSummerDate(date);
        const dayExpectedH = defaultDayH > 0 ? (inSummer ? defaultDayH - 1 : defaultDayH) : 0;
        const dayMaxH = (inSummer && config.summerSchedule?.hours) ? config.summerSchedule.hours : (config.rules.maxHoursPerDay || 8);
        if (!naturallyExcluded) hoursExpected += dayExpectedH || dayMaxH;

        if (isExisting) {
          const ts = existingMap.get(key);
          const ci1 = (ts.clockIn1  || '').slice(0, 5);
          const co1 = (ts.clockOut1 || '').slice(0, 5);
          const ci2 = (ts.clockIn2  || '').slice(0, 5);
          const co2 = (ts.clockOut2 || '').slice(0, 5);

          const dayH = periodH(ci1, co1) + periodH(ci2, co2);
          const hoursLabel = dayH > 0
            ? `<span class="iobios-day-hours-label${dayHoursClass(dayH, dayMaxH)}">${fmtH(dayH)}</span>`
            : '';
          if (toDelete) {
            deleteCount++;
            html += `<div class="iobios-preview-row iobios-status-delete${key === todayKey ? ' iobios-today' : ''}">
              <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
              <span class="iobios-hours-inputs">
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${ci1}" disabled>
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${co1}" disabled>
                <span class="iobios-hours-sep">/</span>
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${ci2}" disabled>
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${co2}" disabled>
                ${hoursLabel}
              </span>
              <span class="iobios-preview-badge iobios-badge-delete">Borrar</span>
              <button class="iobios-toggle-btn iobios-toggle-undelete" data-date="${key}" title="Cancelar borrado">✕</button>
            </div>`;
          } else if (_editingRows.has(key)) {
            hoursExisting += dayH;
            html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey ? ' iobios-today' : ''}">
              <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
              <span class="iobios-hours-inputs">
                <input type="time" class="iobios-time-input" data-date="${key}" data-field="clockIn1" value="${ci1}">
                <input type="time" class="iobios-time-input" data-date="${key}" data-field="clockOut1" value="${co1}">
                <span class="iobios-hours-sep">/</span>
                <input type="time" class="iobios-time-input" data-date="${key}" data-field="clockIn2" value="${ci2}">
                <input type="time" class="iobios-time-input" data-date="${key}" data-field="clockOut2" value="${co2}">
                ${hoursLabel}
              </span>
              <button class="iobios-toggle-btn iobios-save-edit" data-date="${key}" title="Guardar">✓</button>
              <button class="iobios-toggle-btn iobios-cancel-edit" data-date="${key}" title="Cancelar">✕</button>
            </div>`;
          } else {
            hoursExisting += dayH;
            html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey ? ' iobios-today' : ''}">
              <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
              <span class="iobios-hours-inputs">
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${ci1}" disabled>
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${co1}" disabled>
                <span class="iobios-hours-sep">/</span>
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${ci2}" disabled>
                <input type="time" class="iobios-time-input iobios-time-input-ro" value="${co2}" disabled>
                ${hoursLabel}
              </span>
              <button class="iobios-toggle-btn iobios-toggle-edit" data-date="${key}" title="Editar">✏</button>
              <button class="iobios-toggle-btn iobios-toggle-delete" data-date="${key}" title="Marcar para borrar">🗑</button>
            </div>`;
          }
        } else if (willInsert) {
          insertCount++;
          const h = _customHours.get(key) || config.timeSheets;
          const p1 = h.period1;
          // Apply summer -1h to clockOut2 only when not manually overridden
          const p2base = h.period2;
          const p2 = (inSummer && !_customHours.has(key))
            ? { ...p2base, clockOut: subtractOneHour(p2base.clockOut) }
            : p2base;
          const dayH = periodH(p1.clockIn, p1.clockOut) + periodH(p2.clockIn, p2.clockOut);
          hoursToInsert += dayH;
          const hoursLabel = dayH > 0
            ? `<span class="iobios-day-hours-label${dayHoursClass(dayH, dayMaxH)}">${fmtH(dayH)}</span>`
            : '';
          html += `<div class="iobios-preview-row iobios-status-new${key === todayKey ? ' iobios-today' : ''}">
            <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
            <span class="iobios-hours-inputs">
              <input type="time" class="iobios-time-input" data-date="${key}" data-period="1" data-field="clockIn"  value="${p1.clockIn}">
              <input type="time" class="iobios-time-input" data-date="${key}" data-period="1" data-field="clockOut" value="${p1.clockOut}">
              <span class="iobios-hours-sep">/</span>
              <input type="time" class="iobios-time-input" data-date="${key}" data-period="2" data-field="clockIn"  value="${p2.clockIn}">
              <input type="time" class="iobios-time-input" data-date="${key}" data-period="2" data-field="clockOut" value="${p2.clockOut}">
              ${hoursLabel}
            </span>
            <button class="iobios-toggle-btn iobios-toggle-exclude" data-date="${key}" title="Excluir">✕</button>
          </div>`;
        } else {
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
      if (insertCount > 0) summary.push(`${insertCount} a insertar`);
      if (deleteCount > 0) summary.push(`${deleteCount} a borrar`);
      const summaryText = summary.length ? summary.join(', ') : '0 cambios';

      const totalCovered  = hoursToInsert + hoursExisting;
      const hoursLine = hoursExpected > 0
        ? `<p class="iobios-hours-summary${totalCovered < hoursExpected ? ' iobios-hours-warning' : ''}">↑ ${fmtH(hoursToInsert)} a insertar · ✓ ${fmtH(hoursExisting)} imputadas · ⏱ ${fmtH(hoursExpected)} esperadas</p>`
        : '';

      preview.innerHTML = `<div class="iobios-preview-footer"><p class="iobios-preview-summary">${summaryText}</p>${hoursLine}</div>` + html;

      const saveBtn = document.getElementById('iobios-panel-save');
      if (saveBtn) saveBtn.disabled = insertCount === 0 && deleteCount === 0;
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
      _editingRows     = new Set();
      updatePreview(true);
    }

    document.getElementById('iobios-preview').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const key = btn.dataset.date;
      if (!key) return;

      if (btn.classList.contains('iobios-toggle-delete')) {
        const ts = _cachedData && _cachedData.existingMap.get(key);
        if (ts) _markedForDelete.set(key, ts);
      } else if (btn.classList.contains('iobios-toggle-undelete')) {
        _markedForDelete.delete(key);
      } else if (btn.classList.contains('iobios-toggle-include')) {
        _manualInclude.add(key);
        _manualExclude.delete(key);
      } else if (btn.classList.contains('iobios-toggle-exclude')) {
        _manualExclude.add(key);
        _manualInclude.delete(key);
      } else if (btn.classList.contains('iobios-toggle-edit')) {
        _editingRows.add(key);
      } else if (btn.classList.contains('iobios-cancel-edit')) {
        _editingRows.delete(key);
      } else if (btn.classList.contains('iobios-save-edit')) {
        const row = btn.closest('.iobios-preview-row');
        const getVal = (field) => (row.querySelector(`[data-field="${field}"]`) || {}).value || '';
        const newTimes = {
          clockIn1:  getVal('clockIn1'),  clockOut1: getVal('clockOut1'),
          clockIn2:  getVal('clockIn2'),  clockOut2: getVal('clockOut2'),
        };
        const ts = _cachedData && _cachedData.existingMap.get(key);
        if (ts) {
          btn.disabled = true;
          btn.textContent = '⏳';
          const res = await window.__iobios.timeSheetsDb.updateTimesheet(ts, newTimes);
          if (res.ok) {
            ts.clockIn1  = newTimes.clockIn1;  ts.clockOut1 = newTimes.clockOut1;
            ts.clockIn2  = newTimes.clockIn2;  ts.clockOut2 = newTimes.clockOut2;
            _editingRows.delete(key);
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
      renderList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-preview').addEventListener('change', (e) => {
      const input = e.target.closest('input.iobios-time-input');
      if (!input) return;
      const key    = input.dataset.date;
      const period = input.dataset.period;
      const field  = input.dataset.field;
      // Only update _customHours and re-render for insert rows (data-period present).
      // Edit-mode existing rows use data-field only — update label in place to avoid resetting inputs.
      if (!period) {
        const row = input.closest('.iobios-preview-row');
        if (!row) return;
        const getV = f => row.querySelector(`[data-field="${f}"]`)?.value || '';
        const calcH = (cin, cout) => {
          if (!cin || !cout) return 0;
          const [hi, mi] = cin.split(':').map(Number);
          const [ho, mo] = cout.split(':').map(Number);
          return Math.max(0, (ho * 60 + mo - hi * 60 - mi) / 60);
        };
        const dayH = calcH(getV('clockIn1'), getV('clockOut1')) + calcH(getV('clockIn2'), getV('clockOut2'));
        const inSummer = isSummerDate(new Date(key));
        const maxH = (inSummer && config.summerSchedule?.hours) ? config.summerSchedule.hours : (config.rules.maxHoursPerDay || 8);
        const labelClass = dayH > maxH ? ' iobios-day-hours-excess' : dayH < maxH * 0.99 ? ' iobios-day-hours-warning' : '';
        const label = row.querySelector('.iobios-day-hours-label');
        if (label) {
          label.textContent = dayH % 1 === 0 ? `${dayH}h` : `${dayH.toFixed(1)}h`;
          label.className = 'iobios-day-hours-label' + labelClass;
        }
        return;
      }
      // insert rows: save to _customHours but defer re-render to focusout
      // to avoid the DOM being replaced while the user is still typing minutes
      const base   = _customHours.get(key) || {
        period1: { ...config.timeSheets.period1 },
        period2: { ...config.timeSheets.period2 },
      };
      base[`period${period}`][field] = input.value;
      _customHours.set(key, base);
    });

    // Re-render insert rows only when focus leaves the day's time inputs
    document.getElementById('iobios-preview').addEventListener('focusout', (e) => {
      const input = e.target.closest('input.iobios-time-input[data-period]');
      if (!input) return;
      // If focus moves to another time input for the same day, keep editing without re-render
      const next = e.relatedTarget;
      if (next && next.matches('input.iobios-time-input') && next.dataset.date === input.dataset.date) return;
      renderList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-date-from').addEventListener('change', () => { _cachedData = null; updatePreview(true); });
    document.getElementById('iobios-date-to').addEventListener('change',   () => { _cachedData = null; updatePreview(true); });
    document.getElementById('iobios-month-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('iobios-month-next').addEventListener('click', () => shiftMonth(+1));
    updatePreview(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function saveTimeSheets(config) {
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
    for (const [, ts] of _markedForDelete) {
      const res = await window.__iobios.timeSheetsDb.deleteTimesheet(ts);
      if (res.ok) deleted++; else deleteErrors++;
    }

    // Insertions
    const [dates, existing, vacations] = await Promise.all([
      window.__iobios.buildDateRange(dateFrom, dateTo, { ...config.rules, skipHolidays: true }),
      window.__iobios.timeSheetsDb.getTimesheets({ dateFrom, dateTo }),
      window.__iobios.getApprovedVacations(email),
    ]);
    const existingDates = new Set(existing.map(t => t.date.toDateString()));
    const vacationSet   = new Set(vacations.map(v => v.toDateString()));

    const allEligible = dates.filter(d =>
      !existingDates.has(d.toDateString()) && !_markedForDelete.has(d.toDateString())
    );
    const manualOnly = [..._manualInclude]
      .map(k => new Date(k))
      .filter(d => !existingDates.has(d.toDateString()) && !allEligible.some(e => e.toDateString() === d.toDateString()));

    const toInsert = [
      ...allEligible.filter(d => !vacationSet.has(d.toDateString()) && !_manualExclude.has(d.toDateString())),
      ...manualOnly,
    ];

    let ok = 0, errors = 0;
    for (const date of toInsert) {
      const h = _customHours.get(date.toDateString()) || config.timeSheets;
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

  // ── Expose ────────────────────────────────────────────────────────────────

  window.__iobios = window.__iobios || {};
  window.__iobios.renderTimeSheetsBody = renderTimeSheetsBody;
  window.__iobios.saveTimeSheets = saveTimeSheets;

})();
