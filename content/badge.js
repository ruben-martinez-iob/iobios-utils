'use strict';

(function () {

  // ── Helpers ───────────────────────────────────────────────────────────────

  function parseHoursFromHHMMSS(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    return (parts[0] || 0) + (parts[1] || 0) / 60;
  }

  // ── Badge DOM ─────────────────────────────────────────────────────────────

  function renderBadge(btnId, count) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const badgeId = `${btnId}-badge`;
    let badge = document.getElementById(badgeId);

    if (count === 0) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.id = badgeId;
      badge.className = 'iobios-btn-badge';
      btn.style.position = 'relative';
      btn.appendChild(badge);
    }

    badge.textContent = count > 99 ? '99+' : String(count);
  }

  // ── Pending day counters ──────────────────────────────────────────────────

  async function countPendingAllocations(config) {
    const { from, to: toFull } = window.__iobios.defaultFullDateRange();
    const today = new Date();
    const to = toFull < today ? toFull : today;
    const [nonWorkingDays, existing] = await Promise.all([
      window.__iobios.getNonWorkingDays(config),
      window.__iobios.timeAllocationsDb.getAllocations({ dateFrom: from, dateTo: to }),
    ]);
    const { holidaySet, vacationSet, leaveSet } = nonWorkingDays;

    const existingMap = new Map();
    for (const a of existing) {
      const key = a.date.toDateString();
      if (!existingMap.has(key)) existingMap.set(key, []);
      existingMap.get(key).push(a);
    }

    const maxH = config.rules.maxHoursPerDay || 8;
    let pending = 0;
    const cur = new Date(from);

    while (cur <= to) {
      const key        = cur.toDateString();
      const dow        = cur.getDay();
      const isWeekend  = dow === 0 || dow === 6;
      const naturallyExcluded =
        (config.rules.skipWeekends && isWeekend) ||
        holidaySet.has(key) ||
        vacationSet.has(key) ||
        leaveSet.has(key);

      if (!naturallyExcluded) {
        const dayAllocs        = existingMap.get(key) || [];
        const totalH           = dayAllocs.reduce((s, a) => s + parseHoursFromHHMMSS(a.hours), 0);
        const existingProjects = new Set(dayAllocs.map(a => a.project));
        const hasMissing       = config.timeAllocations.some(a => !existingProjects.has(a.project));

        if (totalH < maxH && hasMissing) pending++;
      }

      cur.setDate(cur.getDate() + 1);
    }

    return pending;
  }

  async function countPendingTimesheets(config) {
    const { from, to: toFull } = window.__iobios.defaultFullDateRange();
    const today = new Date();
    const to = toFull < today ? toFull : today;
    const [nonWorkingDays, existing] = await Promise.all([
      window.__iobios.getNonWorkingDays(config),
      window.__iobios.timeSheetsDb.getTimesheets({ dateFrom: from, dateTo: to }),
    ]);
    const { holidaySet, vacationSet, leaveSet } = nonWorkingDays;
    const existingSet = new Set(existing.map(t => t.date.toDateString()));

    let pending = 0;
    const cur = new Date(from);

    while (cur <= to) {
      const key       = cur.toDateString();
      const dow       = cur.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const naturallyExcluded =
        (config.rules.skipWeekends && isWeekend) ||
        holidaySet.has(key) ||
        vacationSet.has(key) ||
        leaveSet.has(key);

      if (!naturallyExcluded && !existingSet.has(key)) pending++;

      cur.setDate(cur.getDate() + 1);
    }

    return pending;
  }

  // ── Sync button hook ──────────────────────────────────────────────────────

  function hookSyncButton(config) {
    const syncBtn = document.querySelector('button[aria-label="Sync"]');
    if (!syncBtn || syncBtn._iobiosBadgeHooked) return;
    syncBtn._iobiosBadgeHooked = true;
    syncBtn.addEventListener('click', () => {
      setTimeout(() => updateBadges(config), 2500);
    });
  }

  // ── Public ────────────────────────────────────────────────────────────────

  let _running = false;

  async function updateBadges(config) {
    if (_running) return;
    _running = true;
    try {
      hookSyncButton(config);

      // Always read fresh data from IndexedDB (important after sync)
      window.__iobios.timeAllocationsDb.clearCache();
      window.__iobios.timeSheetsDb.clearCache();
      window.__iobios.clearAbsencesCache();

      const taBtn = document.getElementById('iobios-add-all-btn');
      const tsBtn = document.getElementById('iobios-add-all-ts-btn');

      await Promise.all([
        taBtn ? countPendingAllocations(config).then(n => renderBadge('iobios-add-all-btn', n))   : Promise.resolve(),
        tsBtn ? countPendingTimesheets(config).then(n => renderBadge('iobios-add-all-ts-btn', n)) : Promise.resolve(),
      ]);
    } catch (e) {
      console.warn('[ioBios] updateBadges error:', e);
    } finally {
      _running = false;
    }
  }

  window.__iobios = window.__iobios || {};
  window.__iobios.updateBadges   = updateBadges;
  window.__iobios.hookSyncButton = hookSyncButton;

})();
