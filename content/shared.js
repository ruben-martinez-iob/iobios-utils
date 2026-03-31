'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // ── AppSheet session (syncToken + clientId captured from MAIN world) ────────

  const _session = { syncToken: null, clientId: null, localVersion: null };

  // Log interesting localStorage values for diagnosis
  try {
    const interesting = ['JeeneeClient', 'JeeneeNameGuidMap', 'JeeneeUserInfo',
      'launch_background_60020789-6a4e-43a6-8079-8487a74b56a3'];
    interesting.forEach(k => {
      const v = localStorage.getItem(k);
      if (v) console.log(`[ioBios] localStorage[${k}]:`, v.slice(0, 200));
    });
  } catch (e) {}

  document.addEventListener('__iobios_session', (e) => {
    if (e.detail.syncToken) _session.syncToken = e.detail.syncToken;
    if (e.detail.clientId) _session.clientId = e.detail.clientId;
    if (e.detail.localVersion) _session.localVersion = e.detail.localVersion;
  });

  Object.assign(window.__iobios, {
    getSession: () => _session,
  });

})();
