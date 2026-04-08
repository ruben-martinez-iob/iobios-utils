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
      
      // Get or create rowState for this day
      const rowState = _s.rowStates.get(key);
      if (!rowState) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Reset time to start of day
        const todayStr = today.toDateString();
        
        const originalState = {
          isWeekend, isHoliday, isVacation, isLeave,
          isFuture: key !== todayStr && date > today, // Compare with today at 00:00:00
          holidayName: holidayNameMap.get(key) || '',
          leaveDetail: leaveDetailMap.get(key) || '',
          inAddList: false
        };
        _s.rowStates.set(key, {
          originalState: {...originalState},
          inAddList: false
        });
      }
      
      // Re-fetch after potential creation
      const finalRowState = _s.rowStates.get(key);
      const { inAddList, originalState: original } = finalRowState;
      const isFuture = original.isFuture;
      const naturallyExcluded = original.isHoliday || original.isVacation || original.isLeave || (config.rules.skipWeekends && original.isWeekend) || original.isFuture;
      const daySkipped = naturallyExcluded && !inAddList;

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
      const isDayFull          = hasExisting && totalExistingHours >= maxH && !inAddList;

      const inSummer = isSummerDate(date, config);
      const dayMaxH  = (inSummer && config.summerSchedule?.hours) ? config.summerSchedule.hours : maxH;

      if (!naturallyExcluded) workingDays++;
      if (hasExisting) hoursExisting += totalExistingHours;

      // Whether missing rows should be shown at all for this day
      const showMissingRows = !daySkipped && !isDayFull;

      // Helper: is a missing alloc project excluded (customHours === 0)?
      const isProjectExcluded = (proj) => {
        const ek = `${key}::${proj}`;
        return _s.customHours.has(ek) && Number(_s.customHours.get(ek)) === 0;
      };

      // Day total hours label (first row of day)
      const totalNewH = showMissingRows
        ? missingAllocs
            .filter(a => !isProjectExcluded(a.project))
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
        let addRowBtnPlaced = false; // track separately: only place on active (non-excluded) rows

        const insertableCount = showMissingRows
          ? missingAllocs.filter(a => !isProjectExcluded(a.project)).length
          : 0;
        if (insertableCount > 0) insertDays++;

        // For naturally excluded days included manually (inAddList=true): show the absence
        // badge row with a - button so the user can remove the day from the add list.
        if (inAddList && naturallyExcluded && !hasExisting) {
          const ibadges = [];
          const istatusClasses = [];
          const idetailTexts = [];
          if (original.isWeekend) { ibadges.push('<span class="iobios-preview-badge iobios-badge-weekend">Fin de semana</span>'); istatusClasses.push('iobios-status-weekend'); }
          if (original.isHoliday) { ibadges.push('<span class="iobios-preview-badge iobios-badge-bank-holiday">Festivo</span>'); istatusClasses.push('iobios-status-bank-holiday'); idetailTexts.push(original.holidayName || ''); }
          if (original.isVacation) { ibadges.push('<span class="iobios-preview-badge iobios-badge-holiday-absence">Vacaciones</span>'); istatusClasses.push('iobios-status-holiday-absence'); }
          if (original.isLeave) { ibadges.push(`<span class="iobios-preview-badge iobios-badge-leave">${original.leaveDetail || 'Permiso/Baja'}</span>`); istatusClasses.push('iobios-status-leave'); idetailTexts.push(''); }
          if (original.isFuture && ibadges.length === 0) { ibadges.push('<span class="iobios-preview-badge iobios-badge-excluded">Futuro</span>'); istatusClasses.push('iobios-status-excluded'); }
          const idetailHtml = idetailTexts.map(t => t ? `<span class="iobios-preview-detail">${t}</span>` : '').join(' ');
          html += `<div class="iobios-preview-row ${istatusClasses.join(' ')}${key === todayKey ? ' iobios-today' : ''}">
            <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
            ${ibadges.join(' ')}${idetailHtml}
            <button class="iobios-toggle-btn iobios-toggle-exclude" data-date="${key}" title="Quitar inclusión manual">-</button>
          </div>`;
          firstRow = false;
        }

        // Existing rows (deleted, edit, or read mode)
        dayAllocs.forEach(alloc => {
          const editKey   = `${key}::${alloc.project}`;
          const isDeleted = _s.markedForDelete.has(alloc);
          const isEditing = !isDeleted && _s.editingRows.has(editKey);
          const existingH = (isEditing && _s.customHours.has(editKey))
            ? _s.customHours.get(editKey)
            : parseHoursFromHHMMSS(alloc.hours);
          const addBtn = !addRowBtnPlaced ? addRowBtnHtml : '';
          if (!addRowBtnPlaced) addRowBtnPlaced = true;
          if (isDeleted) {
            deleteCount++;
            html += `<div class="iobios-preview-row iobios-status-delete${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
              <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
              <span class="iobios-preview-detail">${alloc.project} — ${alloc.hours}</span>
              <span class="iobios-preview-badge iobios-badge-delete">Borrar</span>
              ${addBtn}
              <button class="iobios-toggle-btn iobios-toggle-undelete" data-date="${key}" data-project="${alloc.project}" data-id="${alloc.id}" title="Cancelar borrado">✕</button>
            </div>`;
          } else if (isEditing) {
            html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
              <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
              <input type="text" class="iobios-alloc-project-input iobios-alloc-hours-ro" value="${alloc.project}" disabled>
              <input type="number" class="iobios-alloc-hours-input" data-date="${key}" data-project="${alloc.project}" value="${existingH}" min="0.5" max="24" step="0.5">
              <span class="iobios-alloc-spacer"></span>
              ${firstRow ? dayLabelHtml : ''}${addBtn}
              <button class="iobios-toggle-btn iobios-save-edit" data-date="${key}" data-project="${alloc.project}" title="Guardar">✓</button>
              <button class="iobios-toggle-btn iobios-cancel-edit" data-date="${key}" data-project="${alloc.project}" title="Cancelar">✕</button>
            </div>`;
          } else {
            html += `<div class="iobios-preview-row iobios-status-existing${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
              <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
              <input type="text" class="iobios-alloc-project-input iobios-alloc-hours-ro" value="${alloc.project}" disabled>
              <input type="number" class="iobios-alloc-hours-input iobios-alloc-hours-ro" value="${existingH}" disabled>
              <span class="iobios-alloc-spacer"></span>
              ${firstRow ? dayLabelHtml : ''}${addBtn}
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

        // Missing alloc rows: show if day is not skipped and not full
        if (showMissingRows) {
          missingAllocs.forEach(alloc => {
            const excludeKey = `${key}::${alloc.project}`;
            const customH = _s.customHours.get(excludeKey) ?? alloc.hours;
            const isExcluded = isProjectExcluded(alloc.project);

            if (isExcluded) {
              // Excluded row: white bg, no addRowBtn, just date + spacer + re-include button
              html += `<div class="iobios-preview-row${key === todayKey && firstRow ? ' iobios-today' : ''}">
                <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                <span class="iobios-alloc-spacer"></span>
                ${firstRow ? dayLabelHtml : ''}
                <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" data-project="${alloc.project}" title="Incluir proyecto">+</button>
              </div>`;
            } else {
              insertRecords++;
              hoursToInsert += Number(customH);
              const isConflict = _s.conflictKeys && _s.conflictKeys.has(excludeKey);
              const addBtn = !addRowBtnPlaced ? addRowBtnHtml : '';
              if (!addRowBtnPlaced) addRowBtnPlaced = true;
              html += `<div class="iobios-preview-row iobios-status-new${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
                <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
                <input type="text" class="iobios-alloc-project-input${isConflict ? ' iobios-input-error' : ''}" data-date="${key}" data-project="${alloc.project}" value="${_s.customProjects.get(excludeKey) ?? alloc.project}">
                <input type="number" class="iobios-alloc-hours-input" data-date="${key}" data-project="${alloc.project}" value="${customH}" min="0.5" max="24" step="0.5">
                <span class="iobios-alloc-spacer"></span>
                ${firstRow ? dayLabelHtml : ''}${addBtn}
                <button class="iobios-toggle-btn iobios-toggle-exclude" data-date="${key}" data-project="${alloc.project}" title="Quitar proyecto">✕</button>
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
          const addBtn = !addRowBtnPlaced ? addRowBtnHtml : '';
          if (!addRowBtnPlaced) addRowBtnPlaced = true;
          html += `<div class="iobios-preview-row iobios-status-new${key === todayKey && firstRow ? ' iobios-today' : ''}${dayRowClass}">
            <span class="iobios-preview-date${!firstRow ? ' iobios-date-continuation' : ''}">${firstRow ? window.__iobios.formatDayLabel(date) : ''}</span>
            <input type="text" class="iobios-manual-project-input${isManualConflict ? ' iobios-input-error' : ''}" data-date="${key}" data-uid="${row.uid}" placeholder="Proyecto" value="${row.project}">
            <input type="number" class="iobios-manual-hours-input" data-date="${key}" data-uid="${row.uid}" value="${row.hours}" min="0.5" max="24" step="0.5">
            <span class="iobios-alloc-spacer"></span>
            ${firstRow ? dayLabelHtml : ''}${addBtn}
            <button class="iobios-toggle-btn iobios-remove-manual-row" data-date="${key}" data-uid="${row.uid}" title="Eliminar fila">✕</button>
          </div>`;
          firstRow = false;
        });

        // Absence indicator: shown even when the day has existing data
        if (daySkipped && (isHoliday || isVacation || isLeave || isWeekend)) {
          const badges = [];
          const statusClasses = [];
          const detailTexts = [];
          
          if (isHoliday) {
            badges.push('<span class="iobios-preview-badge iobios-badge-bank-holiday">Festivo</span>');
            statusClasses.push('iobios-status-bank-holiday');
            detailTexts.push(holidayNameMap.get(key) || '');
          }
          if (isVacation) {
            badges.push('<span class="iobios-preview-badge iobios-badge-holiday-absence">Vacaciones</span>');
            statusClasses.push('iobios-status-holiday-absence');
          }
          if (isLeave) {
            badges.push('<span class="iobios-preview-badge iobios-badge-leave">' + (leaveDetailMap.get(key) || 'Permiso/Baja') + '</span>');
            statusClasses.push('iobios-status-leave');
            detailTexts.push('');
          }
          if (isWeekend) {
            badges.push('<span class="iobios-preview-badge iobios-badge-weekend">Fin de semana</span>');
            statusClasses.push('iobios-status-weekend');
          }
          
          const allBadges = badges.join(' ');
          const allStatusClasses = statusClasses.join(' ');
          const allDetailTexts = detailTexts.map(text => text ? `<span class="iobios-preview-detail">${text}</span>` : '').join(' ');
          
          html += `<div class="iobios-preview-row ${allStatusClasses}">
            <span class="iobios-preview-date iobios-date-continuation"></span>
            <span class="iobios-preview-badge">${allBadges}</span>
            ${allDetailTexts}
            <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" title="${inAddList ? 'Quitar inclusión manual' : 'Incluir día'}">${inAddList ? '-' : '+'}</button>
          </div>`;
        }
      } else if (daySkipped) {
        // Naturally excluded day — show badge with correct priority order
        const badges = [];
        const statusClasses = [];
        const detailTexts = [];
        
        if (original.isWeekend) {
          badges.push('<span class="iobios-preview-badge iobios-badge-weekend">Fin de semana</span>');
          statusClasses.push('iobios-status-weekend');
        }
        if (original.isHoliday) {
          badges.push('<span class="iobios-preview-badge iobios-badge-bank-holiday">Festivo</span>');
          statusClasses.push('iobios-status-bank-holiday');
          detailTexts.push(original.holidayName || '');
        }
        if (original.isVacation) {
          badges.push('<span class="iobios-preview-badge iobios-badge-holiday-absence">Vacaciones</span>');
          statusClasses.push('iobios-status-holiday-absence');
        }
        if (original.isLeave) {
          const leaveText = original.leaveDetail || 'Permiso/Baja';
          badges.push(`<span class="iobios-preview-badge iobios-badge-leave">${leaveText}</span>`);
          statusClasses.push('iobios-status-leave');
          detailTexts.push('');
        }
        // Solo mostrar Futuro si no hay otros badges específicos
        if (original.isFuture && badges.length === 0) {
          badges.push('<span class="iobios-preview-badge iobios-badge-excluded">Futuro</span>');
          statusClasses.push('iobios-status-excluded');
        }
        
        const allBadges = badges.join(' ');
        const allStatusClasses = statusClasses.join(' ');
        const allDetailTexts = detailTexts.map(text => text ? `<span class="iobios-preview-detail">${text}</span>` : '').join(' ');
        
        html += `<div class="iobios-preview-row ${allStatusClasses}${key === todayKey ? ' iobios-today' : ''}">
          <span class="iobios-preview-date">${window.__iobios.formatDayLabel(date)}</span>
          <span class="iobios-preview-badge">${allBadges}</span>
          ${allDetailTexts}
          <button class="iobios-toggle-btn iobios-toggle-include" data-date="${key}" title="${inAddList ? 'Quitar inclusión manual' : 'Incluir'}">${inAddList ? '-' : '+'}</button>
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
