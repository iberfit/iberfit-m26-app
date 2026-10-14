# IBERFIT · Política de certificación por candidato final

## Dos estados, misma calidad de entrega

- **Draft / construcción del ultramegabloque:** siguen activos Fast Lane, `validate` de CI, auditoría continua, pruebas dirigidas y revisión específica de migraciones y seguridad. Las suites remotas de escritura, browser autenticado, matrices visuales, dispositivos, Admin y Coach/Cliente se omiten en Draft. No se encolan trabajos de QA caros por cada sincronización.
- **Ready for Review / candidato de integración:** `ready_for_review` desencadena las suites completas; si cambia el SHA mientras está Ready, `synchronize` exige de nuevo sus certificados. `converted_to_draft` vuelve al estado de construcción.
- **Protección formal:** GitHub Ruleset `Protect Canary` exige `validate` y `canary-policy-gate`. El segundo **falla explícitamente en Draft** con `DRAFT_NOT_CERTIFIED`, y ejecuta el gate original completo en Ready. El objetivo es acelerar el WIP, nunca aceptar un Draft como certificado.
- **Autenticación y QA real:** `qa-real-write-cert` conserva su cola y no cancela una escritura que ya empezó; evitar lanzar escrituras intermedias resuelve la acumulación sin interrumpir una operación sensible. WebAuthn real mantiene sus restricciones de ejecución confiable sobre Canary; no se simula MFA.
- **Canary y producción:** no cambian sus mecanismos de entrega. El merge sólo es válido con SHA exacto certificado; los pasos de Canary/producción siguen sujetos a validación de entorno, compatibilidad, reversión, respaldo y verificación LIVE.
- **Si aparecen correcciones posteriores:** volver a Draft antes de continuar el trabajo; tras completar los cambios, marcar Ready y ejecutar **una certificación integral del SHA final**.
- **Seguridad y datos:** Fast Lane, controles de backend y la compuerta de seguridad de migraciones permanecen activos. Si una modificación crítica lo requiere, realizar también las pruebas especializadas inmediatamente en un entorno autorizado, sin esperar el último candidato.

## Qué no se hace

No se modifican `.github/workflows/production-promote.yml` ni los grants, esquemas, secretos o jobs de escritor remoto con esta política. Tampoco se altera el proceso de Canary exacto. Se conservan los nombres originales de los status checks protegidos.

## Pruebas

`tests/m43_ultramacro_certification_stages.test.mjs` verifica que cada job caro requiere Ready y que la compuerta Canary nunca aprueba Draft, así como la activación al actualizar el SHA.

**Para M43:** la adopción de esta política constituye un cambio de ingeniería/CI y debe certificarse con sus tests y un candidato Ready antes de cierre y producción.
