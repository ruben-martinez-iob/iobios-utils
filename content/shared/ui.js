'use strict';

(function () {

  window.__iobios = window.__iobios || {};

  // ── Toast ──────────────────────────────────────────────────────────────────

  function showToast(message, type) {
    let toast = document.getElementById('iobios-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'iobios-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `iobios-toast-${type}`;
    toast.classList.add('visible');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  // ── Panel ──────────────────────────────────────────────────────────────────

  let _currentSaveFn = null;

  function createPanel() {
    if (document.getElementById('iobios-panel')) return;

    const overlay = document.createElement('div');
    overlay.id = 'iobios-overlay';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'iobios-panel';
    panel.innerHTML = `
      <div id="iobios-panel-header">
        <button id="iobios-panel-close" aria-label="Close">✕</button>
        <div id="iobios-panel-title"></div>
        <div id="iobios-panel-actions">
          <button id="iobios-panel-cancel">Cancel</button>
          <button id="iobios-panel-save">Save</button>
        </div>
      </div>
      <div id="iobios-panel-body"></div>
    `;
    document.body.appendChild(panel);

    document.getElementById('iobios-panel-close').addEventListener('click', closePanel);
    document.getElementById('iobios-panel-cancel').addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);
    document.getElementById('iobios-panel-save').addEventListener('click', () => {
      if (_currentSaveFn) _currentSaveFn();
    });
  }

  function openPanel(title, renderFn, saveFn) {
    document.getElementById('iobios-panel-title').textContent = title;
    const body = document.getElementById('iobios-panel-body');
    body.innerHTML = '';
    _currentSaveFn = saveFn;
    const saveBtn = document.getElementById('iobios-panel-save');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    if (renderFn) renderFn(body);
    document.getElementById('iobios-overlay').classList.add('open');
    document.getElementById('iobios-panel').classList.add('open');
  }

  function closePanel() {
    document.getElementById('iobios-overlay').classList.remove('open');
    document.getElementById('iobios-panel').classList.remove('open');
    _currentSaveFn = null;
  }

  Object.assign(window.__iobios, { showToast, createPanel, openPanel, closePanel });

})();
