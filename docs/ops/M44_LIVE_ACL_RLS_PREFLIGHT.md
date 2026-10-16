# M44 — Auditoría real de ACL/RLS sin mutaciones ni credenciales

## Evidencia ejecutada sobre Supabase PROD y QA — 16 de octubre de 2026

Esta auditoría **leyó únicamente catálogos PostgreSQL** de PROD (`pjhmrhejsoofmouedavw`) y QA (`gjztkdwfmunnzhtvxrsu`). No ejecuta operaciones DDL/DML ni consulta ninguna fila de clientes, sesiones, tokens, Auth o Vault. Se corrió el SQL **exacto** de `scripts/ops/m44_live_acl_rls_preflight.sql` sobre ambos proyectos y sus JSON agregados fueron válidos.

| Señal agregada | PROD | QA |
|---|---:|---:|
| Tablas de public, storage, auth y vault verificadas | 164 | 164 |
| Tablas public | 128 | 128 |
| GRANT TRUNCATE de anon/authenticated en cuatro esquemas | **0** | **0** |
| DML concedido sobre tablas sin RLS en cuatro esquemas | **0** | **0** |
| GRANT DELETE en public a anon | 44 | 43 |
| GRANT TRIGGER en public a anon | 51 | 51 |
| GRANT DELETE en public a authenticated | 52 | 51 |
| GRANT TRIGGER en public a authenticated | 52 | 52 |
| GRANT INSERT en public a anon | 45 | 44 |
| GRANT INSERT en public a authenticated | 59 | 58 |

Se ha comprobado que **no** están presentes los grants TRUNCATE de la alerta histórica #946, y que todas las tablas con DML concedido a estas dos identidades tienen RLS habilitada.

### Matiz de seguridad indispensable

- Estos recuentos confirman que **el privilegio de tabla existe**, no que el rol pueda alterar filas. Para DML, RLS puede denegar las filas. En PROD, de las 44 tablas public con `DELETE` otorgado a `anon`, 43 no presentan una política de DELETE aplicable directamente al rol y quedan sujetas a denegación por defecto. La política con alcance `PUBLIC` restante, en `rls_probe_results`, exige `iberfit_role() = 'admin'`; **no se ha demostrado desde aquí que sea alcanzable por `anon`**.
- `TRIGGER` permite, en circunstancias con ejecución SQL suficiente, crear disparadores y **no es bloqueado por RLS**. No significa que la API REST conceda DDL; revisar exposición efectiva, función propietaria, permisos por defecto y dependencias antes de revocar. El objetivo a largo plazo es mínimo privilegio sin romper funciones internas.
- Una función `SECURITY DEFINER` puede saltarse RLS. La igualdad de flags y política SQL no acredita resistencia ante IDOR, uso de parámetros externos ni control de permisos dentro de RPC.
- La presencia de RLS no sustituye los ensayos negativos **como rol real** ni la revisión de permisos por función, propietario y `search_path`.

## Instrumentos preservados

- `scripts/ops/m44_live_acl_rls_preflight.sql`: una consulta única, agregada, snapshot MVCC, lectura del catálogo de las cuatro áreas y diez métricas exactas, sin identificadores de personas ni tablas específicas.
- `scripts/ops/m44_live_acl_rls_contract.mjs`: valida estrictamente el JSON del censo y **falla cerrado** si reaparecen `TRUNCATE` o permisos DML sobre tablas sin RLS. Los demás grants se registran como alerta de reducción de superficie, **no se revocan solos**.
- `tests/m44_live_acl_rls_contract.test.mjs`: pruebas de SQL de lectura, capturas agregadas sintéticas con la topología real, alteración de datos, fuga de información, symlinks y casos negativos.

En una revisión autorizada, ejecutar el SQL de forma **read-only** con un acceso apropiado. La salida se pasa como objeto JSON a un fichero temporal privado, validable con:

```bash
node scripts/ops/m44_live_acl_rls_contract.mjs /ruta/privada/m44-acl-rls-snapshot.json
```

No se almacena la captura completa en GitHub ni se publican grants individuales o datos de usuario. El resultado `STRUCTURAL_PREFLIGHT_PASS` solo acredita la estructura actual, **NO certifica**:
- RLS como Cliente/Coach/Admin con identidades reales y dos clientes aislados.
- Seguridad de funciones privilegiadas y cadena de autorización.
- Aplicación efectiva de roles/ACL restaurados.
- Configuración/Auth alojado, login, Vault, secrets o RTO/RPO.
- Autorización para migraciones M44 en PROD.

**Coordinación:** PR #969 ya integró el laboratorio sintético GRANT/ACL/RLS; PR #972 sigue trabajando en conservar el ACL real cifrado del backup. Este módulo audita, en cambio, privilegios **efectivos hoy** en PROD y QA, sin tocar ambos PR ni modificar base de datos o información personal. PR #970 está Draft por una restricción de seguridad en su workflow de credenciales: no crear dependencia de ese gate ni esquivarlo.
