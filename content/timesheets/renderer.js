'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  function isSummerDate(d, config) {
    const ss = config.summerSchedule;
    if (!ss || !ss.start || !ss.end) return false;
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return md >= ss.start && md <= ss.end;
  }

  // ── renderList ────────────────────────────────────────────────────────────

  function renderList(preview, config) {
    const _s = window.__iobios._tsState;
    const { allDates, holidaySet, holidayNameMap, vacationSet, leaveSet, leaveDetailMap, existingMap } = _s.cachedData;

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
      const isLeave    = leaveSet.has(key);
      const isExisting = existingMap.has(key);
      const forced     = _s.manualInclude.has(key);
      const skipped    = _s.manualExclude.has(key);
      const toDelete   = _s.markedForDelete.has(key);

      const isFuture = date > new Date();
      const naturallyExcluded = (config.rules.skipWeekends && isWeekend) || isHoliday || isVacation || isLeave || isFuture;
      const willInsert = !isExisting && (forced || (!skipped && !naturallyExcluded));

      const inSummer = isSummerDate(date, config);
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
        } else if (_s.editingRows.has(key)) {
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
        // Absence indicator: shown even when the day has an existing timesheet
        if ((isHoliday || isVacation || isLeave || isWeekend) && !forced) {
          const absenceStatusClass = isLeave    ? 'iobios-status-leave'
            : isVacation ? 'iobios-status-holiday-absence'
            : isHoliday  ? 'iobios-status-bank-holiday'
            : 'iobios-status-weekend';
          const absenceBadgeLabel = isLeave    ? (leaveDetailMap.get(key) || 'Permiso/Baja')
            : isVacation ? 'Vacaciones'
            : isHoliday  ? 'Festivo'
            : 'Fin de semana';
          const absenceBadgeClass = isLeave    ? 'iobios-badge-leave'
            : isVacation ? 'iobios-badge-holiday-absence'
            : isHoliday  ? 'iobios-badge-bank-holiday'
            : 'iobios-badge-weekend';
          const absenceDetail = isHoliday ? (holidayNameMap.get(key) || '') : '';
          html += `<div class="iobios-preview-row ${absenceStatusClass}">
            <span class="iobios-preview-date iobios-date-continuation"></span>
            <span class="iobios-preview-badge ${absenceBadgeClass}">${absenceBadgeLabel}</span>
            ${absenceDetail ? `<span class="iobios-preview-detail">${absenceDetail}</span>` : ''}
          </div>`;
        }
      } else if (willInsert) {
        insertCount++;
        const h = _s.customHours.get(key) || config.timeSheets;
        const p1 = h.period1;
        // Apply summer -1h to clockOut2 only when not manually overridden
        const p2base = h.period2;
        const p2 = (inSummer && !_s.customHours.has(key))
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
        const statusClass = isLeave    ? 'iobios-status-leave'
          : isVacation ? 'iobios-status-holiday-absence'
          : isHoliday  ? 'iobios-status-bank-holiday'
          : isWeekend  ? 'iobios-status-weekend'
          : 'iobios-status-excluded';
        const badgeLabel = isLeave    ? (leaveDetailMap.get(key) || 'Permiso/Baja')
          : isVacation ? 'Vacaciones'
          : isHoliday  ? 'Festivo'
          : isWeekend  ? 'Fin de semana'
          : isFuture   ? 'Futuro' : 'Excluido';
        const badgeClass = isLeave    ? 'iobios-badge-leave'
          : isVacation ? 'iobios-badge-holiday-absence'
          : isHoliday  ? 'iobios-badge-bank-holiday'
          : isWeekend  ? 'iobios-badge-weekend' : 'iobios-badge-excluded';
        const detailText = isHoliday ? (holidayNameMap.get(key) || '') : '';
        html += `<div class="iobios-preview-row ${statusClass}${key === todayKey ? ' iobios-today' : ''}">
          <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
          <span class="iobios-preview-badge ${badgeClass}">${badgeLabel}</span>
          ${detailText ? `<span class="iobios-preview-detail">${detailText}</span>` : ''}
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

  Object.assign(window.__iobios, { renderTSList: renderList });

})();
