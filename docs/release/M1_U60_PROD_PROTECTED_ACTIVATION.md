# IBERFIT M1 · Activación protegida U60 PROD (preparada, no ejecutada)

## Alcance y estado

- PR única de M1: #1335; el código U60 del navegador sigue limitado a Canary/QA.
- **La aprobación U71 QA es una prueba de backend**, no una prueba del reproductor en PROD ni una activación del RPC en PROD.
- El guion `supabase/release-procedures/20261112_m1_u60_prod_guarded_enable.sql` **no se ejecuta con merge, build ni producción-promote**. Es una operación excepcional, explícita y reversible. Hasta que se complete la certificación física y el frontend aprobado, no ejecutarlo.
- Datos y permisos de clientes de PROD: sin cambios. La supresión de identidades se gestiona exclusivamente en otro hilo, fuera de M1.

## Evidencia consolidada de requisitos

1. Ocho versiones U30–U60 inscritas en `supabase_migrations.schema_migrations`; tabla ocurrencias con RLS y acceso directo denegado a `authenticated` y `anon`.
2. Guardas de escritura `u60_dated_execution_update_receipt` y `u60_typed_execution_fence` activas. Los RPC `iberfit_occurrence_api_u60_v1` y `iberfit_occurrence_detail_v1` tienen SHA de definición iguales entre QA y PROD en el checkpoint M1.
3. `iberfit_occurrence_api_v1` permanece sin EXECUTE directo para usuarios autenticados. Las dos funciones públicas versionadas solo pasarán a `authenticated`, **nunca a `anon` ni `service_role`**. El origen ya valida `auth.uid()`, rol, propiedad, sesión fuente y cita.
4. Los clientes dados de alta por `iberfit_create_client_draft_v12` pasan por el escritor `_pre_v65e`, que inscribe `m26_canary_clients_v26` transaccionalmente después de confirmar el Coach. Esto no autoriza accesos sin JWT ni vínculo.
5. QA U71 [run #43301052278](https://github.com/iberfit/iberfit-m26-app/actions/runs/43301052278), attempt 1 preflight READ-ONLY PASS y attempt 2 read/write QA PASS: dos fechas, primera ejecutada y finalizada, segunda confirmada, coach readback, Client B denegado.

## Secuencia obligatoria de autorización de PROD

1. Certificar reproductor **UI real** en Chrome móvil y escritorio: cargar el calendario privado, abrir fecha propia, comenzar/pausar/reanudar, series/RPE/feedback, cierre ACK, reinicio/offline y reconocimiento Coach. Debe haber cobertura en 320/390/1024/1440, WebAuthn Coach y denegación Cliente B.
2. Certificar el **bootstrap normal** de Cliente y Coach con historia sintética larga y sin HTTP500/SQLSTATE57014; el selector QA `iberfit_u71_dated_candidates_qa_v1` solo arregla preflight U71, no el bootstrap de login real.
3. Verificar **M44 fresco**, restore PostgreSQL+Storage y recuperación Auth/Vault relevante, controles por SHA/rama, migraciones, esquema, integridad y snapshot de ACL; preparar rollback de frontend y SQL.
4. Desplegar frontend U60 certificado en Canary, verificar la versión LIVE y repetir smoke autenticado con uso real del reproductor. No permitir que UI muestre "Canary" ni que use fallback legacy para una ocurrencia.
5. Solo con 1–4 verde y decisión de promoción protegida: ejecutar `enable.sql` sobre proyecto PROD exacto `pjhmrhejsoofmouedavw` con conector; comprobar dos grants, no anon, RLS, login real, dos fechas y recuperación. El orden exacto de corte de UI/grants debe evitar una ventana de UI clicable que aún devuelva 403; usar gate cerrado hasta terminar todo.
6. Ante inconsistencia: **cerrar primero la UI para nuevos inicios**, recuperar/completar operaciones inciertas y finalizar cualquier fecha `en_curso`. El propio `disable.sql` aborta si hay entrenamientos activos; nunca revoca el endpoint de guardado mientras alguien lo usa. Solo después verificar la continuidad del diario cifrado, revocar permisos con hash/entorno exactos y conservar íntegramente los resultados confirmados. Si no hay drenaje garantizado, conservar temporalmente acceso autenticado y escalar la incidencia.

**No inferir el cierre del macrobloque por la mera existencia de estos archivos.** El botón 'Comenzar entrenamiento' autónomo legado mantiene su propio ACK y protección de fechas; U60 no debe eludir ese contrato.
