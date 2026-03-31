'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function fromDateInput(str) {
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

  async function buildDateRange(dateFrom, dateTo, rules) {
    const holidays = rules.skipHolidays ? await window.__iobios.getHolidays() : [];
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
    toDateInputValue, fromDateInput, formatDayLabel, hoursToHHMMSS,
    defaultDateRange, defaultFullDateRange, buildDateRange,
  });

})();
