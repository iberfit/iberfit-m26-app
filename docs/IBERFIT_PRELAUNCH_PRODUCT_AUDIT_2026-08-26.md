# IBERFIT — Checkpoint de producto y pre-lanzamiento

## Identidad canónica
- Nombre final: **IBERFIT**
- Dominio final: **app.iberfit.cl**
- `M26`, `RCxx`, `QA` y demás nombres técnicos: **solo desarrollo interno**
- Ningún identificador técnico debe aparecer en la experiencia final de cliente o coach.

## Posicionamiento que debemos preservar
IBERFIT no debe ser una app genérica de rutinas. El diferencial es:

**evaluar → diagnosticar (IRI) → planificar → ejecutar → medir respuesta → contextualizar → revisar → ajustar → demostrar progreso**

Capacidades fuertes ya existentes:
- IRI por dominios
- planificación por ciclos/sesiones
- ejecución detallada: series, carga/reps, RPE/RIR, descansos, incidencias, omisiones, sustituciones, ejercicios añadidos
- memoria longitudinal por ejercicio
- adherencia y progreso longitudinal
- cockpit del coach
- bienestar: energía, sueño, estrés, dolor, fatiga, motivación
- hábitos
- agenda
- comunicación coach-cliente
- informes
- biblioteca de ejercicios
- arquitectura de wearables
- offline/sync, auditoría, permisos y seguridad

## Mejoras obligatorias antes del lanzamiento

### P0 — Superficie pública 100 % IBERFIT
- eliminar M26/RC/QA visibles
- branding, iconos, manifest PWA, splash, metadata, títulos y enlaces como IBERFIT
- canonicalizar app.iberfit.cl
- errores de usuario sin códigos técnicos visibles
- eliminar rutas/enlaces públicos hacia superficies antiguas o de desarrollo

### P0 — Auditoría end-to-end Cliente / Coach / Admin
Cada pantalla se clasifica:
- TERMINADA
- MEJORAR_ANTES_LANZAMIENTO
- OCULTAR_HASTA_LISTA
- RETIRAR_CON_EVIDENCIA

No lanzar con placeholders, acciones sin destino, controles que no persisten, enlaces muertos o estados vacíos sin explicación.

### P0 — Coherencia de navegación y siguiente acción
- cada alerta abre el lugar exacto donde se resuelve
- cockpit con siguiente acción útil
- estados vacíos explican qué falta y cómo activarlo
- errores/offline/conflictos con recuperación clara
- evitar duplicidad entre Hoy, Expediente, Progreso, Actividad e Inteligencia

### P0 — Recorrido diferencial IRI → plan → sesión → revisión
Debe poder completarse de extremo a extremo:
1. crear/completar IRI
2. interpretar dominios
3. crear planificación
4. publicar sesión
5. ejecutar
6. registrar feedback/rendimiento
7. revisar progreso/memoria
8. explicar el ajuste de la siguiente planificación

### P1 — Comunicación premium contextual
Antes de lanzar, elevar el chat más allá de texto:
- fotos
- vídeos cortos
- nota de voz
- respuesta asociada a sesión, ejercicio o incidencia
- feedback del coach contextual y trazable
No convertirlo en red social pública.

### P1 — Notificaciones inteligentes + deep links
Como mínimo:
- sesión/planificación publicada
- sesión próxima
- sesión iniciada no cerrada
- respuesta del coach
- cambio de agenda
- bienestar pendiente cuando corresponda
- informe nuevo
- alerta operativa relevante
Toda notificación abre directamente la acción correcta y respeta preferencias/consentimiento.

### P1 — Progreso como historia comprensible
Integrar, con datos reales:
- adherencia
- fuerza/rendimiento por patrones y ejercicios
- composición corporal
- respuesta cardiovascular / IRI
- bienestar
- sesiones completadas
- hitos y cambios de ciclo
No crear score opaco único.

### P1 — Biblioteca audiovisual prioritaria
Para ejercicios principales:
- vídeo corto
- técnica/objetivo
- errores frecuentes
- cues
- regresión/progresión
- alternativa por material/limitación
- patrón de movimiento

### P0 — Prueba real móvil / desktop / PWA
- cliente móvil como caso principal
- coach desktop + móvil
- instalación PWA
- táctil, teclado, accesibilidad básica
- tamaños de pantalla
- offline/reconexión
- rendimiento percibido
- sesión completa sin pérdida de datos

