# ioBios Chrome Extension

Extensión de Chrome para automatizar la gestión de tiempo en AppSheet. Añade botones de registro masivo directamente en la interfaz de AppSheet para imputaciones y fichajes.

---

## Instalación en Chrome

La extensión no está publicada en la Chrome Web Store, por lo que debe instalarse en modo desarrollador.

### Requisitos

- Google Chrome (o cualquier navegador Chromium)
- Acceso a la aplicación AppSheet de ioBios

### Pasos

1. Descarga o clona este repositorio en tu equipo.

2. Abre Chrome y navega a `chrome://extensions`.

3. Activa el **Modo de desarrollador** (interruptor en la esquina superior derecha).

4. Haz clic en **Cargar sin empaquetar** y selecciona la carpeta raíz del repositorio.

5. La extensión aparecerá en la lista. Asegúrate de que esté activada.

6. (Opcional) Fija la extensión en la barra de herramientas haciendo clic en el icono del rompecabezas y luego en el pin junto a **ioBios Extension**.

---

## Configuración inicial

Antes de usar la extensión debes configurarla desde la página de opciones.

1. Haz clic derecho en el icono de la extensión → **Opciones** (o accede desde `chrome://extensions`).

2. Configura las siguientes secciones:

### General

| Ajuste | Descripción |
|---|---|
| Extensión activada | Habilita o deshabilita la extensión globalmente |
| Saltarse fines de semana | No genera registros en sábado ni domingo |
| Saltarse festivos | Excluye festivos oficiales (requiere acceso a la app de Ausencias) |
| Saltarse vacaciones aprobadas | Excluye días de vacaciones aprobados |
| Máximo de horas por día | Límite de horas diarias para las imputaciones |

### Horario de verano (opcional)

Configura un rango de fechas con horas reducidas. Útil para jornada intensiva de verano.

### Imputaciones de tiempo

Añade los proyectos sobre los que imputes habitualmente y las horas por defecto para cada uno.

### Fichajes

Configura tus dos franjas horarias diarias:

- **Franja 1:** entrada y salida de la mañana (ej. 09:00 → 14:00)
- **Franja 2:** entrada y salida de la tarde (ej. 14:30 → 17:30)

---

## Uso

Una vez instalada y configurada, la extensión actúa automáticamente al abrir AppSheet.

### Acceder a AppSheet

Haz clic en el icono de la extensión en la barra de herramientas para abrir (o enfocar) la aplicación de AppSheet directamente.

### Botón "Añadir Todo" en Imputaciones

1. En AppSheet, navega a la vista **My Time Allocations**.
2. Aparecerá un botón **+ Añadir Todo** en la barra de navegación. El número en rojo indica los días pendientes de imputar.
3. Haz clic en el botón para abrir el panel de registro masivo.
4. Selecciona el **rango de fechas** usando los botones de mes o eligiendo fechas manualmente.
5. Revisa los proyectos y horas configurados.
6. Haz clic en **Guardar** para crear todas las imputaciones pendientes de una vez.

### Botón "Añadir Todo" en Fichajes

1. En AppSheet, navega a la vista **My Timesheet**.
2. Aparecerá un botón **+ Añadir Todo** con el conteo de días pendientes.
3. Haz clic para abrir el panel de fichaje masivo.
4. Selecciona el rango de fechas deseado.
5. Haz clic en **Guardar** para crear todos los fichajes de entrada y salida según tus franjas horarias configuradas.

---

## Funcionalidades

### Registro masivo de imputaciones

- Genera imputaciones de tiempo para múltiples proyectos en un rango de fechas completo.
- Detecta automáticamente las imputaciones ya existentes para evitar duplicados.
- Muestra un contador en tiempo real de los días pendientes de imputar.
- Soporta múltiples proyectos con horas configurables individualmente.

### Registro masivo de fichajes

- Crea fichajes de entrada y salida para todos los días de un rango de fechas.
- Utiliza las dos franjas horarias configuradas en opciones.
- Calcula automáticamente el total de horas por día.
- Evita la duplicación de fichajes ya existentes.

### Filtros inteligentes

- **Fines de semana:** omite sábados y domingos automáticamente.
- **Festivos:** consulta el calendario de festivos de la app de AppSheet y los excluye.
- **Vacaciones:** excluye los días de vacaciones aprobados en la app de Ausencias.
- **Máximo de horas:** respeta el límite diario configurado.

### Horario de verano

- Define un rango de fechas (ej. julio-agosto) con una jornada reducida.
- La extensión aplica automáticamente las horas de verano a las imputaciones y fichajes del periodo.

### Contador de pendientes

- Los botones **+ Añadir Todo** muestran un badge rojo con el número de días que aún no tienen registro.
- El contador se actualiza dinámicamente conforme AppSheet refresca la vista.

### Configuración sincronizada

- Toda la configuración se guarda en `chrome.storage.sync`, por lo que está disponible en todos los dispositivos donde uses Chrome con la misma cuenta de Google.
