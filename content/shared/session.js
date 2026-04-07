'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // ── AppSheet session (syncToken + clientId captured from MAIN world) ────────

  const _session = { syncToken: null, clientId: null, localVersion: null };

  document.addEventListener('__iobios_session', (e) => {
    if (e.detail.syncToken) _session.syncToken = e.detail.syncToken;
    if (e.detail.clientId) _session.clientId = e.detail.clientId;
    if (e.detail.localVersion) _session.localVersion = e.detail.localVersion;
  });

  Object.assign(window.__iobios, {
    getSession: () => _session,
  });

})();
