# IBERFIT M26 · Producción · Runbook permanente

Estado de referencia al 2026-09-02.

## Objetivo

Promover un candidato GREEN de `iberfit/iberfit-m26-app` a la aplicación real de IBERFIT sin ZIP manual, sin tocar el Worker histórico y sin mutar Supabase durante el despliegue frontend.

## Destino productivo inmutable

- Repositorio canónico: `iberfit/iberfit-m26-app`.
- Rama de integración: `canary/rc74-4`.
- Cloudflare Pages: `iberfit-m26-production`.
- Dominio público: `app.iberfit.cl`.
- Cloudflare Account ID: `5b03d387427d367674b9d05b8bdf7c84`.
- Supabase PROD ref: `pjhmrhejsoofmouedavw`.
- Supabase PROD URL: `https://pjhmrhejsoofmouedavw.supabase.co`.
- Supabase QA ref prohibido en producción: `gjztkdwfmunnzhtvxrsu`.
- Worker histórico `iberfit`: fuera del flujo de despliegue M26 Pages.

Cualquier cambio de estos identificadores exige una decisión explícita y una actualización deliberada de este runbook y del workflow. Nunca se deben inferir ni sustituir automáticamente.

## Reglas no negociables

1. La fuente de producción es un SHA exacto que ya ha pasado las validaciones de aplicación.
2. Producción se despliega únicamente con Wrangler a `iberfit-m26-production`.
3. Antes de desplegar, el workflow consulta Cloudflare y verifica nombre de proyecto, rama productiva real y que `app.iberfit.cl` sigue asociado al proyecto.
4. El runtime que llega a producción debe usar exclusivamente Supabase PROD, `qaOnly: false` y `enabled: true`.
5. Se bloquea cualquier referencia al proyecto QA y cualquier indicio de `service_role` en la superficie pública.
6. El flujo frontend no ejecuta SQL, migraciones, `supabase db ...`, cambios RLS ni mutaciones de Supabase.
7. El flujo frontend no ejecuta `wrangler deploy` sobre Workers. Sólo `wrangler pages deploy` sobre Pages.
8. Antes del despliegue productivo se ejecutan regresiones y un preflight en el mismo proyecto Pages con una rama de preview.
9. Después del despliegue se verifica directamente `app.iberfit.cl`: SHA exacto, entorno PROD, runtime, identidad visual mínima y ausencia de QA.
10. Después del despliegue se ejecuta la auditoría integral read-only.
11. Cada promoción conserva evidencia del deployment nuevo y del deployment productivo anterior para rollback.
12. El rollback anterior se resuelve por deployment `environment=production` y por el SHA que realmente sirve el dominio; nunca por `latest_deployment`, porque Cloudflare puede devolver ahí un preview reciente.
13. Nunca se borra el deployment anterior como parte de una promoción.
14. Sólo puede haber una promoción de producción ejecutándose a la vez.
15. Un fallo de validación detiene el proceso. No se fuerza un despliegue para “hacerlo pasar”.
16. La validación del preview y del dominio LIVE usa el mismo contrato reusable `iberfit.production.surface.v1`: espera de forma acotada la propagación de Pages, valida en conjunto `version.json`, `runtime-config.js` e `index.html`, y termina con un código explícito sin exponer contenidos sensibles.

## Forma de promover una versión

El workflow permanente es `.github/workflows/production-promote.yml`.

La promoción se expresa mediante una rama creada directamente desde el SHA GREEN:

`release/prod-<primeros 12 caracteres del SHA>`

En esa rama se añade un único commit con el archivo:

`.iberfit/production-release.json`

Ejemplo:

```json
{
  "schema": "iberfit.production.release.v1",
  "sourceSha": "0123456789abcdef0123456789abcdef01234567",
  "sourceBranch": "canary/rc74-4",
  "target": "iberfit-m26-production",
  "domain": "app.iberfit.cl",
  "promote": true,
  "notes": "Promoción del candidato GREEN"
}
```

El workflow rechaza la promoción si:

