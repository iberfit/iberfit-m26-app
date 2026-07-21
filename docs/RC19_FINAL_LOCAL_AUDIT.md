# RC19 · Auditoría funcional, rendimiento y experiencia

## Alcance

Esta iteración se ejecutó exclusivamente sobre la copia local de RC18. No se realizaron escrituras en GitHub, Supabase, Cloudflare ni dominios productivos.

## Inconsistencias corregidas

### Datos y metodología

- Se eliminó la ambigüedad `guiada_app` / `guiada_en_app` mediante normalización canónica.
- Las citas presenciales ahora exigen ubicación y todas las citas validan fechas reales y orden cronológico.
- Los valores vacíos de IRI ya no se interpretan como cero.
- Fuerza y composición corporal requieren al menos una medición objetiva no negativa.
- El formulario IRI envía resultados numéricos, no nombres simbólicos de pruebas.

### Interacción y eficiencia

- La biblioteca deja de recorrer y normalizar los 367 registros en cada pulsación; utiliza un índice preconstruido.
- El autosave del constructor agrupa cambios rápidos, evita escuchadores duplicados y vacía la cola antes de publicar, salir o persistir.
- Los formularios de workflows, check-ins y hábitos responden a Enter, validan mediante HTML y mantienen el manejo centralizado de errores.
- El auditor interactivo reconoce botones `button` y `submit`, pero continúa rechazando botones sin tipo explícito.

### PWA y rendimiento

- Los endpoints de autenticación, API, RPC y configuración runtime nunca se cachean.
- Recursos inmutables usan cache-first con actualización en segundo plano.
- Navegaciones y módulos mutables usan network-first.
- `content-visibility` queda limitado a tarjetas no interactivas de biblioteca para no degradar accesibilidad.

### Experiencia visual

- Mayor anchura útil y espaciado consistente en escritorio.
- Mejor contraste y jerarquía en paneles y tarjetas.
- Constructor más equilibrado entre biblioteca y prescripción.
- Cabecera móvil compacta, sin convertir el cierre de sesión en un botón de ancho completo.
- Rejillas adaptativas y ausencia de desbordamiento horizontal en las 15 vistas auditadas.

## Evidencia

- `recovery/RC19_LOCAL_VALIDATION.json`
- `recovery/m26-rc19-quality-gate-results.json`
- `recovery/RC19_VISUAL_QA_REPORT.json`
- `recovery/RC19_INTEGRATED_QA_REPORT.json`
- `recovery/RC19_MODULE_GRAPH_REPORT.json`
- `recovery/RC19_PROTECTED_BASELINE_COMPARISON.json`
- `recovery/RC19_WEB_SHA256_MANIFEST.json`
- `recovery/RC19_SHA256_MANIFEST.json`

## Límites de la conclusión

La auditoría local no sustituye la comparación con Supabase real, autenticación QA real, dispositivos físicos ni observación de un canario remoto. No existe evidencia para declarar producción lista hasta completar esos gates.
