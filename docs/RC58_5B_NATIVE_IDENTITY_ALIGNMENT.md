# RC58.5B â€” Native Identity Alignment

RC58_5B_STATUS=IMPLEMENTED
RC58_5B_SOURCE_OF_TRUTH=public/isotipo-iberfit.png
RC58_5B_SOURCE_SHA256=d4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa

## Objetivo

Alinear Phone y Wear con Brand Truth sin convertir los shells nativos de telemetrÃ­a en una segunda aplicaciÃ³n independiente.

La identidad deriva desde el asset oficial y los tokens RC58.

No se toma ningÃºn color o icono desde la web comercial.

## Marca nativa

Phone y Wear reciben una copia byte-for-byte del asset oficial en:

- `drawable-nodpi/iberfit_brand_mark.png`

Su SHA256 debe ser idÃ©ntico al master web.

El asset no se recolorea.

## Launcher

Se crea un launcher adaptativo para API 26+:

- fondo = `@color/iberfit_color_canvas`;
- primer plano = asset oficial con inset de seguridad;
- manifest = `@mipmap/ic_launcher`.

TambiÃ©n se generan PNG de fallback mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi desde el mismo asset oficial sobre el canvas canÃ³nico.

Los PNG derivados pueden redimensionar/centrar el artwork, pero no modifican sus colores internos.

## Monochrome / themed icon

THEMED_ICON_MONOCHROME_STATUS=DEFERRED
THEMED_ICON_REASON=APPROVED_VECTOR_MASTER_NOT_PROVEN

Brand Truth declara `vectorMasterProven=false`.

No inventamos ahora una versiÃ³n monocroma potencialmente distinta de la marca oficial. Cuando exista un master vectorial aprobado se podrÃ¡ incorporar un `monochrome` layer deliberado.

## Tema nativo

Phone y Wear usan `IBERFITNativeTheme`:

- canvas;
- accent;
- textPrimary;
- textSecondary;
- status/navigation bars.

Todos se resuelven desde los XML generados por los tokens RC58.

No se duplican hex de interfaz en los themes nativos.

## Shell visible

Los shells tÃ©cnicos existentes conservan toda su lÃ³gica y permisos.

Solo se aÃ±ade el isotipo oficial como cabecera visual y el theme IBERFIT.

No se toca:

- BLE;
- Health Services;
- Data Layer;
- permisos;
- foreground services;
- execution/session IDs;
- comandos start/pause/resume/stop;
- failover.

## PWA y web comercial

RC58.5B no modifica todavÃ­a los iconos PWA de M26 ni la web comercial.

Esos activos se compararÃ¡n en el gate cross-surface; no se sustituyen por similitud.

M26_PWA_ICONS_TOUCHED=FALSE
COMMERCIAL_WEB_TOUCHED=FALSE

## Seguridad

No se aÃ±aden dependencias.

No hay descarga runtime de assets.

Phone y Wear empaquetan el asset local.

RC58_5B_NATIVE_IDENTITY=PASS
RC58_5B_PHONE_BRAND_MARK=PASS
RC58_5B_WEAR_BRAND_MARK=PASS
RC58_5B_ADAPTIVE_LAUNCHER=PASS
RC58_5B_TOKEN_THEME_ALIGNMENT=PASS
RC58_5B_BUSINESS_LOGIC_CHANGED=FALSE
RC58_5B_NEW_RUNTIME_DEPENDENCIES=ZERO

NEXT_ACTION=RC58_5C_COMMERCIAL_TOKEN_CONTRACT
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY
NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY