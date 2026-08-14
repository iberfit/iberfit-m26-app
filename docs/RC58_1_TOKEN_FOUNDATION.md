# RC58.1 — Token Foundation

RC58_1_STATUS=IMPLEMENTED
RC58_1_SINGLE_SOURCE=src/m26/design/tokens.json
RC58_1_VISUAL_DELTA=INTENTIONALLY_MINIMAL

## Decisión

La base visual existente ya tenía una paleta IBERFIT reconocible, pero las decisiones estaban repartidas entre `shell.css`, RC históricos y CSS específicos de Cliente, Admin, comunicación, wearables e IRI.

RC58.1 no hace un rediseño masivo. Primero crea una fuente canónica y adapters derivados para evitar que el rediseño posterior multiplique valores incompatibles.

## Fuente canónica

`src/m26/design/tokens.json`

Contiene:

- primitives y semantics de color;
- spacing;
- radii;
- shadows;
- tipografía;
- motion;
- breakpoints;
- layout;
- touch targets;
- z-index;
- densidad por rol;
- paleta base para visualización de datos.

## Salidas generadas

`scripts/generate_rc58_design_tokens.mjs` genera determinísticamente:

- `src/m26/design/tokens.generated.js`
- `src/m26/design/tokens.css`
- Phone Android `iberfit_design_tokens.xml`
- Wear Android `iberfit_design_tokens.xml`

Los archivos generados no se editan a mano.

## Compatibilidad

`src/m26/ui/design-system.js` conserva `M26_DESIGN_TOKENS` y `M26_PALETTE` para no romper contratos RC12+.

`tokens.css` se carga antes de `shell.css`.

Los aliases `--m26-*` permanecen mientras RC58 migra componentes de forma incremental.

## Inventario crítico de deuda visual

La migración completa NO se hace en RC58.1 porque mezclar foundation y restyling elevaría demasiado el riesgo de regresión.

Hotspots ya identificados:

- `shell.css`: capas históricas RC3–RC20 con varios valores inline;
- `client-bottom-nav.css`: paleta, radios, sombras y motion propios;
- `admin.css`: acento y superficies propios;
- `communication.css`: acento azul y superficies propios;
- `rc44.css`: wearables con colores/motion locales;
- `iri-external-report.css`: superficies, estados y viewer locales.

RC58.2/58.3 migrarán estas decisiones hacia tipografía/iconografía/primitives. RC58.4 aplicará densidad por rol.

## Accesibilidad y datos

- touch target recomendado: 44 px;
- focus semantic token;
- estados success/warning/danger/info;
- seis colores de series claramente diferenciados sobre canvas oscuro;
- missing data tiene token propio;
- los colores de series no codifican decisiones clínicas.

## Seguridad / supply chain

RC58.1 añade cero dependencias externas.

No incorpora CDN, remote font, runtime fetch ni script de terceros.

La futura incorporación de Lucide y fuentes autohospedadas pasará el rail SR6.

## Criterio de cierre

RC58_1_TOKEN_SINGLE_SOURCE=PASS
RC58_1_CSS_ADAPTER=PASS
RC58_1_JS_COMPATIBILITY=PASS
RC58_1_ANDROID_PHONE_MAPPING=PASS
RC58_1_ANDROID_WEAR_MAPPING=PASS
RC58_1_ACCESSIBILITY_BASELINE=PASS
RC58_1_DATA_VIZ_FOUNDATION=PASS
RC58_1_NO_NEW_RUNTIME_DEPENDENCIES=PASS

NEXT_ACTION=RC58_2_ICON_TYPOGRAPHY_SYSTEM
NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY