'use strict';

(function () {

  const BTN_TA = 'iobios-add-all-btn';
  const BTN_TS = 'iobios-add-all-ts-btn';

  // ── View detection ───────────────────────────────────────────────────────

  function getActiveView() {
    if (document.querySelector('[data-view-state-key*="My Timesheet"]')) return 'timesheets';
    if (document.querySelector('[data-view-state-key*="My Time Allocations"]')) return 'timeallocations';
    return null;
  }

  // ── Button injection ─────────────────────────────────────────────────────

  // Returns true if a new button was created
  function injectButton(id, label, clickHandler) {
    const addBtn = document.querySelector('button.navbar-primary-button[aria-label="Add"]');
    const existing = document.getElementById(id);

    if (!addBtn) {
      if (existing) existing.remove();
      return false;
    }
    if (existing && existing.className === addBtn.className) return false;
    if (existing) existing.remove();

    const btn = addBtn.cloneNode(true);
    btn.id = id;
    btn.setAttribute('aria-label', label);

    const labelDiv = btn.querySelector('div[title="Add"]');
    if (labelDiv) {
      labelDiv.setAttribute('title', label);
      labelDiv.textContent = label;
    }

    const ripple = btn.querySelector('span:last-child:empty');
    if (ripple) ripple.remove();

    btn.addEventListener('click', clickHandler);
    addBtn.insertAdjacentElement('afterend', btn);
    return true;
  }

  // Returns true if any button was newly injected
  function injectButtons(config) {
    const view = getActiveView();
    let injected = false;

    if (view === 'timeallocations') {
      const tsBtn = document.getElementById(BTN_TS);
      if (tsBtn) tsBtn.remove();
      injected = injectButton(BTN_TA, 'All', async () => {
        const cfg = await window.__iobios.getConfig();
        window.__iobios.openPanel(
          'Add All — Time Allocations',
          (container) => window.__iobios.renderTimeAllocationsBody(container, cfg),
          async () => {
            await window.__iobios.saveTimeAllocations(cfg);
            window.__iobios.updateBadges(cfg);
          }
        );
      });
    } else if (view === 'timesheets') {
      const taBtn = document.getElementById(BTN_TA);
      if (taBtn) taBtn.remove();
      injected = injectButton(BTN_TS, 'All', async () => {
        const cfg = await window.__iobios.getConfig();
        window.__iobios.openPanel(
          'Add All — Time Sheets',
          (container) => window.__iobios.renderTimeSheetsBody(container, cfg),
          async () => {
            await window.__iobios.saveTimeSheets(cfg);
            window.__iobios.updateBadges(cfg);
          }
        );
      });
    } else {
      const ta = document.getElementById(BTN_TA);
      const ts = document.getElementById(BTN_TS);
      if (ta) ta.remove();
      if (ts) ts.remove();
    }

    return injected;
  }

  // ── Main ─────────────────────────────────────────────────────────────────

  function modifyPage(config) {
    if (!config.enabled) return;
    const injected = injectButtons(config);
    // Re-hook sync button on every tick in case AppSheet recreated it
    window.__iobios.hookSyncButton(config);
    // Only recalculate badge when a button was newly added to the DOM
    if (injected) window.__iobios.updateBadges(config);
  }

  let observerActive = false;
  function startObserver(config) {
    if (observerActive) return;
    observerActive = true;
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => modifyPage(config), 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function init() {
    const config = await window.__iobios.getConfig();
    window.__iobios.createPanel();
    modifyPage(config);
    startObserver(config);
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  // ── Options page bridge ──────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'getProjects') {
      window.__iobios.timeAllocationsDb.getProjects()
        .then(projects => sendResponse({ projects: projects.map(p => p.name) }))
        .catch(() => sendResponse({ projects: [] }));
      return true; // keep message channel open for async response
    }
    if (msg.action === 'getHolidays') {
      window.__iobios.getHolidays()
        .then(holidays => sendResponse({
          holidays: holidays.map(h => ({
            date: window.__iobios.toDateInputValue(h.date),
            name: h.name,
          })),
        }))
        .catch(() => sendResponse({ holidays: [] }));
      return true;
    }
  });

})();