### P0 — Gate técnico y de seguridad
- regresión completa verde
- CI verde en commit exacto
- migraciones reproducibles y ledger consistente
- QA autenticada Cliente/Coach/Admin
- RLS negative tests
- aislamiento entre clientes
- permisos por rol
- ausencia de escritura directa no autorizada
- backup/snapshot
- rollback ensayado
- smoke del dominio candidato

## No deben bloquear el primer lanzamiento salvo que ya estén listos
- Apple Health/HealthKit nativo
- Health Connect/Samsung Health productivo
- Wear OS
- BLE directo
- Strava OAuth
- Garmin/Fitbit/Oura sujetos a aprobación externa
- nutrición avanzada
- pagos
- feed social público
- leaderboard global

## Decisiones que se mantienen
- fatiga y motivación son señales opcionales 0–10 y descriptivas
- ausencia ≠ cero
- no modificar carga automáticamente por fatiga/motivación
- no readiness score clínico opaco
- el entrenador conserva la decisión
- no duplicar feedback post-sesión
- retos privados por defecto
- no publicación social automática
- no leaderboard público por defecto
- no volver a Apps Script/Sheets
- preservar trazabilidad, privacidad, RLS y command bus

## Orden operativo antes de lanzar
1. inventario read-only de superficies actuales
2. auditoría Cliente/Coach/Admin pantalla por pantalla
3. matriz de paridad
4. cierre de P0 identidad/navegación/flujos incompletos
5. excelencia IRI → plan → ejecución → revisión
6. comunicación multimedia/contextual
7. notificaciones inteligentes + deep links
8. progreso longitudinal como historia
9. biblioteca audiovisual prioritaria
10. QA móvil/desktop/PWA y estados offline/error
11. seguridad, RLS y regresión completa
12. backup/snapshot
13. build candidato reproducible
14. smoke dominio candidato
15. rollback verificado
16. cutover controlado a app.iberfit.cl
17. smoke posterior y observación inmediata

## Estado técnico verificado 2026-08-26
- Rama de trabajo: `canary/rc74-4`
- Commit verificado: `4f8fc6280759dffe4267d0eb3539c41dcd76e05e`
- RC74.4S fatiga/motivación: versionada, CI verde y aplicada en QA
- QA: fail-closed; producción no tocada
- Próximo gate: `APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY`

## Nota de persistencia
El intento de actualizar `docs/APP_IBERFIT_CL_LAUNCH_PARITY.md` en GitHub fue rechazado por el conector con HTTP 403. Este archivo funciona como checkpoint persistente en la conversación hasta que se recupere escritura GitHub.


---

# Inventario read-only · primeros hallazgos P0

## 1. Identidad visible
**Estado: TERMINADA / preservar**
- Título HTML: IBERFIT.
- application-name: IBERFIT.
- Mensaje de acceso: “Entrenamiento personal con criterio”.
- Descripción: “Diagnóstico, planificación, control y seguimiento”.
- Pantalla offline: IBERFIT.
- Recuperación de contraseña dispone de copy público IBERFIT.

## 2. Ruta técnica M26 en PWA
**Estado: MEJORAR_ANTES_LANZAMIENTO · P0**
Aunque el texto visible es IBERFIT, el artefacto PWA actual usa:
- manifest id `/m26/`
- start_url `/m26/?source=pwa`
- scope `/m26/`
- iconos `/m26/icons/...`
- service worker `/m26/sw.js`
- offline `/m26/offline.html`

La raíz `/` se reescribe internamente a `/m26/index.html`, pero el service worker solo controla `/m26/`.
Antes del cutover hay que unificar raíz, manifest, service worker, offline y assets bajo la experiencia canónica de `https://app.iberfit.cl/`, evitando que `/m26/` quede como identidad instalable o URL funcional del producto.

## 3. Centro “Verificación”
**Estado: OCULTAR_HASTA_LISTA · P0**
La navegación del coach expone actualmente:
- Verificación
- Centro de verificación
- alias interno `qa → verificacion`

Es un centro técnico de operaciones pendientes/conflictos/rechazos. No debe salir como herramienta comercial con semántica QA. Opciones futuras:
- mantenerlo interno;
- o transformarlo en un centro de sincronización/estado del cliente con lenguaje de producto.

Para primer lanzamiento: ocultar de la navegación comercial salvo rediseño explícito.

