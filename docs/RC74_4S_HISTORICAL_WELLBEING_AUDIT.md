# IBERFIT M26 RC74.4S · Auditoría histórica de bienestar

## Alcance

Esta auditoría se realiza después del cierre reproducible RC74.4R. Su objetivo es identificar qué señales históricas de bienestar aportan valor real al producto M26 y cómo portarlas sin duplicar contratos, reabrir fases cerradas ni introducir inferencias clínicas.

Fuentes revisadas:

- M26 actual: `client_checkins_v26`, command bus, validación de check-in, progreso longitudinal, alertas explicables y feedback post-sesión.
- IBERFIT V6.7 histórico: matriz de contrato, Apps Script y hojas `08_CHECKIN` / `07_FEEDBACK`.
- IBERFIT V10 histórico: formulario cliente y transporte API.

## Matriz KEEP / PORT / SUPERSEDED / DANGEROUS

| Capacidad / señal | Evidencia histórica | Estado | Decisión M26 |
| --- | --- | --- | --- |
| Energía percibida | V6.7 y V10 | **KEEP** | Ya existe nativamente en M26 como `energy` 0–10. No duplicar. |
| Sueño percibido | V6.7 y V10 | **KEEP** | Ya existe nativamente en M26 como `sleep` 0–10. No duplicar. |
| Estrés percibido | V6.7 | **KEEP** | Ya existe nativamente en M26 como `stress` 0–10. No duplicar. |
| Dolor / molestia percibida | V6.7 | **KEEP** | Ya existe nativamente en M26 como `pain` 0–10. No duplicar. |
| Fatiga general semanal | V6.7: `FATIGA_GENERAL`, payload y persistencia coherentes | **PORT** | Incorporar como `fatigue` opcional, nullable, 0–10; 0 = ninguna, 10 = máxima. |
| Motivación | V10: UI explícita 1–10, sin backend histórico compatible | **PORT** | Portar la intención semántica, no el backend. Incorporar como `motivation` opcional, nullable, 0–10; 0 = ninguna, 10 = máxima. |
| Feedback post-sesión histórico de fatiga/energía | V6.7 `07_FEEDBACK` | **SUPERSEDED** | M26 ya dispone de feedback post-sesión superior y trazable; no duplicar ni alterar ese contrato. |
| Payload V10 `sleep/energy/fatigue/motivation` hacia backend V6.7 | V10 UI frente a `submitCheckin_` V6.7 | **DANGEROUS** | No reutilizar: nombres y contrato no coinciden y motivación no tenía persistencia V6.7. |
| Apps Script / Google Sheets como backend operativo | V6.7–V10 | **DANGEROUS** | No portar arquitectura, almacenamiento ni autorización. M26 mantiene Supabase + command bus + RLS/RPC. |
| Señales históricas duplicadas de sueño/energía/estrés/dolor | V6.7–V10 | **SUPERSEDED** | La implementación M26 actual es la fuente canónica. |

## Contrato nativo propuesto

La ampliación pertenece al mismo check-in M26; no se crea una tabla paralela ni un comando nuevo.

- `fatigue numeric(4,1) NULL`, rango 0–10 cuando existe.
- `motivation numeric(4,1) NULL`, rango 0–10 cuando existe.
- La ausencia se conserva como `NULL`; nunca se transforma en cero.
- Los cuatro campos actuales (`energy`, `sleep`, `stress`, `pain`) siguen siendo obligatorios y no cambian de significado.
- Los clientes antiguos pueden omitir `fatigue` y `motivation` sin perder compatibilidad.
- En una actualización, omitir un campo opcional conserva el valor anterior; enviar explícitamente `null` permite dejarlo sin dato.
- `recorded_at`, revisión, autor y estado existentes mantienen la trazabilidad temporal.

## Semántica de escala

M26 usa 0–10 de forma consistente en el check-in. Por ello, la motivación histórica de V10 se adapta a 0–10 en vez de copiar su escala 1–10.

- **Fatiga:** 0 = ninguna; 10 = máxima. Un valor más alto representa mayor fatiga percibida.
- **Motivación:** 0 = ninguna; 10 = máxima. Un valor más alto representa mayor motivación percibida.

Fatiga no es estrés y motivación no es energía. Ninguna señal se deriva de otra.

## Uso en producto

En RC74.4S estas dos señales se incorporan como contexto descriptivo y longitudinal:

- visibles en el check-in y en el último registro confirmado;
- promediadas solo sobre valores realmente presentes;
- visibles en cronología y contexto del expediente;
- sin imputación de datos ausentes;
- sin diagnóstico ni atribución causal.

No se modifica en esta fase la lógica automática de adherencia/recuperación. Fatiga o motivación por sí solas no cambian carga, no publican contenido y no generan prescripciones. Las alertas existentes continúan basadas en sus reglas actuales y el entrenador conserva la decisión.

## Compatibilidad y seguridad

- No cambia el registro de comandos ni las transiciones M26.
- `CHECKIN_REGISTRAR` sigue pasando por validación, command bus y persistencia canónica.
- No se añaden políticas de escritura directa a `client_checkins_v26`.
- El helper histórico `iberfit_prepare_command_rc30_v26_pre_rc74_4` no se modifica; la extensión se realiza en el wrapper actual para no reescribir el contrato pre-RC74.4.
- La persistencia conserva valores opcionales cuando un cliente antiguo los omite.
- QA debe permanecer fail-closed y producción queda fuera de alcance.

## Criterios de aceptación

1. Check-ins antiguos de cuatro señales siguen siendo válidos.
2. `fatigue=0` y `motivation=0` son datos válidos y distintos de ausencia.
3. Campo opcional vacío/ausente se conserva como `NULL`.
4. Valor presente fuera de 0–10 se rechaza.
5. Los promedios ignoran `NULL` y nunca imputan cero.
6. El último check-in y la cronología explican la dirección de cada escala.
7. Las alertas automáticas existentes no cambian por la mera presencia de fatiga/motivación.
8. No se modifica el feedback post-sesión M26.
9. No se añade un comando, tabla paralela o vía de escritura directa.
10. Migración y código quedan reproducibles desde Git antes de aplicarse en QA.
