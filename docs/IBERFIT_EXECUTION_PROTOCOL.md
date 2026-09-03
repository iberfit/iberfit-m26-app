# IBERFIT · Protocolo maestro de ejecución

Estado de referencia: 2026-09-02 · America/Santiago.

Este documento es el contrato operativo permanente para cambios, validación y promoción de IBERFIT. Si existe contradicción con notas históricas, prevalecen el estado actual del repositorio, los workflows canónicos y este protocolo.

## 1. Fuente canónica

- Repositorio: `iberfit/iberfit-m26-app`.
- Rama de integración: `canary/rc74-4`.
- El repositorio histórico `app iberfit` no es fuente canónica.
- Antes de cualquier mutación se comprueba el SHA actual del objetivo.
- No se usa force-push.
- No se mezclan checkouts o cambios locales ajenos con trabajo de release.

## 2. Cadena obligatoria de trabajo

`checkpoint actual -> cambio mínimo completo -> tests -> corregir automáticamente -> CI/auditoría GREEN -> SHA exacto -> promoción -> verificación LIVE -> registrar estado -> siguiente bloqueo`

Reglas:

1. Lo que ya está GREEN no se reaudita salvo evidencia nueva o impacto directo del cambio.
2. No se delega al usuario una acción que pueda ejecutar GitHub Actions, Wrangler o una integración autorizada.
3. No se crean pipelines temporales si existe uno permanente.
4. Ningún rojo se salta: se identifica la causa y se corrige en la fuente.
5. Toda mejora debe preservar lo útil ya existente y evitar regresiones.

## 3. Producción canónica

- Cloudflare Account ID: `5b03d387427d367674b9d05b8bdf7c84`.
- Cloudflare Pages PROD: `iberfit-m26-production`.
- Rama productiva de Pages: se descubre y valida en ejecución; actualmente `production`.
- Dominio PROD: `app.iberfit.cl`.
- Workflow permanente: `.github/workflows/production-promote.yml`.
- Herramienta de despliegue: `wrangler pages deploy`.
- Secret requerido: `CLOUDFLARE_API_TOKEN`.
- El valor del secret nunca se documenta, imprime ni incorpora a artefactos.
- Worker histórico `iberfit`: fuera del flujo M26 Pages.

## 4. Supabase

- PROD ref: `pjhmrhejsoofmouedavw`.
- PROD URL: `https://pjhmrhejsoofmouedavw.supabase.co`.
- QA ref: `gjztkdwfmunnzhtvxrsu`.
- El frontend PROD usa una credencial pública publishable; nunca una credencial privilegiada.
- Una promoción frontend no ejecuta SQL, migraciones, cambios RLS, cambios ABAC ni ninguna mutación de Supabase PROD.
- QA y PROD no se mezclan.
- `service_role` y equivalentes privilegiados están prohibidos en la superficie pública.

## 5. Entrada a producción

La entrada válida es un SHA exacto de `canary/rc74-4` con sus gates aplicables GREEN. Canary live puede utilizarse cuando aporte valor, pero no es requisito de la promoción PROD.

La release se crea desde el SHA certificado con:

- rama `release/prod-<12 primeros caracteres del SHA>`;
- un único commit adicional;
- único cambio permitido: `.iberfit/production-release.json`;
- `sourceSha` exacto;
- `sourceBranch: canary/rc74-4`;
- target `iberfit-m26-production`;
- domain `app.iberfit.cl`.

Si la rama de integración deja de apuntar al `sourceSha`, la promoción debe detenerse fail-closed.

## 6. Gates obligatorios de promoción

El pipeline permanente debe mantener, como mínimo:

1. manifest y procedencia exactos;
2. regresión completa;
3. build canónico;
4. captura read-only del estado LIVE anterior;
5. runtime PROD determinista;
6. `enabled: true` y `qaOnly: false`;
7. ref/URL Supabase PROD exactos;
8. ausencia de QA y credenciales privilegiadas;
9. descubrimiento exacto del proyecto, dominio y rama Pages;
10. identificación del rollback desde un deployment `environment=production` cuyo commit coincide con el SHA LIVE real;
11. preview en el mismo proyecto Pages;
12. verificación reusable `iberfit.production.surface.v1` del preview;
13. Wrangler PROD;
14. verificación del mismo contrato contra `app.iberfit.cl`;
15. auditoría integral read-only;
16. evidencia del deployment exacto nuevo y del rollback anterior.