- el nombre de rama no corresponde al SHA;
- el commit de promoción no es hijo directo del SHA fuente;
- hay cualquier cambio adicional aparte del manifest;
- `sourceBranch` ya no apunta exactamente a `sourceSha`;
- falla la regresión;
- el runtime PROD actual no cumple contrato;
- Cloudflare devuelve otro proyecto, otro dominio o una configuración inesperada;
- no se puede identificar el deployment productivo anterior por su SHA live real;
- el preflight no contiene el SHA y runtime esperados;
- la verificación live posterior no coincide exactamente con el SHA promovido;
- no aparece un nuevo deployment `production` exacto para el SHA promovido.

El preview puede tardar unos segundos en quedar disponible de forma coherente después de que Wrangler confirme el upload. El verificador reintenta únicamente lecturas del artefacto ya desplegado; no repite el deploy, no toca Supabase y conserva todas las comprobaciones fail-closed de SHA, rama, entorno, proyecto PROD, clave publishable, ausencia de QA, credenciales privilegiadas e identidad visual.

## Flujo operativo recomendado

`cambio -> PR -> CI/auditoría GREEN -> SHA candidato -> rama release/prod-<sha> + manifest -> preflight Pages -> Wrangler PROD -> validación app.iberfit.cl -> auditoría read-only -> evidencia/rollback`

Canary puede seguir existiendo como superficie de prueba cuando aporte valor, pero no es requisito para que el frontend M26 llegue a producción. La condición de entrada a producción es el candidato GREEN exacto, no que exista un despliegue Canary.

## Estado productivo certificado actual

- Fecha de certificación: `2026-09-02` (America/Santiago).
- SHA fuente en producción: `4704b2ba660b3b047d9e674ceaa3b00b07b05dbb`.
- Rama fuente: `canary/rc74-4`.
- Deployment Cloudflare: `d63a2cac-8df1-4c98-bbb4-aacf1e71e3c2`.
- URL de deployment: `https://d63a2cac.iberfit-m26-production.pages.dev`.
- Dominio validado: `app.iberfit.cl`.
- Supabase validado: `pjhmrhejsoofmouedavw`.
- GitHub Actions Production Promotion GREEN: run `33709822598`.
- Deployment productivo anterior reservado para rollback: `c9d61c8f-d95f-4496-808b-fe98c429c8e3`.
- SHA productivo anterior: `e67c89c97d69eabe7f7b6682176e47e68ad6fde2`.
- El login LIVE quedó activo y dejó de mostrar el bloqueo temporal fail-closed de la superficie anterior.
- No se realizaron mutaciones ni migraciones en Supabase PROD durante esta promoción.

## Incidentes de promoción cerrados

- Los intentos previos se detuvieron fail-closed antes de modificar LIVE cuando los gates no pudieron certificar el objetivo.
- PR #48 hizo determinista el runtime PROD y eliminó la dependencia de copiar el runtime live previo.
- PR #49 añadió el verificador reusable con retry read-only acotado para propagación Pages.
- PR #50, #51 y #52 estabilizaron el smoke autenticado frente a cambios de presentación sin debilitar auth ni WebAuthn.
- PR #53 corrigió el último bloqueo: `latest_deployment` de Cloudflare puede ser un preview. El pipeline ahora consulta `/deployments` y selecciona exclusivamente el deployment `production` cuyo commit coincide con el SHA que sirve LIVE. La promoción `4704b2ba...` confirmó el contrato end-to-end en ejecución real.

## Secretos

GitHub Actions debe conservar el secret `CLOUDFLARE_API_TOKEN` con el mínimo permiso necesario para editar Cloudflare Pages en la cuenta IBERFIT. Nunca se escribe el valor del token en el repositorio, artefactos, documentación o conversación.

## Rollback

El rollback se hace únicamente a un deployment productivo anterior previamente identificado. Antes de cualquier rollback se confirma:

- proyecto exacto `iberfit-m26-production`;
- deployment ID objetivo;
- que el deployment pertenece al entorno `production`;
- que el deployment corresponde al SHA live esperado;
- que `app.iberfit.cl` continúa ligado al mismo proyecto.

No se usa `latest_deployment`, un nombre de rama o un SHA inferido como sustituto del deployment ID real de Cloudflare.
