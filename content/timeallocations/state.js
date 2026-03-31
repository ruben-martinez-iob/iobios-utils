'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // Shared mutable state for the Time Allocations panel.
  // Stored on window.__iobios so renderer.js, panel.js and save.js can all access it.
  window.__iobios._taState = {
    manualInclude:   new Set(),  // dateStr — force-include naturally excluded days
    manualExclude:   new Set(),  // "dateStr::project" — granular exclusion
    markedForDelete: new Set(),  // allocation object references
    customHours:     new Map(),  // "dateStr::project" → hours
    customProjects:  new Map(),  // "dateStr::project" → overridden project name
    editingRows:     new Set(),  // "dateStr::project" keys for rows in edit mode
    manualRows:      new Map(),  // dateStr → [{uid, project, hours}]
    uidCounter:      0,
    cachedData:      null,
  };

})();
