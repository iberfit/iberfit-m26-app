# M44 — Evidencia temporal verificable: copia externa no equivale a RTO/RPO

## Medición real de la última copia M44 — 16 de octubre de 2026

Se cotejaron metadatos en vivo del workflow cifrado de GitHub Actions y de su fichero Drive privado. Ningún respaldo se descifró.

| Evento | UTC |
|---|---|
| Workflow 38888628869 iniciado | 2026-10-16 10:39:07 |
| Workflow terminado con éxito | 2026-10-16 10:42:58 |
| Archivo cifrado creado en Drive privado | 2026-10-16 10:44:43.988 |

SHA-256: 3fd6a9aff8beda8342973da357824d04b3f6ef6508ba381d2495cea25a7d18bd. Tamaño: 32.143.146 bytes. Drive: 199Ys6j8DjYBluF2k-k-xQF_9hovqv_Jk. Fichero privado, no compartido y de propietario único. Las copias anteriores siguen conservadas.

- Workflow completo: **231 segundos** (3 min 51 s).
- Desde finalización del workflow hasta Drive: **106 segundos** (aproximadamente 1 min 46 s).
- Desde el inicio del workflow hasta el archivo externo: **337 segundos** (aproximadamente 5 min 37 s).

Estas duraciones NO SON el RTO (tiempo desde el desastre hasta recuperar la operación) ni el RPO (ventana entre última escritura válida y punto recuperable en un incidente). La hora inicial del workflow tampoco acredita el punto MVCC exacto del dump. PostgreSQL y Storage no crean por sí solos un snapshot distribuido atómico.

## Contrato ejecutable

- scripts/ops/m44_offsite_timeline_contract.mjs: acepta un JSON mínimo creado previamente a partir de metadatos verificados de GitHub y Drive, comprueba integridad SHA-256 declarada, tamaños, estado, privacidad y cronología. Rechaza eventos invertidos, relojes futuros, campos extra, información sensible, symlinks, archivos enormes y malformados. Solo emite duraciones, con RTO/RPO y plataforma explícitamente NO CERTIFICADOS.
- tests/m44_offsite_timeline_contract.test.mjs: siete pruebas sintéticas basadas en tiempos reales, con casos negativos de tampering, privacidad, timestamps y no relajación del gate de producción. Comando: node --test tests/m44_offsite_timeline_contract.test.mjs.
- Este script no autentica APIs por sí mismo ni descifra bytes: es una comprobación de coherencia de observaciones. La custodia y la integridad real se certifican separadamente mediante proveedores y SHA-256 del artefacto.

## Hitos necesarios para certificar los objetivos

1. Acordar los objetivos empresariales RTO/RPO explícitos; no inventar umbrales.
2. Instrumentar un ensayo real aislado, con marcas de tiempo en inicio del incidente simulado, descifrado de Drive, restauración de PostgreSQL y Storage, conciliación de roles y ACL, Auth alojado, Edge y login efectivo de Cliente, Coach y Admin.
3. Correlacionar la última escritura de datos confirmada con la última recuperable, considerando consistencia MVCC y objetos Storage. Calcular pérdidas observadas y detectar las no medibles.
4. Probar escenarios adversos: archivo alterado, contraseña inválida, rol ausente, MFA, JWT antiguos, SMTP, Vault y servicio externo fallido.
5. Mantener informes privados no sensibles asociados a SHA, versión, resultados y fechas. Nunca incluir tokens, datos personales ni claves.

El instrumento mantiene siempre rtoCertified=false, rpoCertified=false y platformRecoveryVerified=false. No se modifica el gate productivo ni se ejecuta SQL contra PROD.

**Checkpoint:** generaciones históricas restauradas offline con éxito hasta roles y ACL archivadas. El backup más reciente ya se custodia en Drive, pero su propia restauración externa aún no se ha ejecutado. M44 PROD: 0/12 migraciones confirmadas; Auth alojado y permisos aplicados continúan pendientes.
