# U78 · Certificación read-only de prerrequisitos PROD U30–U60

Consulta `scripts/release/u78_prod_preinstall_readonly.sql` ejecutada sin DDL ni datos de clientes: PROD 21/21 PASS; QA 10/21 por tener ya U30–U60 instalados. La señal `sourceSchemaCompatible` no autoriza SQL ni GRANT, requiere restauración M44 y puerta de despliegue.

Orden estrictamente versionado: U30 `20261025182000`, U31 `20261025194000`, U32 `20261025203500`, U32 fence `20261025210500`, U33 `20261025223000`, U34 `20261025231500`, U36 CLOSED `20261025235500`, U60 CLOSED `20261104150000`. Cada archivo SQL tiene rollback específico en `supabase/rollbacks`. **Nunca db push global** por divergencia histórica del ledger. U30 rollback sólo con historia de ocurrencias vacía.

M44 canary protegido [41953622105](https://github.com/iberfit/iberfit-m26-app/actions/runs/41953622105) SUCCESS: DB+Storage cifrados y restauración PostgreSQL 17, evidencia 34.826.846 bytes, SHA-256 `6358bfaa70e58859da94a5c29c589f5eff7c02203f334b6cc14fceeb77b46068`. Backup cifrado transferido a Drive IBERFIT privado (owner-only) y descargado desde Drive con los mismos bytes y SHA. No colocar secretos ni IDs privados de la ubicación externa en GitHub.

Production Data Safety Gate se repitió tras M44 y pasó SUCCESS. El resultado M44 sigue limitado a DB+Storage: `platformRecoveryVerified=false`, no acredita reconstrucción integral de Auth/Vault/secretos. La ventana M44 para escrituras productivas es <=2 horas.

QA E2E U71/U73 real Coach/Cliente A/Coach completo; dos fechas independientes, Cliente B denegado. Falló una vez la aserción inmediata de serie omitida en WebKit móvil; rerun del mismo SHA fue SUCCESS. Se sustituye la lectura inmediata por una comprobación eventual de evento+contador+errores, límite 5 s; no oculta fallos persistentes.

El workflow U77 de despacho M44 se retira antes de merge para no conservar un token `actions:write` innecesario en Canary. El M44 original no se altera.