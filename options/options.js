'use strict';

// ── Tab switching ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// ── Form submit ────────────────────────────────────────────────────────────────
document.getElementById('options-form').addEventListener('submit', (e) => {
  e.preventDefault();
  validateAndSave();
});

// ── Force dd/mm/yyyy on all date inputs (chrome-extension:// ignores lang attr) ─
// Chrome reads the lang from the input element but needs it set before render.
// Using setAttribute (not .lang property) and toggling type forces re-render.
function fixDateLocale(el) {
  if (el.getAttribute('lang') === 'en-GB') return;
  el.setAttribute('lang', 'en-GB');
  // Force Chrome to re-read locale by briefly toggling type
  el.type = 'text';
  el.type = 'date';
}
function fixAllDateInputs() {
  document.querySelectorAll('input[type="date"]').forEach(fixDateLocale);
}
fixAllDateInputs();
new MutationObserver(fixAllDateInputs).observe(document.body, { childList: true, subtree: true });

// ── Init ───────────────────────────────────────────────────────────────────────
loadConfig();
