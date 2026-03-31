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

// ── Elements ───────────────────────────────────────────────────────────────────
const form = document.getElementById('options-form');
const enabledCheckbox = document.getElementById('enabled');
const statusMsg = document.getElementById('status-msg');

const allocationsList = document.getElementById('allocations-list');
const addAllocationBtn = document.getElementById('add-allocation');
const skipWeekendsCheckbox = document.getElementById('skip-weekends');
const skipHolidaysCheckbox = document.getElementById('skip-holidays');
const skipVacationsCheckbox = document.getElementById('skip-vacations');
const tabBtnFestivos = document.getElementById('tab-btn-festivos');
const maxHoursInput = document.getElementById('max-hours');
const allocTotal = document.getElementById('alloc-total');

const p1In = document.getElementById('p1-clock-in');
const p1Out = document.getElementById('p1-clock-out');
const p2In = document.getElementById('p2-clock-in');
const p2Out = document.getElementById('p2-clock-out');
const derivedInfo = document.getElementById('derived-info');
const summerTsInfo = document.getElementById('summer-ts-info');

const summerHoursInput = document.getElementById('summer-hours');
const summerStartInput = document.getElementById('summer-start');
const summerEndInput   = document.getElementById('summer-end');

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

loadProjects();

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
  allocationsList.appendChild(row);
}

addAllocationBtn.addEventListener('click', () => {
  renderAllocationRow('', 8);
  allocationsList.lastElementChild.querySelector('.alloc-project').focus();
});

function getAllocations() {
  return Array.from(allocationsList.querySelectorAll('.allocation-row')).map((row) => ({
    project: row.querySelector('.alloc-project').value.trim(),
    hours: parseFloat(row.querySelector('.alloc-hours').value) || 0,
  }));
}

function checkHoursWarning() {
  const total = getAllocations().reduce((sum, a) => sum + a.hours, 0);
  const max = parseFloat(maxHoursInput.value) || 8;
  allocTotal.textContent = `Total imputado: ${total}h`;
  allocTotal.classList.toggle('over-limit', total > max);
}

skipHolidaysCheckbox.addEventListener('change', () => {
  tabBtnFestivos.hidden = !skipHolidaysCheckbox.checked;
  if (!skipHolidaysCheckbox.checked && tabBtnFestivos.classList.contains('active')) {
    tabBtnFestivos.classList.remove('active');
    document.querySelectorAll('.tabpanel').forEach((p) => p.classList.remove('active'));
    document.querySelector('.tab[data-tab="general"]').classList.add('active');
    document.getElementById('tab-general').classList.add('active');
  }
});

maxHoursInput.addEventListener('input', () => {
  checkHoursWarning();
  updateDerived();
});

// ── Time Sheets ────────────────────────────────────────────────────────────────
function timeToMinutes(val) {
  const [h, m] = (val || '').split(':').map(Number);
  return isNaN(h) || isNaN(m) ? null : h * 60 + m;
}

