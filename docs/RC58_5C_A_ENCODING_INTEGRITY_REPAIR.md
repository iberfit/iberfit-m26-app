# RC58.5C-A — Encoding Integrity Repair

RC58_5C_A_STATUS=IMPLEMENTED
SOURCE_CENSUS_FILES=888
INVALID_UTF8_FILES_BEFORE=0
MOJIBAKE_SUSPECT_FILES_BEFORE=39

## Motivo

El censo read-only previo a RC58.5C detectó mojibake real ya versionado en el
repositorio.

No era únicamente un problema de visualización del terminal.

Había cadenas visibles afectadas en Phone, Wear y Bluetooth, además de tests,
tooling y documentación.

## Estrategia

La reparación es conservadora:

1. solo actúa sobre los 39 paths identificados por el censo;
2. exige HEAD y remote HEAD exactos;
3. exige worktree rastreado limpio;
4. lee UTF-8 con decoder estricto;
5. intenta invertir Windows-1252 -> UTF-8 únicamente cuando reduce de forma
   estricta la señal de mojibake;
6. si el archivo completo no puede convertirse con seguridad, repara por línea;
7. exige que cada uno de los 39 archivos termine con score cero;
8. añade un gate permanente de UTF-8/mojibake;
9. ejecuta la suite completa `npm test`;
10. recompila Phone y Wear.

No se corrigen textos por intuición ni mediante un diccionario manual.

## Resultado esperado

Ejemplos:

- `IBERFIT Phone Â· DataLayer preparado` -> `IBERFIT Phone · DataLayer preparado`
- `AÃ±adir dispositivo` -> `Añadir dispositivo`
- `PulsÃ³metro Bluetooth` -> `Pulsómetro Bluetooth`
- `IBERFIT Wear Â· preparando permisos` -> `IBERFIT Wear · preparando permisos`
- `Frecuencia cardiaca Â·` -> `Frecuencia cardiaca ·`
- `â€”` -> `—`
- `â†’` -> `→`

## Gate permanente

`scripts/check_utf8_mojibake.mjs` falla si encuentra:

- UTF-8 inválido;
- patrones típicos `Ãx`;
- patrones típicos `Âx`;
- secuencias `â...`;
- BOM interpretado como texto;
- mojibake de emoji;
- replacement character U+FFFD.

RC58_5C_A_ENCODING_INTEGRITY=PASS
RC58_5C_A_ACTIVE_APP_STRINGS_REPAIRED=PASS
RC58_5C_A_TESTS_REPAIRED=PASS
RC58_5C_A_TOOLING_REPAIRED=PASS
RC58_5C_A_DOCS_REPAIRED=PASS
RC58_5C_A_FULL_TEST_SUITE=PASS
RC58_5C_A_PHONE_COMPILE=PASS
RC58_5C_A_WEAR_COMPILE=PASS

NEXT_ACTION=RC58_5C_B_APP_WIDE_INTEGRITY_FUNCTIONAL
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY