'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // ── Helpers ──────────────────────────────────────────────────────────────

  function parseHoursFromHHMMSS(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) + (parts[1] || 0) / 60;
  }

  function fmtH(h) {
    return h % 1 === 0 ? `${h}h` : `${h.toFixed(1)}h`;
  }

  function isSummerDate(d, config) {
    const ss = config.summerSchedule;
    if (!ss || !ss.start || !ss.end) return false;
    const md = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return md >= ss.start && md <= ss.end;
  }

  // ── renderList ────────────────────────────────────────────────────────────

  function renderList(preview, config) {
    const _s = window.__iobios._taState;
    const { allDates, holidaySet, holidayNameMap, vacationSet, leaveSet, leaveDetailMap, existingMap } = _s.cachedData;
    const todayKey    = new Date().toDateString();
    let insertRecords = 0;
    let insertDays    = 0;
    let deleteCount   = 0;
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
      const isLeave    = leaveSet.has(key);
      const forced     = _s.manualInclude.has(key);

      const isFuture = date > new Date();
      const naturallyExcluded = (config.rules.skipWeekends && isWeekend) || isHoliday || isVacation || isLeave || isFuture;
      const daySkipped = naturallyExcluded && !forced;

      const dayAllocs = existingMap.get(key) || [];
      const manualRowsForDay = _s.manualRows.get(key) || [];
      const existingProjects = new Set(dayAllocs.map(a => a.project));

      // Config projects not yet in DB for this day
      const missingAllocs = config.timeAllocations.filter(a => !existingProjects.has(a.project));

      const hasExisting        = dayAllocs.length > 0;
      const totalExistingHours = dayAllocs.reduce((sum, a) => {
        if (_s.markedForDelete.has(a)) return sum;
        const ek = `${key}::${a.project}`;
        return sum + (_s.editingRows.has(ek) && _s.customHours.has(ek)
          ? _s.customHours.get(ek)
          : parseHoursFromHHMMSS(a.hours));
      }, 0);
      const maxH               = config.rules.maxHoursPerDay || 8;
      const isDayFull          = hasExisting && totalExistingHours >= maxH && !forced;

      const inSummer = isSummerDate(date, config);
      const dayMaxH  = (inSummer && config.summerSchedule?.hours) ? config.summerSchedule.hours : maxH;

      if (!naturallyExcluded) workingDays++;
      if (hasExisting) hoursExisting += totalExistingHours;

      // Whether missing rows should be shown at all for this day
      const showMissingRows = !daySkipped && !isDayFull;

      // Day total hours label (first row of day)
      const totalNewH = showMissingRows
        ? missingAllocs
            .filter(a => !_s.manualExclude.has(`${key}::${a.project}`))
            .reduce((sum, a) => sum + Number(_s.customHours.get(`${key}::${a.project}`) ?? a.hours), 0)
        : 0;
      const totalManualH = manualRowsForDay.reduce((s, r) => s + Number(r.hours || 0), 0);
      const totalDayH = totalExistingHours + totalNewH + totalManualH;
      const dayLabelClass = totalDayH > 24 ? ' iobios-day-hours-excess'
        : totalDayH > dayMaxH ? ' iobios-day-hours-warning'
        : '';
      const dayRowClass = totalDayH > 24 ? ' iobios-24h-excess' : '';
      const dayLabelHtml = totalDayH > 0
        ? `<span class="iobios-day-hours-label${dayLabelClass}" data-day="${key}">${fmtH(totalDayH)}</span>`
        : '';
      const addRowBtnHtml = `<button class="iobios-toggle-btn iobios-add-manual-row" data-date="${key}" title="Añadir imputación">+</button>`;

      if (hasExisting || (showMissingRows && missingAllocs.length > 0) || manualRowsForDay.length > 0) {
        let firstRow = true;

        const insertableCount = showMissingRows
          ? missingAllocs.filter(a => !_s.manualExclude.has(`${key}::${a.project}`)).length
          : 0;
        if (insertableCount > 0) insertDays++;

        // Existing rows (deleted, edit, or read mode)
        dayAllocs.forEach(alloc => {
          const editKey   = `${key}::${alloc.project}`;
          const isDeleted = _s.markedForDelete.has(alloc);
          const isEditing = !isDeleted && _s.editingRows.has(editKey);
          const existingH = (isEditing && _s.customHours.has(editKey))
            ? _s.customHours.get(editKey)
            : parseHoursFromHHMMSS(alloc.hours);
          if (isDeleted) {
            deleteCount++;
            html += `<div class="iobios-preview-row iobios-status-delete${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
              <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
              <span class="iobios-preview-detail">${alloc.project} — ${alloc.hours}</span>
              <span class="iobios-preview-badge iobios-badge-delete">Borrar</span>
              ${firstRow ? addRowBtnHtml : ''}
              <button class="iobios-toggle-btn iobios-toggle-undelete" data-date="${key}" data-project="${alloc.project}" data-id="${alloc.id}" title="Cancelar borrado">✕</button>
            </div>`;
          } else if (isEditing) {
            html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
              <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
              <input type="text" class="iobios-alloc-project-input iobios-alloc-hours-ro" value="${alloc.project}" disabled>
              <input type="number" class="iobios-alloc-hours-input" data-date="${key}" data-project="${alloc.project}" value="${existingH}" min="0.5" max="24" step="0.5">
              <span class="iobios-alloc-spacer"></span>
              ${firstRow ? dayLabelHtml + addRowBtnHtml : ''}
              <button class="iobios-toggle-btn iobios-save-edit" data-date="${key}" data-project="${alloc.project}" title="Guardar">✓</button>
              <button class="iobios-toggle-btn iobios-cancel-edit" data-date="${key}" data-project="${alloc.project}" title="Cancelar">✕</button>
            </div>`;
          } else {
            html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
              <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
              <input type="text" class="iobios-alloc-project-input iobios-alloc-hours-ro" value="${alloc.project}" disabled>
              <input type="number" class="iobios-alloc-hours-input iobios-alloc-hours-ro" value="${existingH}" disabled>
              <span class="iobios-alloc-spacer"></span>
              ${firstRow ? dayLabelHtml + addRowBtnHtml : ''}
              <button class="iobios-toggle-btn iobios-toggle-edit" data-date="${key}" data-project="${alloc.project}" title="Editar">✏</button>
              <button class="iobios-toggle-btn iobios-toggle-delete" data-date="${key}" data-project="${alloc.project}" data-id="${alloc.id}" title="Marcar para borrar">🗑</button>
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
            const isExcluded = _s.manualExclude.has(`${key}::${alloc.project}`);
            if (!isExcluded) {
              insertRecords++;
              const customH = _s.customHours.get(`${key}::${alloc.project}`) ?? alloc.hours;
              hoursToInsert += Number(customH);
              const isConflict = _s.conflictKeys && _s.conflictKeys.has(`${key}::${alloc.project}`);
            html += `<div class="iobios-preview-row iobios-status-new${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
                <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                <input type="text" class="iobios-alloc-project-input${isConflict ? ' iobios-input-error' : ''}" data-date="${key}" data-project="${alloc.project}" value="${_s.customProjects.get(`${key}::${alloc.project}`) ?? alloc.project}">
                <input type="number" class="iobios-alloc-hours-input" data-date="${key}" data-project="${alloc.project}" value="${customH}" min="0.5" max="24" step="0.5">
                <span class="iobios-alloc-spacer"></span>
                ${firstRow ? dayLabelHtml + addRowBtnHtml : ''}
                <button class="iobios-toggle-btn iobios-toggle-exclude" data-date="${key}" data-project="${alloc.project}" title="No añadir">✕</button>
              </div>`;
            } else {
              html += `<div class="iobios-preview-row iobios-status-excluded${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
                <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                <span class="iobios-preview-detail">${alloc.project}</span>
                <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" data-project="${alloc.project}" title="Añadir">+</button>
              </div>`;
            }
            firstRow = false;
          });
        }

        // Manual rows (user-added, not from config)
        manualRowsForDay.forEach(row => {
          if (row.project.trim()) {
            insertRecords++;
            hoursToInsert += Number(row.hours || 0);
          }
          const isManualConflict = _s.conflictKeys && _s.conflictKeys.has(`manual::${key}::${row.uid}`);
          html += `<div class="iobios-preview-row iobios-status-new${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
            <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
            <input type="text" class="iobios-manual-project-input${isManualConflict ? ' iobios-input-error' : ''}" data-date="${key}" data-uid="${row.uid}" placeholder="Proyecto" value="${row.project}">
            <input type="number" class="iobios-manual-hours-input" data-date="${key}" data-uid="${row.uid}" value="${row.hours}" min="0.5" max="24" step="0.5">
            <span class="iobios-alloc-spacer"></span>
            ${firstRow ? dayLabelHtml + addRowBtnHtml : ''}
            <button class="iobios-toggle-btn iobios-remove-manual-row" data-date="${key}" data-uid="${row.uid}" title="Eliminar fila">✕</button>
          </div>`;
          firstRow = false;
        });

        // Absence indicator: shown even when the day has existing data
        if (daySkipped && (isHoliday || isVacation || isLeave || isWeekend)) {
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
            <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" title="Incluir día">+</button>
          </div>`;
        }
      } else if (daySkipped) {
        // Naturally excluded day — show badge
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
    if (insertRecords > 0) summary.push(`${insertRecords} registro${insertRecords !== 1 ? 's' : ''} a insertar (${insertDays} día${insertDays !== 1 ? 's' : ''})`);
    if (deleteCount > 0) summary.push(`${deleteCount} imputación${deleteCount !== 1 ? 'es' : ''} a borrar`);
    const summaryText = summary.length ? summary.join(', ') : '0 cambios';

    const hoursExpected = workingDays * (config.rules.maxHoursPerDay || 8);
    const totalCovered  = hoursToInsert + hoursExisting;
    const hoursLine = hoursExpected > 0
      ? `<p class="iobios-hours-summary${totalCovered < hoursExpected ? ' iobios-hours-warning' : ''}">↑ ${fmtH(hoursToInsert)} a insertar · ✓ ${fmtH(hoursExisting)} imputadas · ⏱ ${fmtH(hoursExpected)} esperadas</p>`
      : '';

    preview.innerHTML = `<div class="iobios-preview-footer"><p class="iobios-preview-summary">${summaryText}</p>${hoursLine}</div>` + html;

    const saveBtn = document.getElementById('iobios-panel-save');
    if (saveBtn) saveBtn.disabled = (insertRecords === 0 && deleteCount === 0) || (_s.conflictKeys && _s.conflictKeys.size > 0);
  }

  Object.assign(window.__iobios, { renderTAList: renderList });

})();
