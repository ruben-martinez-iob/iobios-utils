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

  function renderTimeSheetsBody(container, config) {
    const _s = window.__iobios._tsState;

    _s.manualInclude   = new Set();
    _s.manualExclude   = new Set();
    _s.markedForDelete = new Map();
    _s.customHours     = new Map();
    _s.editingRows     = new Set();
    _s.cachedData      = null;

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

      if (!_s.cachedData || forceRefetch) {
        preview.innerHTML = '<p class="iobios-loading">Calculando...</p>';
        const dateFrom = fromDate;
        const dateTo   = toDate;
        const [nonWorkingDays, existing] = await Promise.all([
          window.__iobios.getNonWorkingDays(config),
          window.__iobios.timeSheetsDb.getTimesheets({ dateFrom, dateTo }),
        ]);
        const allDates = [];
        const cur = new Date(dateFrom);
        while (cur <= dateTo) { allDates.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

        // Map dateStr → timesheet for existing rows (needed for delete)
        const existingMap = new Map(existing.map(t => [t.date.toDateString(), t]));

        const { holidaySet, holidayNameMap, vacationSet, leaveSet, leaveDetailMap } = nonWorkingDays;
        _s.cachedData = {
          allDates,
          holidaySet, holidayNameMap,
          vacationSet,
          leaveSet, leaveDetailMap,
          existingMap,
        };
      }

      try {
        window.__iobios.renderTSList(document.getElementById('iobios-preview'), config);
      } catch (e) {
        console.error('[ioBios] timesheets renderList error:', e);
        document.getElementById('iobios-preview').innerHTML =
          `<p class="iobios-preview-empty">Error al cargar la lista: ${e.message}</p>`;
      }
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
      _s.markedForDelete = new Map();
      _s.editingRows     = new Set();
      updatePreview(true);
    }

    document.getElementById('iobios-preview').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const key = btn.dataset.date;
      if (!key) return;

      if (btn.classList.contains('iobios-toggle-delete')) {
        const ts = _s.cachedData && _s.cachedData.existingMap.get(key);
        if (ts) _s.markedForDelete.set(key, ts);
      } else if (btn.classList.contains('iobios-toggle-undelete')) {
        _s.markedForDelete.delete(key);
      } else if (btn.classList.contains('iobios-toggle-include')) {
        _s.manualInclude.add(key);
        _s.manualExclude.delete(key);
      } else if (btn.classList.contains('iobios-toggle-exclude')) {
        _s.manualExclude.add(key);
        _s.manualInclude.delete(key);
      } else if (btn.classList.contains('iobios-toggle-edit')) {
        _s.editingRows.add(key);
      } else if (btn.classList.contains('iobios-cancel-edit')) {
        _s.editingRows.delete(key);
      } else if (btn.classList.contains('iobios-save-edit')) {
        const row = btn.closest('.iobios-preview-row');
        const getVal = (field) => (row.querySelector(`[data-field="${field}"]`) || {}).value || '';
        const newTimes = {
          clockIn1:  getVal('clockIn1'),  clockOut1: getVal('clockOut1'),
          clockIn2:  getVal('clockIn2'),  clockOut2: getVal('clockOut2'),
        };
        const ts = _s.cachedData && _s.cachedData.existingMap.get(key);
        if (ts) {
          btn.disabled = true;
          btn.textContent = '⏳';
          const res = await window.__iobios.timeSheetsDb.updateTimesheet(ts, newTimes);
          if (res.ok) {
            ts.clockIn1  = newTimes.clockIn1;  ts.clockOut1 = newTimes.clockOut1;
            ts.clockIn2  = newTimes.clockIn2;  ts.clockOut2 = newTimes.clockOut2;
            _s.editingRows.delete(key);
            window.__iobios.showToast('✏ 1 actualizado', 'success');
          } else {
            btn.disabled = false;
            btn.textContent = '✓';
            window.__iobios.showToast('Error al guardar', 'error');
          }
          window.__iobios.renderTSList(document.getElementById('iobios-preview'), config);
          return;
        }
      }
      window.__iobios.renderTSList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-preview').addEventListener('change', (e) => {
      const input = e.target.closest('input.iobios-time-input');
      if (!input) return;
      const key    = input.dataset.date;
      const period = input.dataset.period;
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
        const inSummer = isSummerDate(new Date(key), config);
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
      const field = input.dataset.field;
      const base  = _s.customHours.get(key) || {
        period1: { ...config.timeSheets.period1 },
        period2: { ...config.timeSheets.period2 },
      };
      base[`period${period}`][field] = input.value;
      _s.customHours.set(key, base);
    });

    // Re-render insert rows only when focus leaves the day's time inputs
    document.getElementById('iobios-preview').addEventListener('focusout', (e) => {
      const input = e.target.closest('input.iobios-time-input[data-period]');
      if (!input) return;
      // If focus moves to another time input for the same day, keep editing without re-render
      const next = e.relatedTarget;
      if (next && next.matches('input.iobios-time-input') && next.dataset.date === input.dataset.date) return;
      window.__iobios.renderTSList(document.getElementById('iobios-preview'), config);
    });

    document.getElementById('iobios-date-from').addEventListener('change', () => { _s.cachedData = null; updatePreview(true); });
    document.getElementById('iobios-date-to').addEventListener('change',   () => { _s.cachedData = null; updatePreview(true); });
    document.getElementById('iobios-month-prev').addEventListener('click', () => shiftMonth(-1));
    document.getElementById('iobios-month-next').addEventListener('click', () => shiftMonth(+1));

    // When AppSheet sync runs, refresh the preview so it reflects the new DB state
    const syncBtn = document.querySelector('button[aria-label="Sync"]');
    if (syncBtn && !syncBtn._iobiosTsHooked) {
      syncBtn._iobiosTsHooked = true;
      syncBtn.addEventListener('click', () => {
        setTimeout(() => {
          const panel = document.getElementById('iobios-panel');
          if (panel && panel.classList.contains('open')) {
            _s.cachedData = null;
            window.__iobios.timeSheetsDb.clearCache();
            window.__iobios.clearAbsencesCache();
            updatePreview(true);
          }
        }, 2000);
      });
    }

    updatePreview(true);
  }

  Object.assign(window.__iobios, { renderTimeSheetsBody });

})();
