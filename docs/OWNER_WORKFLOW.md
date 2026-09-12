# IBERFIT · Owner Workflow

## Objetivo

Que el propietario pueda trabajar desde ChatGPT Desktop de forma natural, sin preocuparse por Git, ramas, tickets o prompts técnicos en cada conversación.

## Regla simple

El propietario describe **lo que ve, duda o quiere conseguir**.

El sistema se encarga de:

`entender -> clasificar -> priorizar -> investigar -> decidir carril -> implementar en Codex -> probar -> Canary -> release cuando corresponda`

## Qué debe aportar el propietario

Sólo cuando sea útil:

- qué estaba intentando hacer;
- qué esperaba que ocurriera;
- qué ocurrió realmente;
- captura/pantalla si ayuda;
- rol usado: Cliente / Coach / Admin;
- si ocurrió en `app.iberfit.cl` o Canary;
- urgencia empresarial si existe.

No necesita conocer el nombre del componente ni sugerir solución técnica.

## Frases válidas

- “Esto no me gusta.”
- “No entiendo esta pantalla.”
- “Como Coach necesito hacer esto más rápido.”
- “El cliente debería ver esto antes.”
- “Esto se ve poco premium.”
- “Me sale este error.”
- “Creo que esta función sobra.”
- “¿Por qué tenemos que hacer tantos pasos?”
- “Quiero que IBERFIT haga X.”
- “¿Esto puede ayudarnos a vender más?”

Todas son entradas suficientes para comenzar triage.

## Qué hará ChatGPT antes de programar

1. Clasificar la observación.
2. Determinar si pertenece a LIVE SUPPORT o PRODUCT EVOLUTION.
3. Comprobar si Canary ya la resuelve.
4. Valorar impacto/riesgo.
5. Convertirla en criterio de aceptación.
6. Preparar ejecución Codex sólo si merece código.

## Cuándo se pedirá ayuda al propietario

Sólo cuando una decisión no pueda inferirse de forma segura, por ejemplo:

- preferencia real de producto/negocio;
- comprobar algo visual usando su sesión;
- acceso a Cloudflare/tercero que requiera interacción humana;
- ceremonia WebAuthn;
- confirmación antes de un deploy productivo;
- validar que una experiencia se siente correcta tras la mejora.

## Qué NO debe hacer el propietario

Salvo que se le pida explícitamente:

- ejecutar comandos viejos encontrados en otros hilos;
- repetir scripts que ya mutaron infraestructura;
- reanudar Automatic Deployments de Cloudflare;
- hacer merge de PRs;
- tocar Supabase PROD;
- probar con datos reales destructivamente;
- copiar logs completos de miles de líneas;
- cambiar de rama manualmente para “ponerlo al día”.

## Cuando se envía un error

Mejor formato:

```text
Estoy en: app.iberfit.cl / Canary
Rol: Cliente / Coach / Admin
Quería: ...
Pasó: ...
```

Y una captura si aporta información.

Si hay log, basta el bloque desde el título del paso que falla hasta el error final.

## Cuando se envía una idea

No necesita formato. El agente la convertirá en:

- problema;
- usuario;
- valor;
- prioridad;
- solución;
- riesgo;
- métrica;
- carril.

## Cadencia de trabajo recomendada

### Durante el uso normal

Registrar dudas/fricciones en el momento. No acumular 30 antes de comentarlas.

### Para desarrollo

Trabajar en bloques pequeños: una mejora completa y validada es preferible a 10 cambios parcialmente implementados.

### Para producto

Revisar periódicamente Cliente, Coach y Admin con tareas reales.

### Para negocio

Web/Growth avanzan en paralelo sin esperar a “terminar” la app.

## Señal de que el sistema funciona

El propietario debería poder comenzar una sesión nueva diciendo algo como:

> En Coach, al editar una sesión, esto me parece demasiado lento.

Y el sistema puede continuar sin pedirle que encuentre el hilo anterior, pegue el repositorio ni recuerde el último SHA.