## 4. Configuración por entorno
**Estado: MEJORAR_ANTES_LANZAMIENTO · P0**
El generador RC74.4 actual sí está correctamente fail-closed para QA y exige el proyecto QA `gjztkdwfmunnzhtvxrsu`.
Sin embargo, `runtime-config.example.js` mezcla el projectRef de producción `pjhmrhejsoofmouedavw` con `qaOnly:true`, por lo que el template es ambiguo.

Antes de lanzar:
- configuración QA inequívoca;
- configuración producción inequívoca;
- producción con `qaOnly:false`;
- build debe fallar si projectRef/origin/modo no corresponden;
- no debe existir un template que facilite mezclar QA y producción.

## 5. CSP / permisos para comunicación multimedia
**Estado: DEPENDENCIA P1**
Los headers actuales declaran:
- `camera=()`
- `microphone=()`

Esto es seguro para la aplicación actual, pero bloquea una futura captura directa mediante cámara/micrófono para vídeo o notas de voz.
Si la comunicación multimedia se incluye antes del lanzamiento:
- habilitar solo los permisos estrictamente necesarios;
- mantener least privilege;
- probar consentimiento del navegador;
- no ampliar permisos hasta que la función exista y tenga gate de privacidad.

## 6. Estado de operaciones en shell
**Estado: REVISAR_ANTES_LANZAMIENTO**
El shell muestra estado de operaciones locales y conflictos. Cuando no hay contadores, el fallback actual es “Estado local pendiente de revisión”.
Debe comprobarse en QA visual porque puede transmitir un problema aunque no exista ninguno.
Objetivo final:
- estado limpio = mensaje tranquilizador o no mostrar ruido;
- conflicto real = acción clara;
- nunca mostrar códigos M26 al cliente.

## 7. Errores
**Estado: BUENA BASE / preservar**
La aplicación ya traduce errores comunes a mensajes de usuario:
- sesión sin autorización;
- fallo de red;
- cuenta no autorizada;
- fallo genérico con protección del dato local.

Los códigos `M26_*` se utilizan para diagnóstico interno/console.
Gate final: confirmar que ninguna vista, toast, diálogo o notificación muestra esos códigos al usuario final.

## Próximo tramo del inventario
1. navegación Cliente completa;
2. navegación Coach completa;
3. navegación Admin completa;
4. placeholders/dead ends;
5. deep links/acciones del cockpit;
6. Retos/Ajustes y coherencia de privacidad;
7. mensajes/notificaciones;
8. flujo IRI → planificación → ejecución → revisión;
9. estados vacíos/error/offline;
10. matriz final de paridad.


---

## P0 detectado durante auditoría de navegación Cliente

- La barra inferior Cliente estaba definida pero `renderClientRouteShell()` no insertaba `renderClientBottomNav(vm)`, por lo que el test histórico validaba presencia de código, no render real.
- El menú “Más” ofrecía `expediente`, `biblioteca` y `verificacion`, áreas que el guard de rutas no permite al rol `client`.
- `retos` y `ajustes` sí están permitidos, pero su render especial saltaba el wrapper de Cliente y por tanto podía perder la barra inferior.
- El estado operativo limpio decía “Estado local pendiente de revisión”, generando una falsa alarma.
- El buscador Coach contenía el typo visible `clietnes`.

### Decisión P0

1. Renderizar realmente la barra inferior en todas las vistas Cliente.
2. El menú Cliente solo puede enlazar áreas permitidas por el contrato de rol.
3. “Más” queda con Informes, Bienestar y hábitos, Mensajes, Retos y Ajustes.
4. No abrir `expediente`, `biblioteca` o `verificacion` al Cliente como atajo. Biblioteca podrá exponerse después mediante una proyección Cliente explícita y testeada.
5. Retos/Ajustes conservan el shell Cliente y la navegación inferior.
6. Estado limpio = “Sin cambios locales pendientes” (no afirma sincronización remota sin verificación).
7. Corregir typos visibles.
8. El test RC38 pasa de comprobar cadenas a comprobar render y coherencia real de permisos.


### Corrección adicional detectada durante la regresión
- RC44 conservaba una regla histórica `display:none!important` sobre `.m26-client-bottom-nav-layer` y anulaba la barra actual porque `rc44.css` se carga después de `client-bottom-nav.css`.
- Pre-lanzamiento debe retirar esa anulación histórica y dejar la navegación Cliente bajo la hoja canónica `src/m26/ui/client-bottom-nav.css`.
- El estado sin operaciones locales será “Sin cambios locales pendientes”; no se utilizará “Todo sincronizado” porque el login RC64.2B no realiza verificación remota inicial.
