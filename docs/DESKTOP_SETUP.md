# IBERFIT · Desktop Setup

## Objetivo

Trabajar siempre desde ChatGPT Desktop + Codex con una copia limpia y reconocible del repositorio, sin contaminar la copia local histórica que contiene archivos no versionados.

## Rama de trabajo HQ

Mientras PR #40 siga draft, la rama recomendada para abrir el contexto completo es:

`chore/iberfit-hq-bootstrap`

Su árbol de código está sincronizado con el Canary certificado `9cbe3ad29dfda0a552aa54c7e1404575b96786d4` y añade únicamente documentación HQ.

No confundir el HEAD documental con un nuevo Canary certificado: el checkpoint funcional sigue siendo `9cbe3ad...`.

## Copia local

No reutilizar como fuente canónica una carpeta local que tenga cambios/untracked desconocidos.

Crear una copia nueva en una carpeta inequívoca, por ejemplo:

`%USERPROFILE%\IBERFIT\iberfit-m26-hq`

Antes de trabajar, comprobar:

```text
git status --short        -> vacío
git branch --show-current -> chore/iberfit-hq-bootstrap
git rev-parse HEAD        -> HEAD esperado de la rama HQ
git remote -v             -> iberfit/iberfit-m26-app
```

Si la carpeta ya existe o `git status` no está limpio, no borrar ni resetear automáticamente: detenerse y resolver explícitamente.

## Qué abrir en ChatGPT Desktop

1. Proyecto/chat de dirección: `IBERFIT`.
2. Codex: carpeta limpia `iberfit-m26-hq`.

No abrir ZIPs, copias temporales ni la carpeta local histórica por costumbre.

## Inicio de una sesión Codex

Primer mensaje recomendado:

```text
Lee AGENTS.md, docs/PRODUCTION_STATE.md, docs/OPERATING_MODEL.md y docs/CODEX_WORKFLOW.md.
No modifiques nada todavía.
Confirma en 6 líneas:
- repo;
- branch;
- HEAD;
- SHA LIVE documentado;
- SHA Canary certificado;
- siguiente acción de PRODUCTION_STATE.
Si Git o la documentación no coinciden, detente.
```

Después trabajar sólo sobre la tarea concreta.

## Actualización de la copia

Antes de una nueva sesión importante:

- `git fetch`;
- comprobar la rama remota;
- no hacer `pull` a ciegas si hay cambios locales;
- no cambiar a `main` por defecto;
- no mover Canary para “actualizar” documentación.

## Rama por tarea

Desde la copia limpia:

- bug P0/P1 LIVE -> nueva rama desde el SHA LIVE exacto, no desde HQ/Canary;
- Product Evolution -> nueva rama desde el Canary certificado vigente;
- documentación/operación -> rama HQ mientras PR #40 siga abierto.

Codex debe crear la rama correcta; el propietario no necesita hacerlo manualmente salvo instrucción explícita.

## Producción

Tener la aplicación abierta en `app.iberfit.cl` no concede permiso para probar cambios destructivos.

Usarla para:

- observar;
- reproducir visualmente de forma segura;
- explicar fricciones;
- comprobar después de un release autorizado.

No usar usuarios reales para generar datos de prueba, borrar contenido o forzar flujos de seguridad.

## Salida corta

Al terminar cada tarea, Codex devuelve sólo:

1. qué cambió;
2. tests;
3. riesgos;
4. siguiente acción.

Los logs extensos permanecen como artefacto; al chat sólo llega el bloque relevante del fallo.
