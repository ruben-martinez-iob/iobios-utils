'use strict';

// ── Holidays (Festivos) ────────────────────────────────────────────────────────
function addHolidayRow(list, entry) {
  // entry can be a string "YYYY-MM-DD" (legacy) or { date, name }
  const dateVal = typeof entry === 'string' ? entry : (entry && entry.date) || '';
  const nameVal = typeof entry === 'string' ? '' : (entry && entry.name) || '';

  const row = document.createElement('div');
  row.className = 'holiday-row';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'holiday-date';
  dateInput.value = dateVal;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'holiday-name';
  nameInput.placeholder = 'Nombre (opcional)';
  nameInput.value = nameVal;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-row';
  removeBtn.setAttribute('aria-label', 'Eliminar festivo');
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(dateInput);
  row.appendChild(nameInput);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

function renderHolidaysTab(holidays) {
  const container = document.getElementById('holidays-list-container');
  container.innerHTML = '';

  const section = document.createElement('section');
  section.className = 'tab-section';

  const h2 = document.createElement('h2');
  h2.textContent = 'Días festivos personalizados';

  const desc = document.createElement('p');
  desc.className = 'section-desc';
  desc.textContent = 'Festivos propios por año. Se excluyen al generar imputaciones cuando "Excluir festivos" está activo.';

  section.appendChild(h2);
  section.appendChild(desc);

  const buttonsRow = document.createElement('div');
  buttonsRow.className = 'buttons-row';

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn-import-db';
  importBtn.textContent = 'Importar desde DB';

  const csvBtn = document.createElement('button');
  csvBtn.type = 'button';
  csvBtn.className = 'btn-import-csv';
  csvBtn.textContent = 'Cargar CSV';

  buttonsRow.appendChild(importBtn);
  buttonsRow.appendChild(csvBtn);
  section.appendChild(buttonsRow);

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

    const headerRow = document.createElement('div');
    headerRow.className = 'year-header-row';

    const sortBtn = document.createElement('button');
    sortBtn.type = 'button';
    sortBtn.className = 'btn-sort';
    sortBtn.textContent = 'Ordenar por fecha';
    sortBtn.addEventListener('click', () => {
      const rows = Array.from(dateList.querySelectorAll('.holiday-row'));
      rows.sort((a, b) => {
        const dateA = a.querySelector('.holiday-date').value;
        const dateB = b.querySelector('.holiday-date').value;
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA.localeCompare(dateB);
      });
      dateList.innerHTML = '';
      rows.forEach(row => dateList.appendChild(row));
    });

    headerRow.appendChild(sortBtn);

    const dateList = document.createElement('div');
    dateList.className = 'holiday-list';

    const entries = holidays[year] || [];
    entries.forEach((entry) => addHolidayRow(dateList, entry));

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add holiday-add';
    addBtn.textContent = '+ Añadir festivo';
    addBtn.addEventListener('click', () => {
      addHolidayRow(dateList, { date: '', name: '' });
      dateList.lastElementChild.querySelector('.holiday-date').focus();
    });

    panel.appendChild(headerRow);
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

  // Check if absences DB is available and disable import button if not
  function checkAbsencesDbAvailability() {
    chrome.tabs.query({}, (tabs) => {
      const appsheetTab = tabs.find((t) => t.url && t.url.includes('appsheet.com'));
      if (!appsheetTab) {
        importBtn.disabled = true;
        importBtn.title = 'Abre la aplicación AppSheet primero para importar desde DB';
        return;
      }
      
      chrome.tabs.sendMessage(appsheetTab.id, { action: 'checkAbsencesDb' }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.hasAbsencesDb) {
          importBtn.disabled = true;
          importBtn.title = 'No se encontró la DB de ausencias. Abre la app de Absences primero.';
        } else {
          importBtn.disabled = false;
          importBtn.title = '';
        }
      });
    });
  }

  // Initial check
  checkAbsencesDbAvailability();

  // Re-check when tab is activated or every 5 seconds
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAbsencesDbAvailability();
    }
  });

  // Also re-check periodically when options page is visible
  const checkInterval = setInterval(() => {
    if (!document.hidden) {
      checkAbsencesDbAvailability();
    }
  }, 5000);

  // Clean up interval when page unloads
  window.addEventListener('beforeunload', () => {
    clearInterval(checkInterval);
  });

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
        resp.holidays.forEach(({ date, name }) => {
          const year = date.slice(0, 4);
          (byYear[year] = byYear[year] || []).push({ date, name: name || '' });
        });
        let added = 0;
        Object.entries(byYear).forEach(([year, entries]) => {
          addYearSection(parseInt(year, 10));
          const panel = yearPanelsContainer.querySelector(`.year-panel[data-year="${year}"]`);
          if (!panel) return;
          const dateList = panel.querySelector('.holiday-list');
          const existing = new Set(
            Array.from(dateList.querySelectorAll('.holiday-date')).map((i) => i.value)
          );
          entries.forEach((entry) => {
            if (!existing.has(entry.date)) { addHolidayRow(dateList, entry); added++; }
          });
        });
        showStatus(added > 0 ? `${added} festivo(s) importado(s) de la DB.` : 'No hay festivos nuevos en la DB.', 'success');
      });
    });
  });

  // CSV import functionality
  csvBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const csv = event.target.result;
          const lines = csv.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            showStatus('El CSV debe tener al menos una fila de datos.', 'error');
            return;
          }
          
          const byYear = {};
          let added = 0;
          
          // Skip header line, process data lines
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Parse CSV line (handle quoted commas)
            const match = line.match(/^"?([^"]+)"?,\s*"?([^"]*)"?$/);
            if (!match) continue;
            
            const [, dateStr, name] = match;
            
            // Convert dd/mm/yyyy to yyyy-mm-dd for input
            const dateParts = dateStr.split('/');
            if (dateParts.length !== 3) continue;
            
            const [day, month, year] = dateParts;
            const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            
            // Group by year
            if (!byYear[year]) byYear[year] = [];
            byYear[year].push({ date: formattedDate, name: name.trim() });
          }
          
          // Add to UI
          Object.entries(byYear).forEach(([year, entries]) => {
            addYearSection(parseInt(year, 10));
            const panel = yearPanelsContainer.querySelector(`.year-panel[data-year="${year}"]`);
            if (!panel) return;
            const dateList = panel.querySelector('.holiday-list');
            const existing = new Set(
              Array.from(dateList.querySelectorAll('.holiday-date')).map((i) => i.value)
            );
            entries.forEach((entry) => {
              if (!existing.has(entry.date)) { 
                addHolidayRow(dateList, entry); 
                added++; 
              }
            });
          });
          
          showStatus(`${added} festivo(s) importado(s) del CSV.`, 'success');
        } catch (error) {
          showStatus('Error al procesar el CSV: ' + error.message, 'error');
        }
      };
      
      reader.readAsText(file);
    });
    
    input.click();
  });

  section.appendChild(yearTabsBar);
  section.appendChild(yearPanelsContainer);
  container.appendChild(section);

  if (yearsToShow.includes(currentYear)) {
    activateYear(currentYear);
  } else if (yearsToShow.length > 0) {
    activateYear(yearsToShow[0]);
  }
}

function getHolidays() {
  const result = {};
  document.getElementById('holidays-list-container').querySelectorAll('.year-panel').forEach((panel) => {
    const year = panel.dataset.year;
    const entries = Array.from(panel.querySelectorAll('.holiday-row'))
      .map((row) => ({
        date: row.querySelector('.holiday-date').value,
        name: row.querySelector('.holiday-name').value.trim(),
      }))
      .filter((e) => e.date);
    if (entries.length > 0) result[year] = entries;
  });
  return result;
}
