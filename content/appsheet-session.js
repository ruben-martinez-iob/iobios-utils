'use strict';

// Runs in MAIN world at document_start.
// Intercepts AppSheet's own fetch/XHR calls to extract the syncToken and clientId
// from URL params AND response bodies, then broadcasts them via a DOM CustomEvent
// so the isolated-world content scripts can pick them up.

console.log('[ioBios MAIN] appsheet-session.js loaded in MAIN world');

(function () {
  function extractAndBroadcast(url, syncToken, clientId, localVersion) {
    if (!url || !url.includes('/api/template/')) return;
    try {
      const u = new URL(url, 'https://www.appsheet.com');
      const st = syncToken || u.searchParams.get('syncToken');
      const ci = clientId  || u.searchParams.get('clientId');
      const lv = localVersion || u.searchParams.get('localVersion');
      console.log('[ioBios MAIN] api/template call, syncToken:', !!st, 'clientId:', !!ci);
      if (st || ci) {
        document.dispatchEvent(new CustomEvent('__iobios_session', {
          detail: { syncToken: st, clientId: ci, localVersion: lv },
        }));
      }
    } catch (_) {}
  }

  function tryExtractClientId(url, body) {
    try {
      const u = new URL(url, 'https://www.appsheet.com');
      const fromUrl = u.searchParams.get('clientId');
      if (fromUrl) return fromUrl;
    } catch (_) {}
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      if (parsed && parsed.clientId) return parsed.clientId;
    } catch (_) {}
    return null;
  }

  function handleResponseBody(url, responseClone, requestBody) {
    responseClone.json().then(data => {
      const keys = Object.keys(data);
      console.log('[ioBios MAIN] api/template response keys:', keys.slice(0, 10));
      const syncToken = data.syncToken || data.SyncToken;
      const localVersion = data.localVersion || data.LocalVersion
        || data.appTemplateVersion || data.AppTemplateVersion || null;
      console.log('[ioBios MAIN] api/template response, syncToken:', !!syncToken, 'localVersion:', localVersion);
      if (syncToken || localVersion) {
        const clientId = tryExtractClientId(url, requestBody);
        document.dispatchEvent(new CustomEvent('__iobios_session', {
          detail: { syncToken, clientId, localVersion },
        }));
      }
    }).catch(e => console.log('[ioBios MAIN] response parse error:', e.message));
  }

  // Patch fetch
  const _origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url);
    extractAndBroadcast(url);
    const promise = _origFetch.apply(this, arguments);
    if (url && url.includes('/api/template/')) {
      promise.then(res => {
        handleResponseBody(url, res.clone(), init && init.body);
      }).catch(() => {});
    }
    return promise;
  };

  // Patch XHR
  const _origOpen = XMLHttpRequest.prototype.open;
  const _origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._iobiosUrl = url;
    return _origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._iobiosUrl;
    extractAndBroadcast(url);
    if (url && url.includes('/api/template/')) {
      this.addEventListener('load', () => {
        try {
          const data = JSON.parse(this.responseText);
          const syncToken = data.syncToken || data.SyncToken;
          const localVersion = data.localVersion || data.LocalVersion || null;
          if (syncToken) {
            const clientId = tryExtractClientId(url, body);
            document.dispatchEvent(new CustomEvent('__iobios_session', {
              detail: { syncToken, clientId, localVersion },
            }));
          }
        } catch (_) {}
      });
    }
    return _origSend.apply(this, arguments);
  };
})();
