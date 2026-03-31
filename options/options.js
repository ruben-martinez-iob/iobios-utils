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

// ── Init ───────────────────────────────────────────────────────────────────────
loadConfig();
