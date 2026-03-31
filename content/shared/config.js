'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  function getConfig() {
    return new Promise((resolve) =>
      chrome.storage.sync.get({
        enabled: true,
        timeAllocations: [{ project: 'ATS/SCS Roadmap Acceleration', hours: 8 }],
        rules: { skipWeekends: true, skipHolidays: false, skipVacations: false, maxHoursPerDay: 8 },
        timeSheets: {
          period1: { clockIn: '09:00', clockOut: '14:00' },
          period2: { clockIn: '14:30', clockOut: '17:30' },
        },
      }, resolve)
    );
  }

  Object.assign(window.__iobios, { getConfig });

})();
