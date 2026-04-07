'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // Returns YYYY-MM-DD — used for type="date" inputs in options and for API/storage
  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Returns dd/mm/yyyy — used for type="text" date inputs in the content-script panels
  function toDisplayDate(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${date.getFullYear()}`;
  }

  // Parses dd/mm/yyyy (panel text inputs)
  function fromDateInput(str) {
    if (!str) return null;
    const parts = str.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      return new Date(y, m - 1, d);
    }
    // Fallback: YYYY-MM-DD
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDayLabel(date) {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${days[date.getDay()]} ${d}/${m}/${date.getFullYear()}`;
  }

  function hoursToHHMMSS(h) {
    const total = Math.round(h * 3600);
    const hh = String(Math.floor(total / 3600)).padStart(2, '0');
    const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    return `${hh}:${mm}:00`;
  }

  function defaultDateRange() {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  function defaultFullDateRange() {
    const now = new Date();
    return {
      from: new Date(2026, 0, 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  }

  // Returns all non-working day data for the given config.
  // Sets are only populated when the corresponding skip flag is true.
  async function getNonWorkingDays(config) {
    console.log('[ioBios] getNonWorkingDays called with config:', config);
    console.log('[ioBios] config.holidays exists:', !!config.holidays);
    console.log('[ioBios] config.holidays content:', config.holidays);
    
    const email = window.__iobios.getCurrentUserEmail();
    const [dbHolidays, vacations, leaves] = await Promise.all([
      config.rules.skipHolidays  ? window.__iobios.getHolidays(config)               : Promise.resolve([]),
      config.rules.skipVacations ? window.__iobios.getApprovedVacations(email)  : Promise.resolve([]),
      (config.rules.skipLeave ?? true) ? window.__iobios.getApprovedLeaves(email) : Promise.resolve([]),
    ]);

    const holidayNameMap = new Map();

    // Always process custom holidays (needed for rendering and badges)
    console.log('[ioBios] Processing custom holidays from config.holidays:', config.holidays);
    for (const entries of Object.values(config.holidays || {})) {
      console.log('[ioBios] Processing entries for year:', entries);
      for (const entry of entries) {
        const dateStr = typeof entry === 'string' ? entry : entry.date;
        const name    = typeof entry === 'string' ? '' : (entry.name || '');
        console.log('[ioBios] Processing entry:', dateStr, name);
        if (dateStr) {
          const d = new Date(dateStr + 'T00:00:00');
          if (!isNaN(d)) {
            const dateKey = d.toDateString();
            holidayNameMap.set(dateKey, name);
            console.log('[ioBios] Added custom holiday:', dateKey, name, 'from', dateStr);
          }
        }
      }
    }

    // Add DB holidays only when skipHolidays is enabled
    if (config.rules.skipHolidays) {
      for (const h of dbHolidays) {
        holidayNameMap.set(h.date.toDateString(), h.name || '');
      }
    }

    const holidaySet  = new Set(holidayNameMap.keys());
    console.log('[ioBios] Final holidaySet:', Array.from(holidaySet));
    console.log('[ioBios] Final holidayNameMap:', Array.from(holidayNameMap.entries()));
    const vacationSet = new Set(vacations.map(v => v.toDateString()));

    const leaveDetailMap = new Map();
    for (const l of leaves) {
      leaveDetailMap.set(l.date.toDateString(), l.subtype || '');
    }
    const leaveSet = new Set(leaveDetailMap.keys());

    return { holidaySet, holidayNameMap, vacationSet, leaveSet, leaveDetailMap };
  }

  async function buildDateRange(dateFrom, dateTo, rules, config = null) {
    // If config is provided, use it to get holidays including custom ones
    const holidays = rules.skipHolidays && config ? 
      await window.__iobios.getHolidays(config) : 
      [];
    const holidaySet = new Set(holidays.map(h => h.date.toDateString()));
    const dates = [];
    const cur = new Date(dateFrom);
    while (cur <= dateTo) {
      const dow = cur.getDay();
      const isWeekend = dow === 0 || dow === 6;
      if ((!rules.skipWeekends || !isWeekend) && !holidaySet.has(cur.toDateString())) {
        dates.push(new Date(cur));
      }
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  Object.assign(window.__iobios, {
    toDateInputValue, toDisplayDate, fromDateInput, formatDayLabel, hoursToHHMMSS,
    defaultDateRange, defaultFullDateRange, buildDateRange, getNonWorkingDays,
  });

})();
