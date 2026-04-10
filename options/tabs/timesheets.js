'use strict';

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
  const p1In  = document.getElementById('p1-clock-in');
  const p1Out = document.getElementById('p1-clock-out');
  const p2In  = document.getElementById('p2-clock-in');
  const p2Out = document.getElementById('p2-clock-out');
  const derivedInfo = document.getElementById('derived-info');

  const in1  = timeToMinutes(p1In.value);
  const out1 = timeToMinutes(p1Out.value);
  const in2  = timeToMinutes(p2In.value);
  const out2 = timeToMinutes(p2Out.value);

  if (in1 === null || out1 === null || in2 === null || out2 === null) {
    derivedInfo.textContent = '';
    derivedInfo.classList.remove('over-limit');
    return;
  }

  const pause  = in2 - out1;
  const worked = (out1 - in1) + (out2 - in2);
  derivedInfo.textContent = `Pausa: ${minutesToHM(pause)} · Total trabajado: ${minutesToHM(worked)}`;

  const maxMinutes = (parseFloat(document.getElementById('max-hours').value) || 8) * 60;
  derivedInfo.classList.toggle('over-limit', worked > maxMinutes);
}

function subtractMinutesStr(time, minutes) {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m - minutes;
  if (total < 0) return '';
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function updateSummerInfo() {
  const co2 = document.getElementById('p2-clock-out').value;
  const summerTsInfo = document.getElementById('summer-ts-info');

  const normalHours = parseFloat(document.getElementById('max-hours').value) || 8;
  const summerHours = parseFloat(document.getElementById('summer-hours').value);

  if (!co2 || isNaN(summerHours) || summerHours >= normalHours) {
    summerTsInfo.textContent = '';
    return;
  }

  const diffMinutes = Math.round((normalHours - summerHours) * 60);
  const summerCo2 = subtractMinutesStr(co2, diffMinutes);

  if (!summerCo2) {
    summerTsInfo.textContent = '';
    return;
  }

  const diffLabel = minutesToHM(diffMinutes);
  summerTsInfo.textContent =
    `☀ Durante la jornada de verano la salida de la franja 2 se adelanta ${diffLabel}: ${co2} → ${summerCo2}.`;
}

// ── Listeners ──────────────────────────────────────────────────────────────────
['p1-clock-in', 'p1-clock-out', 'p2-clock-in', 'p2-clock-out'].forEach((id) => {
  document.getElementById(id).addEventListener('input', () => { updateDerived(); updateSummerInfo(); });
});
['max-hours', 'summer-hours'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateSummerInfo);
});