function minutesToHM(minutes) {
  if (minutes < 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

function updateDerived() {
  const in1 = timeToMinutes(p1In.value);
  const out1 = timeToMinutes(p1Out.value);
  const in2 = timeToMinutes(p2In.value);
  const out2 = timeToMinutes(p2Out.value);

  if (in1 === null || out1 === null || in2 === null || out2 === null) {
    derivedInfo.textContent = '';
    derivedInfo.classList.remove('over-limit');
    return;
  }

  const pause = in2 - out1;
  const worked = (out1 - in1) + (out2 - in2);
  derivedInfo.textContent = `Pausa: ${minutesToHM(pause)} · Total trabajado: ${minutesToHM(worked)}`;

  const maxMinutes = (parseFloat(maxHoursInput.value) || 8) * 60;
  derivedInfo.classList.toggle('over-limit', worked > maxMinutes);
}

function subtractOneHourStr(time) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m - 60;
  if (total < 0) return '';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function updateSummerInfo() {
  const co2 = p2Out.value;
  const summerCo2 = subtractOneHourStr(co2);
  if (!co2 || !summerCo2) {
    summerTsInfo.textContent = '';
    return;
  }
  summerTsInfo.textContent =
    `☀ Durante la jornada de verano la salida de la franja 2 se adelanta 1 hora: ${co2} → ${summerCo2}.`;
}

[p1In, p1Out, p2In, p2Out].forEach((el) => el.addEventListener('input', () => { updateDerived(); updateSummerInfo(); }));

// ── Holidays (Festivos) ────────────────────────────────────────────────────────
const festivosPanel = document.getElementById('tab-festivos');

function addHolidayRow(list, date) {
  const row = document.createElement('div');
  row.className = 'holiday-row';

  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'holiday-date';
  input.value = date;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-row';
  removeBtn.setAttribute('aria-label', 'Eliminar festivo');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(input);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

function renderHolidaysTab(holidays) {
  festivosPanel.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'tab-section';

  const h2 = document.createElement('h2');
  h2.textContent = 'Días festivos';

  const desc = document.createElement('p');
  desc.className = 'section-desc';
  desc.textContent = 'Días festivos por año. Se excluyen al generar imputaciones.';

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn-import-db';
  importBtn.textContent = 'Importar desde DB';

  const headerRow = document.createElement('div');
  headerRow.className = 'section-header-row';
  headerRow.appendChild(h2);
  headerRow.appendChild(importBtn);

  section.appendChild(headerRow);
  section.appendChild(desc);

  const yearTabsBar = document.createElement('div');
  yearTabsBar.className = 'year-tabs';

  const yearPanelsContainer = document.createElement('div');
  yearPanelsContainer.className = 'year-panels';

  const currentYear = new Date().getFullYear();
  const yearsInData = Object.keys(holidays).map(Number);
  const yearsToShow = [...new Set([...yearsInData, currentYear])].sort((a, b) => a - b);

  function activateYear(year) {
    yearTabsBar.querySelectorAll('.year-tab').forEach((t) => t.classList.remove('active'));
    yearPanelsContainer.querySelectorAll('.year-panel').forEach((p) => p.classList.remove('active'));
    const tab = yearTabsBar.querySelector(`.year-tab[data-year="${year}"]`);
    const panel = yearPanelsContainer.querySelector(`.year-panel[data-year="${year}"]`);
    if (tab) tab.classList.add('active');
    if (panel) panel.classList.add('active');
  }

  function addYearSection(year) {
    if (yearTabsBar.querySelector(`.year-tab[data-year="${year}"]`)) return;

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'year-tab';
    tab.dataset.year = year;
    tab.textContent = year;
    tab.addEventListener('click', () => activateYear(year));

    const addTabBtn = yearTabsBar.querySelector('.year-tab-add');
    yearTabsBar.insertBefore(tab, addTabBtn);

    const panel = document.createElement('div');
    panel.className = 'year-panel';
    panel.dataset.year = year;

    const dateList = document.createElement('div');
    dateList.className = 'holiday-list';

    const dates = holidays[year] || [];
    dates.forEach((date) => addHolidayRow(dateList, date));

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add holiday-add';
    addBtn.textContent = '+ Añadir festivo';
    addBtn.addEventListener('click', () => {
      addHolidayRow(dateList, '');
      dateList.lastElementChild.querySelector('.holiday-date').focus();
    });

    panel.appendChild(dateList);
    panel.appendChild(addBtn);
    yearPanelsContainer.appendChild(panel);
  }

  // Add the "+" tab to add new years (must be appended first so insertBefore works)
  const addYearTabBtn = document.createElement('button');
  addYearTabBtn.type = 'button';
  addYearTabBtn.className = 'year-tab year-tab-add';
  addYearTabBtn.textContent = '+';
  addYearTabBtn.title = 'Añadir año';
  addYearTabBtn.addEventListener('click', () => {
    const input = prompt('Introduce el año:', new Date().getFullYear() + 1);
    if (!input) return;
    const y = parseInt(input, 10);
    if (isNaN(y) || y < 2000 || y > 2100) return;
    addYearSection(y);
    activateYear(y);
  });
  yearTabsBar.appendChild(addYearTabBtn);

  yearsToShow.forEach((y) => addYearSection(y));

  importBtn.addEventListener('click', () => {
    chrome.tabs.query({}, (tabs) => {
      const appsheetTab = tabs.find((t) => t.url && t.url.includes('appsheet.com'));
      if (!appsheetTab) {
        showStatus('Abre la aplicación AppSheet primero.', 'error');
        return;
      }
      importBtn.disabled = true;
      importBtn.textContent = 'Importando…';
      chrome.tabs.sendMessage(appsheetTab.id, { action: 'getHolidays' }, (resp) => {
        importBtn.disabled = false;
        importBtn.textContent = 'Importar desde DB';
        if (chrome.runtime.lastError || !resp || !Array.isArray(resp.holidays)) {
          showStatus('No se pudieron obtener los festivos de la DB.', 'error');
          return;
        }
        const byYear = {};
        resp.holidays.forEach(({ date }) => {
          const year = date.slice(0, 4);
          (byYear[year] = byYear[year] || []).push(date);
        });
        let added = 0;
        Object.entries(byYear).forEach(([year, dates]) => {
          addYearSection(parseInt(year, 10));
          const panel = yearPanelsContainer.querySelector(`.year-panel[data-year="${year}"]`);
          if (!panel) return;
          const dateList = panel.querySelector('.holiday-list');
          const existing = new Set(
            Array.from(dateList.querySelectorAll('.holiday-date')).map((i) => i.value)
          );
          dates.forEach((date) => {
            if (!existing.has(date)) { addHolidayRow(dateList, date); added++; }
          });
        });
        showStatus(added > 0 ? `${added} festivo(s) importado(s) de la DB.` : 'No hay festivos nuevos en la DB.', 'success');
      });
    });
  });

  section.appendChild(yearTabsBar);
  section.appendChild(yearPanelsContainer);
  festivosPanel.appendChild(section);

  if (yearsToShow.includes(currentYear)) {
    activateYear(currentYear);
  } else if (yearsToShow.length > 0) {
    activateYear(yearsToShow[0]);
  }
}

function getHolidays() {
  const result = {};
  festivosPanel.querySelectorAll('.year-panel').forEach((panel) => {
    const year = panel.dataset.year;
    const dates = Array.from(panel.querySelectorAll('.holiday-date'))
      .map((i) => i.value)
      .filter((v) => v);
    if (dates.length > 0) result[year] = dates;
  });
  return result;
}

// ── Load config ────────────────────────────────────────────────────────────────
const DEFAULTS = {
  enabled: true,
  timeAllocations: [{ project: 'ATS/SCS Roadmap Acceleration', hours: 8 }],
  rules: { skipWeekends: true, skipHolidays: false, skipVacations: false, maxHoursPerDay: 8 },
  timeSheets: {
    period1: { clockIn: '09:00', clockOut: '14:00' },
    period2: { clockIn: '14:30', clockOut: '17:30' },
  },
  summerSchedule: { hours: 7, start: '08-01', end: '08-31' },
  holidays: {},
};

// Helpers to convert between "MM-DD" and date input value (YYYY-MM-DD)
function mdToInputValue(md) {
  const year = new Date().getFullYear();
  return `${year}-${md}`;
}
function inputValueToMD(val) {
  // val is "YYYY-MM-DD" — return "MM-DD"
  return val ? val.slice(5) : '';
}

chrome.storage.sync.get(DEFAULTS, (config) => {
  enabledCheckbox.checked = config.enabled;

  allocationsList.innerHTML = '';
  const allocations = config.timeAllocations.length
    ? config.timeAllocations
    : DEFAULTS.timeAllocations;
  allocations.forEach(({ project, hours }) => renderAllocationRow(project, hours));
  skipWeekendsCheckbox.checked = config.rules.skipWeekends;
  skipHolidaysCheckbox.checked = config.rules.skipHolidays;
  skipVacationsCheckbox.checked = config.rules.skipVacations;
  tabBtnFestivos.hidden = !config.rules.skipHolidays;
  maxHoursInput.value = config.rules.maxHoursPerDay;
  checkHoursWarning();

  p1In.value = config.timeSheets.period1.clockIn;
  p1Out.value = config.timeSheets.period1.clockOut;
  p2In.value = config.timeSheets.period2.clockIn;
  p2Out.value = config.timeSheets.period2.clockOut;
  updateDerived();
  updateSummerInfo();

  renderHolidaysTab(config.holidays || {});

  const ss = config.summerSchedule || DEFAULTS.summerSchedule;
  summerHoursInput.value = ss.hours;
  summerStartInput.value = mdToInputValue(ss.start);
  summerEndInput.value   = mdToInputValue(ss.end);
});

// ── Save ───────────────────────────────────────────────────────────────────────
form.addEventListener('submit', (e) => {
  e.preventDefault();

  const allocations = getAllocations();

  if (allocations.length === 0) {
    showStatus('Añade al menos una plantilla de imputación.', 'error');
    return;
  }
  if (allocations.some((a) => a.project === '')) {
    showStatus('El nombre del proyecto no puede estar vacío.', 'error');
    return;
  }
  if (allocations.some((a) => a.hours <= 0)) {
    showStatus('Las horas deben ser mayores que 0.', 'error');
    return;
  }

  const maxH = parseFloat(maxHoursInput.value);
  if (isNaN(maxH) || maxH <= 0 || maxH > 24) {
    showStatus('El máximo de horas debe estar entre 0 y 24.', 'error');
    return;
  }

  const in1 = timeToMinutes(p1In.value);
  const out1 = timeToMinutes(p1Out.value);
  const in2 = timeToMinutes(p2In.value);
  const out2 = timeToMinutes(p2Out.value);

  if (out1 <= in1) {
    showStatus('Franja 1: la salida debe ser posterior a la entrada.', 'error');
    return;
  }
  if (in2 <= out1) {
    showStatus('Franja 2: la entrada debe ser posterior a la salida de la franja 1.', 'error');
    return;
  }
  if (out2 <= in2) {
    showStatus('Franja 2: la salida debe ser posterior a la entrada.', 'error');
    return;
  }

  const summerH = parseFloat(summerHoursInput.value);
  if (isNaN(summerH) || summerH <= 0 || summerH > 24) {
    showStatus('Las horas de jornada de verano deben estar entre 0 y 24.', 'error');
    return;
  }
  const summerStart = inputValueToMD(summerStartInput.value);
  const summerEnd   = inputValueToMD(summerEndInput.value);
  if (!summerStart || !summerEnd) {
    showStatus('Las fechas de jornada de verano son obligatorias.', 'error');
    return;
  }
  if (summerStart > summerEnd) {
    showStatus('La fecha de inicio de jornada de verano debe ser anterior al fin.', 'error');
    return;
  }

  const config = {
    enabled: enabledCheckbox.checked,
    timeAllocations: allocations,
    rules: {
      skipWeekends: skipWeekendsCheckbox.checked,
      skipHolidays: skipHolidaysCheckbox.checked,
      skipVacations: skipVacationsCheckbox.checked,
      maxHoursPerDay: maxH,
    },
    timeSheets: {
      period1: { clockIn: p1In.value, clockOut: p1Out.value },
      period2: { clockIn: p2In.value, clockOut: p2Out.value },
    },
    summerSchedule: { hours: summerH, start: summerStart, end: summerEnd },
    holidays: getHolidays(),
  };

  chrome.storage.sync.set(config, () => {
    showStatus('Guardado correctamente.', 'success');
  });
});

function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.className = `status-msg ${type}`;
  setTimeout(() => {
    statusMsg.textContent = '';
    statusMsg.className = 'status-msg';
  }, 2500);
}
