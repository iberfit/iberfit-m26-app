# P0 · Supresión selectiva integral de personas · contrato de seguridad

**Estado:** inventario y guardia de evidencia únicamente; NO hay ejecutor de borrado,
ni autorización de SQL destructivo, ni despliegue a PROD. La guardia revisa la
consistencia de un manifiesto PRIVADO proporcionado externamente, **no** demuestra
por sí sola que ese manifiesto coincida con la base de datos.

## Alcance
- Exclusivamente las dos personas de prueba expresamente autorizadas, tras
  comprobación exacta de identidad, email, organización y vínculo Auth.
- Una tercera persona protegida conserva ficha, IRI inicial, consentimiento,
  capturas, informes y ausencia de servicio de entrenamiento activo.
- Los identificadores, correos, rutas Storage y datos clínicos se mantienen
  fuera del repositorio, PR, CI, logs y capturas.
- No se activa ningún borrado si la identificación del sujeto es ambigua,
  especialmente si un nombre puede coincidir con el de una cuenta profesional.

## Observación verificada en PROD el 10/11/2026
- La RPC actual de eliminación de expediente es una **baja parcial** que
  conserva Auth y falla ante referencias no gestionadas; no sirve para
  supresión completa.
- La función Edge actual de baja de usuario emplea Auth *soft-delete* y no
  equivale a purgar una persona con datos IRI, sesiones, Storage o Connected360.
- Hay decenas de relaciones client_id y FK a auth.users, auditoría histórica,
  consentimientos y al menos un objeto Storage atribuible a una cuenta de
  prueba. Hay que clasificar cada referencia, incluidas claves incrustadas
  en JSON, operaciones pendientes y registros que no tienen FK declarada.
- Backup M44 PG+Storage/restore no certifica por sí solo Hosted Auth.

## Procedimiento exigido antes del ejecutor
1. Identificación privada exacta de dos sujetos y exclusión expresa del tercero.
2. Inventario **autoritativo** READ-ONLY de PG, Auth, Storage, índices, JSON
   operacional, mensajes, notificaciones, reloj, jobs y API/Edge, con
   huella de esquema, propietario y ámbito de organización.
3. Política de retención legal por tabla y campo: eliminar, anonimizar o
   preservar sólo evidencias estrictamente no personales.
4. Backup verificable y restauración aislada de PG, bytes Storage y
   Hosted Auth/identidades; recuperación documentada para cada paso irreversible.
5. Modelo transaccional con orden, fences de escritura, revocación de sesiones
   (los JWT existentes pueden seguir siendo válidos hasta caducar),
   idempotencia, recibos, compensaciones y postchecks negativos.
6. Borrado de archivos por **Storage API**, nunca por DELETE SQL de
   storage.objects, que dejaría bytes huérfanos.
7. Ejecución exclusiva por operador Admin autenticado con assurance
   privilegiada y verificación independiente del tenant/targets.
8. Ensayo QA con dos personas sintéticas y una protegida, autoría y
   pruebas negativas de Cliente/Coach/Admin, reintentos, cortes en cada fase,
   RLS, Auth, Storage, readback y rollback antes de tocar PROD.

## Guardia provisional (sin efectos laterales)

\`node scripts/data-safety/check_person_erasure_readiness.mjs <ruta-privada-evidencia.json>\`

Un resultado \`inventoryComplete=true\` significa únicamente que las
**declaraciones del documento** satisfacen el contrato sintáctico y lógico.
\`productionMutationPermitted\` es **siempre false**. No consumir su salida
como token de autorización ni permitir que una Edge Function la interprete
como permiso. Las verificaciones deben reconstruir los hechos directamente
desde fuentes autoritativas inmediatamente antes de cada fase.

**Bloqueo de salida:** este macrobloque NO se fusiona ni se promueve por
contener sólo esta guardia; resta el ejecutor revisado, QA y gates completos.