Cloudflare `latest_deployment` no se utiliza para decidir el rollback, porque puede ser un preview reciente.

## 7. Seguridad de autenticación

- WebAuthn privilegiado debe usar autenticador nativo/platform del dispositivo actual.
- No se introduce flujo QR/hybrid con otro teléfono.
- Se conserva `userVerification` y el gate de assurance.
- Coach/Admin no deben obtener shell privilegiado antes de completar el nivel de autenticación exigido.
- Los fallbacks deben ser seguros, comprensibles y fail-closed.
- Los tests de autenticación deben seleccionar elementos por contratos semánticos estables, no depender innecesariamente de copy visual.

## 8. Rollback

Rollback sólo a un deployment productivo real previamente identificado. Antes de ejecutarlo se valida:

- proyecto `iberfit-m26-production`;
- deployment ID exacto;
- `environment=production`;
- SHA asociado esperado;
- dominio `app.iberfit.cl` todavía ligado al proyecto.

No se usa un preview, `latest_deployment`, un nombre de rama ni un SHA inferido como sustituto del deployment ID real.

## 9. Estado PROD certificado

Promoción certificada el 2026-09-02:

- Source SHA LIVE: `4704b2ba660b3b047d9e674ceaa3b00b07b05dbb`.
- Source branch: `canary/rc74-4`.
- Cloudflare deployment ID: `d63a2cac-8df1-4c98-bbb4-aacf1e71e3c2`.
- Deployment URL: `https://d63a2cac.iberfit-m26-production.pages.dev`.
- Production Promotion run: `33709822598` · GREEN.
- Rollback deployment: `c9d61c8f-d95f-4496-808b-fe98c429c8e3`.
- Rollback source SHA: `e67c89c97d69eabe7f7b6682176e47e68ad6fde2`.
- `app.iberfit.cl` validado con runtime PROD activo y sin el bloqueo temporal anterior.
- Supabase PROD no fue mutado durante la promoción.

Un merge posterior exclusivamente documental puede hacer avanzar `canary/rc74-4` sin cambiar el SHA que está sirviendo producción. No se redepliega PROD sólo para sincronizar documentación.

## 10. Incidentes y decisiones recientes

- PR #48: runtime de producción determinista y pipeline permanente.
- PR #49: verificador de superficie con retry read-only acotado.
- PR #50, #51 y #52: estabilización del smoke autenticado y gate WebAuthn sin debilitar seguridad.
- PR #53: separación correcta entre previews y deployment productivo Cloudflare para descubrimiento/rollback.
- Los intentos de promoción fallidos anteriores se detuvieron fail-closed antes de modificar LIVE.

## 11. Diseño y producto

Prioridad permanente:

`estabilidad -> seguridad -> UX premium -> experiencia de entrenamiento -> automatización -> retención -> adquisición -> conversión -> ingresos -> escalabilidad`

Identidad IBERFIT:

- usar siempre el logo/isotipo real de la marca;
- verde oscuro, dorado y crema;
- estética premium, minimalista, moderna y limpia;
- no degradar accesibilidad, legibilidad ni coherencia entre Client, Coach y Admin;
- evitar aspecto genérico de plantilla o IA.

## 12. Limpieza y continuidad

Después de una promoción certificada:

1. registrar SHA, run y deployment;
2. conservar evidencia y rollback;
3. eliminar únicamente ramas temporales demostrablemente obsoletas y ya absorbidas;
4. no borrar ramas o artefactos necesarios para auditoría/rollback;
5. revisar PRs históricos de forma selectiva, tomando sólo valor no absorbido y evitando merges masivos obsoletos.

Documento operativo complementario: `docs/PRODUCTION_PROMOTION_RUNBOOK.md`.
