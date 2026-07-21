# IBERFIT M26 · RC23 · Castellano y experiencia coherente

## Alcance

RC23 convierte el castellano de España (`es-ES`) en un requisito verificable de producto. La regla se aplica a todo texto visible: navegación, botones, estados, avisos, errores, formularios, ayudas, accesibilidad, datos de dispositivos y nombres de archivos descargables.

Los identificadores internos, códigos de comandos y nombres propios de plataformas permanecen sin traducir cuando forman parte de contratos técnicos. Nunca se muestran directamente como explicación al usuario.

## Cambios principales

- `Check-in` pasa a **registro de bienestar**.
- `Coach` pasa a **entrenador**.
- `Online` pasa a **en línea**.
- `Guiada en app` pasa a **guiada en la aplicación**.
- `Wearables` pasa a **datos de dispositivos** o **dispositivos conectados**.
- `HRV` pasa a **VFC**.
- Los estados internos `ready`, `pending`, `conflict` y `rejected` se presentan como **Preparado**, **Pendiente**, **Conflicto** y **Rechazada**.
- Los errores remotos se explican con lenguaje humano y no mediante códigos internos.
- Los nombres de descargas son `iberfit-plantilla-dispositivos.json` e `iberfit-resumen-dispositivos-AAAA-MM-DD.json`.

## Experiencia corregida

- Se corrigió el desbordamiento de la pantalla de acceso en móviles.
- Los contadores usan singular y plural correctos.
- Los avisos de disponibilidad ya no producen textos como “Registros de bienestar conectado”.
- Se añadieron escenarios visuales específicos para acceso en curso y error de acceso.
- La PWA declara `lang: es-ES` y el caché se incrementa a `m26-rc23` para evitar conservar textos antiguos.

## Verificación

- Regresión completa de pruebas.
- Gate específico de castellano.
- Auditoría de texto visible y atributos accesibles en 22 vistas Chromium.
- Recorridos integrados de entrenador y cliente con auditoría lingüística dinámica.
- Nombres propios admitidos: Apple Health, Health Connect, Google Health API, Fitbit, Pixel Watch, Garmin Connect y Oura.

## Límites

RC23 es una validación local. No valida cuentas reales, permisos externos, dispositivos físicos, Supabase remoto, canario Cloudflare ni rollback productivo. `deployable` permanece en `false`.


## Biblioteca de ejercicios

El catálogo protegido M25.2 no se modifica. RC23 incorpora una capa de presentación que traduce al castellano los nombres y materiales de los 367 ejercicios. Los nombres técnicos heredados se conservan únicamente como alias internos para que búsquedas antiguas sigan funcionando. Ejemplos: «Clamshell» se presenta como «Apertura de cadera en decúbito lateral», «Hip thrust» como «Empuje de cadera» y «Step-up» como «Subida al cajón». El campo visible «Tempo» pasa a «Ritmo de ejecución».
