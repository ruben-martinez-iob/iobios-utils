'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // Shared mutable state for the Timesheets panel.
  // Stored on window.__iobios so renderer.js, panel.js and save.js can all access it.
  window.__iobios._tsState = {
    manualInclude:   new Set(),  // excluded dates forced to insert
    manualExclude:   new Set(),  // insertable dates forced to skip
    markedForDelete: new Map(),  // dateStr → timesheet object
    customHours:     new Map(),  // dateStr → { period1, period2 }
    editingRows:     new Set(),  // dateStr keys for rows in edit mode
    cachedData:      null,
  };

})();
