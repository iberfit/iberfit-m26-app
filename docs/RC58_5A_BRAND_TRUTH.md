# RC58.5A — Brand Truth

RC58_5A_STATUS=CANONICAL_BRAND_ASSET_CONFIRMED
OFFICIAL_BRAND_ASSET=public/isotipo-iberfit.png
OFFICIAL_BRAND_ASSET_SHA256=d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa
OFFICIAL_LOGO_PRIMARY_APPEARANCE=GOLD
OFFICIAL_ASSET_GENERATED_BY_AI=FALSE

## Evidencia

El inventario read-only RC58.5A encontró el mismo `public/isotipo-iberfit.png` en baseline M25, legacy oficial, candidatos de lanzamiento y M26 actual con el mismo SHA256.

Además, la evidencia RC45.5I ya versionada en el repositorio declara explícitamente:

- `status=OFFICIAL_ISOTIPO_COMPOSITION_APPROVED`;
- `officialAsset=public/isotipo-iberfit.png`;
- el mismo SHA256;
- `officialAssetUsed=true`;
- `generatedByAI=false`.

El metadata del master visual RC45.5I vuelve a declarar el mismo asset como `officialAsset` y conserva una derivada de marca aprobada.

Por tanto, ya no tratamos este PNG como un candidato: es el asset oficial canónico disponible en el repositorio.

## Color

El logo es visualmente dorado.

El inventario raster observó:

- color exacto más frecuente: `#FBDD8B`;
- media de la familia dorada: `#FADC84`.

Estos valores NO se convierten en el "hex oficial" del logo.

El asset tiene sombreado y variaciones tonales. La política correcta es usar el artwork oficial sin recolorearlo desde CSS, Android XML o tokens de interfaz.

CANONICAL_LOGO_GOLD_HEX=NULL
OFFICIAL_LOGO_USE_AS_IS=TRUE
LOGO_RECOLOR_FROM_UI_TOKENS=FALSE

Los actuales `gold500=#c8a65d` y `gold300=#e4cd98` siguen siendo acentos del producto. No se afirma que sean una muestra literal del logo y RC58.5A no los modifica.

## Web comercial

La web comercial actual no es fuente de verdad visual.

Se preservarán su contenido, SEO, estructura útil y activos válidos, pero logo y branding deberán derivar de Brand Truth.

COMMERCIAL_CURRENT_CSS_IS_BRAND_SOURCE_OF_TRUTH=FALSE
COMMERCIAL_CONTENT_AND_SEO_PRESERVATION=TRUE

## App icons

Existen iconos históricos y actuales, pero no se promueve ninguno a master de marca por similitud o antigüedad.

RC58.5B deberá validar o derivar la identidad nativa desde el asset oficial, no al revés.

APP_ICON_SOURCE_OF_TRUTH=OFFICIAL_BRAND_ASSET
APP_ICON_ALIGNMENT_STAGE=RC58_5B

## Lanzamiento

El contrato de paridad de `app.iberfit.cl` sigue intacto.

FINAL_APP_LAUNCH_DOMAIN=app.iberfit.cl
CURRENT_APP_PRESERVE_UNTIL_CONTROLLED_CUTOVER=TRUE
FUNCTIONAL_PARITY_REQUIRED_BEFORE_CUTOVER=TRUE

## Jerarquía

BRAND_TRUTH -> DESIGN_TOKENS -> M26 / ANDROID / WEAR / COMMERCIAL_WEB

RC58_5A_BRAND_TRUTH=PASS
RC58_5A_CANONICAL_ASSET=PASS
RC58_5A_LOGO_GOLD=PASS
RC58_5A_NO_COLOR_GUESSING=PASS
RC58_5A_COMMERCIAL_NOT_SOURCE_OF_TRUTH=PASS
RC58_5A_PRODUCTION_TOUCHED=FALSE

NEXT_ACTION=RC58_5B_NATIVE_IDENTITY_ALIGNMENT
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY