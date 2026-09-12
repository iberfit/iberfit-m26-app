# IBERFIT · Release Policy

## Contexto

IBERFIT tiene usuarios reales en `app.iberfit.cl`. El checkpoint actual además tiene una divergencia significativa: LIVE `cb423a12402206a383d4174a168707b2d860c023` y Canary certificado `9cbe3ad29dfda0a552aa54c7e1404575b96786d4`, con Canary 43 commits por delante.

Por ello se prohíbe tratar “actualizar producción” como un simple fast-forward del repositorio.

## Carril 1 — LIVE SUPPORT / HOTFIX

### Cuándo

- P0 de seguridad/datos/disponibilidad;
- P1 que bloquea usuarios reales u operación;
- regresión productiva confirmada.

### Base

El SHA exacto que LIVE esté sirviendo en ese momento.

### Regla

El parche debe resolver el problema con el mínimo cambio necesario.

No incluir:

- rediseños;
- refactors opcionales;
- i18n nuevo;
- features;
- limpieza general;
- cambios de arquitectura no imprescindibles.

### Flujo

1. Leer identidad LIVE actual.
2. Crear `hotfix/<tema>-<fecha>` desde ese SHA.
3. Reproducir el problema sin mutar datos reales cuando sea posible.
4. Implementar fix mínimo.
5. Tests locales/focales.
6. Construir candidato QA equivalente.
7. Canary/gate autenticado según riesgo.
8. Revisar diff exacto LIVE→candidato.
9. Preparar rollback.
10. Desplegar en ventana controlada.
11. Smoke read-only en producción.
12. Confirmar artefacto SHA exacto.
13. Actualizar `PRODUCTION_STATE.md`.
14. Llevar el hotfix de vuelta a la línea de evolución para no perderlo.

## Carril 2 — PRODUCT EVOLUTION

### Cuándo

- nuevas funciones;
- mejoras UX/UI;
- Admin/Coach/Cliente;
- entrenamiento/IRI;
- PWA;
- i18n;
- rendimiento no urgente;
- IA;
- refactors planificados.

### Base

Canary certificado vigente.

### Flujo

1. Rama pequeña desde Canary.
2. Objetivo y criterios de aceptación.
3. Implementación.
4. Tests.
5. PR/diff.
6. Integración controlada a Canary.
7. Direct Upload/artefacto exacto si Automatic Deployments continúa pausado.
8. QA autenticado/visual/seguridad.
9. Marcar `CANARY CERTIFIED`.
10. Agrupar en un lote de promoción deliberado.
11. Revalidar lote completo antes de PROD.

## Lotes de promoción

Mientras exista una diferencia grande LIVE→Canary, no hacer un único release gigante.

Crear lotes que tengan una razón funcional clara. Ejemplos de categorías, a confirmar contra commits reales:

- estabilidad/auth/login;
- UX shell + i18n;
- Coach/Admin;
- comunicación/transports;
- ejercicios/media;
- PWA/performance;
- backend/migrations.

No mezclar una migración de backend con cambios visuales grandes si pueden promocionarse y revertirse por separado.

Cada lote tendrá:

```text
Nombre:
Base LIVE:
Candidato:
Commits incluidos:
Commits excluidos:
Superficies:
Backend/migration: sí/no
Riesgo:
Tests:
QA:
Rollback:
Owner decision:
Estado:
```

## Cambios de base de datos

Cualquier migration SQL merece un carril explícito.

Antes de PROD:

- revisar contra esquema productivo actual;
- evaluar lock/downtime;
- comprobar backward compatibility con frontend LIVE;
- backup/rollback aplicable;
- ejecutar primero en QA;
- comprobar RLS/privilegios;
- no incluir secretos ni datos reales en evidencia;
- definir qué ocurre si frontend deploy falla después de migration.

Preferir cambios expand/contract compatibles cuando sea posible.

## Cambios Auth / RLS / WebAuthn

Siempre high-risk.

Exigir:

- Cliente A/B isolation;
- rol correcto;
- acceso privilegiado fail-closed;
- recuperación/refresh;
- 401/403 esperados;
- pruebas de no elevación de privilegio;
- no almacenar password;
- smoke realista de Cliente/Coach/Admin según alcance.

## Cloudflare

Mientras `Automatic deployments` esté pausado:

- mantenerlo pausado salvo decisión explícita;
- usar artefacto exacto y SHA exacto para Canary;
- nunca reutilizar el proyecto Canary como producción;
- verificar domains y project ownership antes de upload;
- comprobar `version.json` y runtime config después.

Producción se gestiona por su proyecto/flujo productivo separado.

## Rollback

Un release no está listo si “rollback” significa improvisar después.

Debe existir al menos:

- SHA/artefacto anterior identificable;
- ruta concreta de restauración;
- compatibilidad con backend actual;
- tratamiento explícito de migrations irreversibles;
- smoke que confirme recuperación.

## GO / NO-GO

### GO

Sólo si:

- alcance exacto;
- diff entendido;
- gates verdes;
- QA proporcional;
- artefacto exacto;
- datos/roles seguros;
- rollback;
- no existen P0 abiertos;
- P1 del lote resueltos o excepción consciente;
- impacto en usuarios reales aceptable.

### NO-GO

Cualquiera de:

- SHA ambiguo;
- Canary no coincide con candidato;
- test/gate rojo;
- migration no validada;
- auth/RLS dudoso;
- rollback no demostrado;
- cambios adicionales no entendidos;
- production state desactualizado;
- rama se movió durante preparación.

## Post-deploy

Inmediatamente:

- identidad SHA/versión;
- HTTP/rutas críticas;
- login básico sin acciones destructivas;
- Cliente/Coach/Admin según alcance;
- errores de consola/red relevantes;
- observabilidad;
- comprobar que no se ejecutaron mutaciones inesperadas;
- actualizar checkpoint.

Después medir durante el periodo definido antes de declarar DONE.
