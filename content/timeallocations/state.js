'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // Shared mutable state for the Time Allocations panel.
  // Stored on window.__iobios so renderer.js, panel.js and save.js can all access it.
  window.__iobios._taState = {
    rowStates: new Map(),  // dateStr -> { originalState, inAddList: boolean }
    markedForDelete: new Set(),  // allocation object references
    customHours: new Map(),  // "dateStr::project" -> hours
    customProjects: new Map(),  // "dateStr::project" -> overridden project name
    editingRows: new Set(),  // "dateStr::project" keys for rows in edit mode
    manualRows: new Map(),  // dateStr -> [{uid, project, hours}]
    uidCounter: 0,
    cachedData: null,
    conflictKeys: new Set(),
  };

})();
