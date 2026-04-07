'use strict';

// ── Config load / save ─────────────────────────────────────────────────────────
const DEFAULTS = {
  enabled: true,
  timeAllocations: [{ project: 'ATS/SCS Roadmap Acceleration', hours: 8 }],
  rules: { skipWeekends: true, skipHolidays: false, skipVacations: true, skipLeave: true, maxHoursPerDay: 8 },
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
  return val ? val.slice(5) : '';
}

function showStatus(message, type) {
  const statusMsg = document.getElementById('status-msg');
  statusMsg.textContent = message;
  statusMsg.className = `status-msg ${type}`;
  setTimeout(() => {
    statusMsg.textContent = '';
    statusMsg.className = 'status-msg';
  }, 2500);
}

function loadConfig() {
  chrome.storage.sync.get(DEFAULTS, (config) => {
    document.getElementById('enabled').checked = config.enabled;

    const allocationsList = document.getElementById('allocations-list');
    allocationsList.innerHTML = '';
    const allocations = config.timeAllocations.length ? config.timeAllocations : DEFAULTS.timeAllocations;
    allocations.forEach(({ project, hours }) => renderAllocationRow(project, hours));

    document.getElementById('skip-weekends').checked  = config.rules.skipWeekends;
    document.getElementById('skip-holidays').checked  = config.rules.skipHolidays;
    document.getElementById('skip-vacations').checked = config.rules.skipVacations;
    document.getElementById('skip-leave').checked     = config.rules.skipLeave ?? true;
    document.getElementById('max-hours').value = config.rules.maxHoursPerDay;
    checkHoursWarning();

    document.getElementById('p1-clock-in').value  = config.timeSheets.period1.clockIn;
    document.getElementById('p1-clock-out').value = config.timeSheets.period1.clockOut;
    document.getElementById('p2-clock-in').value  = config.timeSheets.period2.clockIn;
    document.getElementById('p2-clock-out').value = config.timeSheets.period2.clockOut;
    updateDerived();
    updateSummerInfo();

    renderHolidaysTab(config.holidays || {});

    const ss = config.summerSchedule || DEFAULTS.summerSchedule;
    document.getElementById('summer-hours').value = ss.hours;
    document.getElementById('summer-start').value = mdToInputValue(ss.start);
    document.getElementById('summer-end').value   = mdToInputValue(ss.end);
  });
}

function validateAndSave() {
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

  const maxH = parseFloat(document.getElementById('max-hours').value);
  if (isNaN(maxH) || maxH <= 0 || maxH > 24) {
    showStatus('El máximo de horas debe estar entre 0 y 24.', 'error');
    return;
  }

  const in1  = timeToMinutes(document.getElementById('p1-clock-in').value);
  const out1 = timeToMinutes(document.getElementById('p1-clock-out').value);
  const in2  = timeToMinutes(document.getElementById('p2-clock-in').value);
  const out2 = timeToMinutes(document.getElementById('p2-clock-out').value);

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

  const summerH = parseFloat(document.getElementById('summer-hours').value);
  if (isNaN(summerH) || summerH <= 0 || summerH > 24) {
    showStatus('Las horas de jornada de verano deben estar entre 0 y 24.', 'error');
    return;
  }
  const summerStart = inputValueToMD(document.getElementById('summer-start').value);
  const summerEnd   = inputValueToMD(document.getElementById('summer-end').value);
  if (!summerStart || !summerEnd) {
    showStatus('Las fechas de jornada de verano son obligatorias.', 'error');
    return;
  }
  if (summerStart > summerEnd) {
    showStatus('La fecha de inicio de jornada de verano debe ser anterior al fin.', 'error');
    return;
  }

  const config = {
    enabled: document.getElementById('enabled').checked,
    timeAllocations: allocations,
    rules: {
      skipWeekends:  document.getElementById('skip-weekends').checked,
      skipHolidays:  document.getElementById('skip-holidays').checked,
      skipVacations: document.getElementById('skip-vacations').checked,
      skipLeave:     document.getElementById('skip-leave').checked,
      maxHoursPerDay: maxH,
    },
    timeSheets: {
      period1: { clockIn: document.getElementById('p1-clock-in').value,  clockOut: document.getElementById('p1-clock-out').value },
      period2: { clockIn: document.getElementById('p2-clock-in').value,  clockOut: document.getElementById('p2-clock-out').value },
    },
    summerSchedule: { hours: summerH, start: summerStart, end: summerEnd },
    holidays: getHolidays(),
  };

  chrome.storage.sync.set(config, () => {
    showStatus('Guardado correctamente.', 'success');
  });
}
