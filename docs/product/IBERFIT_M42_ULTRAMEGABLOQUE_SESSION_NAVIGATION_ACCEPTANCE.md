# IBERFIT NEXT · M42 Ultramegabloque Cliente y circuito de sesiones

Checkpoint de continuidad · 14/10/2026 · **TRABAJO EN CURSO (Draft #935)**

## Fuentes reales verificadas
- Base canónica Canary/PROD M41: \`87891aa35c2f74eb122bf1863962e319a7b0f336\`.
- PR #935: \`feat/m42-integral-client-journey-ultramegabloque\`, no desplegar parcialmente.
- Motor: \`src/m26/workflows/session-builder.js\`, \`session-controller.js\`, \`session-execution.js\`, \`session-recovery.js\`, \`session-ui.js\`, \`rc39/session-policy.js\`.
- Rutas: \`src/m26/shell/navigation.js\`, \`shell-render.js\`, \`modules/route-render.js\`, \`route-view-model.js\`.
- Supabase PROD: \`sessions.status=publicado\` es estado de publicación distinto de \`domain_entities_v26.status=disponible\` (revisión 2) para la carrera observada. Existencia de permiso no implica entrega de comando: Live Workout todavía requiere QA real autenticada.
- El servicio de entrenamiento del usuario de prueba estaba activo; sin lock activo ni ejecución remota confirmada en el momento revisado.
- El error rojo global omitía la razón de inicio. Hallazgo corregido en PR Draft con mensajes recuperables.
- La sesión Carrera tenía 45 minutos totales y objetivo deportivo de 48 minutos: aviso honesto, sin alterar registro original.

## Auditoría sistemática — criterios de salida (NO confundir test contractual con E2E)

| Proceso | Auditoría concreta requerida | Condición de certificación |
|---|---|---|
| Coach / Cliente | Selección correcta del titular y alcance multiempresa | No mezclar clientes ni exponer Coach privado |
| Inicio de borrador | Crear, duplicar, reutilizar plantilla, sesiones recientes | IDs nuevos, no sobrescribir sesión publicada |
| Editor | Fuerza, isometría, cardio, carrera, natación, circuitos, biseries, triseries, intervalos | Unidades y metadatos por disciplina válidos |
| Entradas | Teclado, táctil, selects, cambios de foco, formularios 320px | Sin pérdida de foco o escritura ni overlays |
| Validación | Campos obligatorios, opciones, valores no numéricos, falta de catálogo | Error localizado, no falsos negativos |
| Guardado | Navegar, cambiar cliente, background, reconectar, cuota local | Recuperación identificada por propietario |
| Previsualización | Contenido final y duración, modalidad, visibilidad | Revisión invalidada tras editar |
| Publicación | Doble clic, pérdida de ACK, cambios concurrentes, offline, refresh fallido | Idempotencia, éxito canónico, cero duplicados |
| Modalidad | Guiada en app vs presencial con Coach | Cliente no inicia lo supervisado |
| Acceso Cliente | IRI-only, servicio pausado, publicada, disponible, en curso, retirada | No mostrar sesiones privadas ni crear ejecuciones indebidas |
| Live start | Estado local, revisión canónica, permiso, token, active lock | Un único \`SESION_INICIAR\` ACK real |
| Live durante | Pausa, reanudar, descanso, cronómetro, resultados, alternativas, sustituciones, desvíos | Registro real y continuidad |
| Sesión deportivo | Carrera: distancia, tiempo, FC, ritmo; natación: metros/ritmo 100m | No mezclar objetivos y mediciones |
| Finalización | Feedback, RPE, dolor consentido, serie omitida, conexión intermitente | ACK remoto íntegro, escritura durable |
| Recuperación | App background, reload, otro dispositivo, conflicto de revisión | Reconciliación sin replay duplicado |
| UX Cliente | «Hoy» contextual, Mi plan, calendario, próximos pasos, no culpabilizar | Inicio en ≤2 toques con sesión permitida |
| Coach UX | Acción dentro de sesión real, navegación y expediente persistente | Sin saltos innecesarios entre pantallas |
| Admin UX | Permisos, trazabilidad y gestión, no replicar UI Coach | Visión completa sin accesos indebidos |
| Perfil | Foto opcional privada, sustitución, borrado, lectura Coach asignado | Storage RLS + QA real, fallback inicial |
| Multidispositivo | iOS, Android, PWA, desktop, teclado y lector de pantalla | 320/390/768/1024/desktop sin bloqueos |

## Correcciones en curso ya integradas en el Draft
1. Prioridad de error específica para comienzo de Live Workout, y mensajes de recuperación localizados ES/EN/FR/PT.
2. Inicio remoto reconocido como éxito incluso si falla persistencia o render posterior; nunca reintentar una ejecución confirmada con un ID nuevo.
3. Aviso duraciones incompatibles 45/48 con prescripción inmutable.
4. Vibración háptica como acción accesoria separada de la cabecera, sin solapamiento.
5. Foto de perfil privada en Client y miniaturas Coach, con recorte WebP y revocación de blob tras sesión; migration QA exclusiva.
6. Navegación: móvil Cliente «Hoy · Mi plan · Sesiones · Progreso»; demás herramientas en «Más». Grupos contextualizados para Coach/Admin sin eliminar rutas.

## Seguridad de foto
Bucket \`iberfit-profile-avatars\` privado. Única ruta canónica por cliente \`<uuid>/avatar.webp\`. Solo titular Cliente autenticado puede escribir/retirar; Coach asignado y Admin autenticado pueden leer mediante RLS, no escribir. Sin URL pública, sin reutilizar fotos clínicas, sin biometría ni reconocimiento facial. Comprimir/recortar localmente a 320×320 WebP; 512 KiB máximo remoto. Cliente puede quitarla. Bloquear JS malicioso y MIME no permitido.

## Pendiente de certificación final M42
- Completar transformación integral Cliente «Hoy»/plan/contexto/feedback y pruebas de navegación.
- Ejecutar E2E real de inicio y cierre de entrenamiento en QA con cuenta Cliente, verificar rechazos de roles.
- Verificación real de Storage avatar Client/Coach/otros roles en QA, reemplazo/borrado/recuperación.
- Device Experience Gate en mobile/tablet/desktop y navegación «Más».
- PR Ready solo tras cierre funcional, certificación única, Canary trusted WebAuthn, promoción oficial y verificación PROD.
- Nunca declarar libre de errores solo por pasar test unitario o build.

## M42 extensión de fiabilidad
- Single-flight en apertura de Constructor y Live Workout, sin carreras al doble clic o cambio de roles/cliente.
- Cualquier respuesta local de recuperación/draft que llegue tras logout o cambio de contexto se descarta.
- Las fotos privadas se revisan cada 120 s al navegar o reabrir vistas; revocación 401/403 o eliminación 404 retira miniaturas antiguas y revoca URLs locales.
- Tests añadidos: `m42_workspace_entry_gate.test.mjs` y `m42_avatar_freshness_contract.test.mjs`. Pendiente QA autenticada.

## Verificación real de fotografía privada (M42)
- Nueva ejecución autenticada y sintética QA del bucket privado: upload, overwrite, lectura propia, lectura Coach asignado, bloqueo Cliente ajeno, bloqueo anónimo, bloqueo público, bloqueo escritura Coach, retirada propietaria y limpieza verificable.
- Script `scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs`, gatillado por `qa-real-write-cert.yml` cuando el PR está listo (no mientras sea Draft).
- Se abortan respuestas tardías de cargas fotográficas tras logout o cambio de identidad y un upload confirmado cuya descarga falle se comunica como preview pendiente, no como foto visible.

## M42 · Revalidación de sesión al recuperar estado local
- La selección de entrenamiento se reevalúa contra la colección actual una vez resuelta la recuperación asíncrona.
- No abrir una sesión que haya sido retirada, retirada de la visibilidad, reasignada a otro Cliente o sustituida por otra revisión durante la espera.
- Mantener evaluación autoritativa posterior en RPC de Supabase; la verificación local no sustituye RLS.

## Experiencia móvil · fotos de perfil
- Entrada JPG/PNG/WebP/HEIC/HEIF, convertida únicamente en el dispositivo a WebP 320×320 sin EXIF; fallback de decodificación con img y Object URL temporal si Safari no admite createImageBitmap.
- Descarga/cropping con protección de tamaño y tiempo, URL temporal revocada; nunca se sube original médico ni postural.
- Regresión `tests/m42_mobile_avatar_heic_fallback.test.mjs`.

## Fallo detectado por la certificación real y reparación
- La eliminación por propietario falló por usar POST `/object/remove/<bucket>` (interpretado como bucket `remove`). Contrato corregido a DELETE `/storage/v1/object/<bucket>` con `prefixes` y prueba de borrado remoto real.
- El QA gate limpia SOLO un avatar anterior cuyo contenido coincide byte-a-byte con la imagen sintética conocida, sin borrar fotografías ajenas ni tocar producción.
- La política visual/read-only acepta únicamente GET privado autenticado `/<uuid>/avatar.webp` de QA y conserva el bloqueo de escrituras/rutas públicas. Ausencia NoSuchKey se trata explícitamente como optativa, sin ocultar errores de autorización/servidor.

## M42 · Cierre de consistencia Storage/CDN de avatares
- La eliminación remota exige confirmación mediante endpoint metadata privado y descarga autenticada con `cacheNonce` renovado; HTTP 200 en DELETE no constituye éxito suficiente.
- Se tolera propagación transitoria con 13 comprobaciones acotadas a 2 s (máximo ~24 s); nunca se da por eliminado un objeto todavía accesible.
- Las lecturas privadas de Cliente/Coach utilizan `cacheNonce` diferente en cada acceso, incluso durante la revalidación por revocación; las fotos nunca usan URL pública.
