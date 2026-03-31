'use strict';

// ── Project autocomplete ───────────────────────────────────────────────────────
let _availableProjects = [];

function loadProjects() {
  chrome.tabs.query({}, (tabs) => {
    const appsheetTab = tabs.find((t) => t.url && t.url.includes('appsheet.com'));
    if (!appsheetTab) return;
    chrome.tabs.sendMessage(appsheetTab.id, { action: 'getProjects' }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && Array.isArray(resp.projects)) _availableProjects = resp.projects;
    });
  });
}

// ── Allocation rows ────────────────────────────────────────────────────────────
function renderAllocationRow(project = '', hours = 8) {
  const row = document.createElement('div');
  row.className = 'allocation-row';

  // Project autocomplete wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'project-autocomplete';

  const projectInput = document.createElement('input');
  projectInput.type = 'text';
  projectInput.className = 'alloc-project';
  projectInput.placeholder = 'Nombre del proyecto';
  projectInput.value = project;
  projectInput.autocomplete = 'off';

  const ul = document.createElement('ul');
  ul.className = 'project-suggestions';
  ul.hidden = true;

  function showSuggestions() {
    const q = projectInput.value.toLowerCase();
    const matches = _availableProjects.filter((p) => p.toLowerCase().includes(q));
    ul.innerHTML = '';
    if (matches.length === 0) { ul.hidden = true; return; }
    matches.forEach((p) => {
      const li = document.createElement('li');
      li.className = 'project-suggestion-item';
      li.textContent = p;
      li.addEventListener('mousedown', (e) => e.preventDefault());
      li.addEventListener('click', () => {
        projectInput.value = p;
        ul.hidden = true;
      });
      ul.appendChild(li);
    });
    ul.hidden = false;
  }

  projectInput.addEventListener('input', showSuggestions);
  projectInput.addEventListener('focus', showSuggestions);
  projectInput.addEventListener('blur', () => { ul.hidden = true; });

  wrapper.appendChild(projectInput);
  wrapper.appendChild(ul);

  // Hours input
  const hoursInput = document.createElement('input');
  hoursInput.type = 'number';
  hoursInput.className = 'alloc-hours';
  hoursInput.min = '0.5';
  hoursInput.max = '24';
  hoursInput.step = '0.5';
  hoursInput.value = hours;
  hoursInput.addEventListener('input', checkHoursWarning);

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-row';
  removeBtn.setAttribute('aria-label', 'Eliminar fila');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    row.remove();
    checkHoursWarning();
  });

  row.appendChild(wrapper);
  row.appendChild(hoursInput);
  row.appendChild(removeBtn);
  document.getElementById('allocations-list').appendChild(row);
}

function getAllocations() {
  return Array.from(document.getElementById('allocations-list').querySelectorAll('.allocation-row')).map((row) => ({
    project: row.querySelector('.alloc-project').value.trim(),
    hours: parseFloat(row.querySelector('.alloc-hours').value) || 0,
  }));
}

function checkHoursWarning() {
  const total = getAllocations().reduce((sum, a) => sum + a.hours, 0);
  const max = parseFloat(document.getElementById('max-hours').value) || 8;
  const allocTotal = document.getElementById('alloc-total');
  allocTotal.textContent = `Total imputado: ${total}h`;
  allocTotal.classList.toggle('over-limit', total > max);
}

// ── Listeners ──────────────────────────────────────────────────────────────────
document.getElementById('add-allocation').addEventListener('click', () => {
  renderAllocationRow('', 8);
  document.getElementById('allocations-list').lastElementChild.querySelector('.alloc-project').focus();
});

document.getElementById('skip-holidays').addEventListener('change', () => {
  const skipHolidaysCheckbox = document.getElementById('skip-holidays');
  const tabBtnFestivos = document.getElementById('tab-btn-festivos');
  tabBtnFestivos.hidden = !skipHolidaysCheckbox.checked;
  if (!skipHolidaysCheckbox.checked && tabBtnFestivos.classList.contains('active')) {
    tabBtnFestivos.classList.remove('active');
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.remove('active'));
    document.querySelector('.tab[data-tab="general"]').classList.add('active');
    document.getElementById('tab-general').classList.add('active');
  }
});

document.getElementById('max-hours').addEventListener('input', () => {
  checkHoursWarning();
  updateDerived();
});

loadProjects();
