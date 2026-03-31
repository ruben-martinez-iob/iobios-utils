'use strict';

// ── Holidays (Festivos) ────────────────────────────────────────────────────────
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
  const festivosPanel = document.getElementById('tab-festivos');
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
  document.getElementById('tab-festivos').querySelectorAll('.year-panel').forEach((panel) => {
    const year = panel.dataset.year;
    const dates = Array.from(panel.querySelectorAll('.holiday-date'))
      .map((i) => i.value)
      .filter((v) => v);
    if (dates.length > 0) result[year] = dates;
  });
  return result;
}
