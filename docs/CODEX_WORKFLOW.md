# IBERFIT · Codex Workflow

## Propósito

Usar ChatGPT Desktop + Codex como entorno de ejecución, evitando chats gigantes, pegado de logs completos y relecturas constantes del repositorio.

## Reparto de responsabilidades

### ChatGPT · IBERFIT HQ

Usar para:

- describir dudas y problemas en lenguaje natural;
- producto/UX;
- priorización;
- arquitectura;
- estrategia de release;
- web/growth;
- decisiones de negocio;
- análisis de incidentes complejos.

Resultado esperado: una tarea pequeña y verificable para Codex.

### Codex

Usar para:

- leer archivos reales;
- inspeccionar Git;
- crear rama;
- implementar;
- tests;
- diffs;
- refactor focal;
- documentación del estado;
- preparar PR/candidato.

### Repositorio

Es la memoria permanente.

No usar un hilo antiguo como requisito que no figure en la documentación viva cuando sea una decisión duradera.

## Contexto mínimo al comenzar una tarea

Codex debe leer inicialmente sólo:

1. `AGENTS.md`;
2. `docs/PRODUCTION_STATE.md`;
3. `docs/OPERATING_MODEL.md`;
4. documento específico del dominio, si aplica.

Ejemplos:

- bug app: quizá `ARCHITECTURE.md` + módulo afectado;
- UX: `PRODUCT.md`;
- release: `RELEASE_POLICY.md`;
- web: `docs/website/*`;
- growth: `docs/growth/*`.

No pedir “analiza todo el repositorio” salvo auditoría profunda explícita.

## Prompt base — investigación de bug LIVE

```text
Lee AGENTS.md, docs/PRODUCTION_STATE.md, docs/OPERATING_MODEL.md y docs/RELEASE_POLICY.md.

Tenemos esta observación en app.iberfit.cl:
<DESCRIPCIÓN>

Primero NO modifiques código.

1. Clasifícala: LIVE BUG / UX / DATA-SECURITY / PERFORMANCE / PRODUCT.
2. Verifica el SHA LIVE actual y aborta si el checkpoint documental está obsoleto.
3. Localiza la ruta/módulos responsables.
4. Intenta reproducir de forma read-only o con QA/datos sintéticos.
5. Determina causa probable y riesgo.
6. Decide si requiere hotfix desde LIVE o si pertenece a Product Evolution.

Responde sólo con:
- clasificación;
- evidencia;
- causa;
- archivos implicados;
- carril correcto;
- plan mínimo;
- tests necesarios.

No desplegar. No mutar Supabase PROD. No usar datos reales en logs.
```

## Prompt base — implementar hotfix

Sólo después de diagnóstico aprobado:

```text
Lee AGENTS.md, PRODUCTION_STATE.md y RELEASE_POLICY.md.

Implementa el hotfix ya diagnosticado:
<BUG + CAUSA + CRITERIO DE CIERRE>

Reglas:
- base = SHA LIVE exacto actual;
- si LIVE cambió, aborta;
- rama hotfix aislada;
- cambio mínimo;
- ninguna feature/refactor no necesaria;
- ningún deploy PROD;
- ningún cambio Supabase PROD;
- ejecutar tests focales y regresión proporcional;
- revisar diff final;
- preparar QA/Canary equivalente.

Al terminar, reporta sólo:
1. cambios;
2. tests;
3. diff/riesgos;
4. siguiente gate.
```

## Prompt base — Product Evolution

```text
Lee AGENTS.md, PRODUCTION_STATE.md, OPERATING_MODEL.md y PRODUCT.md.

Objetivo:
<MEJORA>

Trabaja desde el Canary certificado vigente.
Si Canary cambió respecto al checkpoint, informa antes de modificar.

1. Inspecciona sólo módulos relevantes.
2. Propón el cambio mínimo que resuelva el problema.
3. Implementa.
4. Añade/actualiza tests.
5. Ejecuta tests focales y gates locales aplicables.
6. Revisa responsive/accesibilidad/roles si aplica.
7. No despliegues producción.
8. Actualiza backlog/estado si corresponde.

Salida máxima:
- hecho;
- tests;
- riesgos;
- siguiente acción.
```

## Prompt base — auditoría visual/UX

```text
Audita únicamente <SUPERFICIE/RUTA> en el checkpoint Canary vigente.

Busca:
- jerarquía;
- claridad;
- fricción;
- consistencia premium;
- responsive;
- accesibilidad;
- estados empty/loading/error;
- experiencia de entrenamiento real.

No cambies código inicialmente.
Devuelve máximo 5 hallazgos ordenados por impacto con evidencia y solución concreta.
```

## Prompt base — tarea Web

```text
Lee docs/website/WEBSITE_STATE.md, WEBSITE_MASTER.md y WEBSITE_BACKLOG.md.

Antes de editar, confirma la fuente real que sirve iberfit.cl.
No desplegar desde iberfitweb/main mientras siga divergente de LIVE.

Objetivo:
<TAREA>

Trabaja sobre una rama segura desde la fuente web canónica confirmada.
Mide impacto esperado en SEO/CRO/velocidad.
No mezcles cambios de la app M26.
```

## Presupuesto de contexto

### Sesión normal

Cargar:

- 3–4 documentos pequeños;
- archivos del módulo afectado;
- tests relacionados;
- diff relevante.

### Evitar

- logs completos de miles de líneas;
- todos los READMEs RC históricos;
- todas las ramas;
- todos los PRs;
- todo el árbol del repositorio;
- repetir el estado que ya figura en `PRODUCTION_STATE.md`.

### Escalar contexto sólo cuando

- el bug cruza módulos;
- hay decisión arquitectónica;
- auth/RLS/backend;
- migration;
- release crítico;
- causa no identificada tras investigación focal.

## Uso de modelos / esfuerzo

Principio, independientemente del nombre comercial disponible en la app:

- **eficiente/rápido**: búsquedas, clasificación, docs, lint, tareas repetitivas;
- **principal de coding**: implementación normal, tests, refactor focal;
- **razonamiento alto**: arquitectura, seguridad, incidentes difíciles, migrations, GO/NO-GO.

No gastar razonamiento máximo en tareas mecánicas.

## Logs

Si un comando falla:

1. guardar log completo como artefacto local si es necesario;
2. entregar al chat sólo:
   - encabezado del paso;
   - comando;
   - error;
   - 20–50 líneas relevantes;
3. no repetir el comando automáticamente si pudo haber mutado infraestructura.

## Stop conditions

Codex debe abortar y pedir decisión si:

- SHA LIVE/Canary cambió inesperadamente;
- descubre que la tarea toca PROD cuando estaba declarada QA;
- aparece service-role/secreto;
- migration/RLS no prevista;
- diff se expande a módulos no relacionados;
- tests de seguridad fallan;
- necesita datos reales para reproducir;
- no existe rollback razonable;
- fuente web LIVE es incierta.

## Cierre de sesión

Antes de cerrar una tarea significativa:

- Git status entendido;
- rama/commit identificados;
- tests registrados;
- `PRODUCTION_STATE.md` actualizado si cambió estado;
- `BACKLOG.md` actualizado si cambió prioridad;
- `DECISIONS.md` sólo si hubo decisión duradera;
- siguiente acción exacta escrita.

Así una nueva sesión puede continuar sin leer el chat anterior.
