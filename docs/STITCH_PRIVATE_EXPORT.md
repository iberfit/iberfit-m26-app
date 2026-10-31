# Stitch → GitHub → IBERFIT: fidelidad visual controlada

**Decisión:** el HTML/imagen aprobados de Stitch son el umbral de calidad visual mínimo. No basta con copiar la paleta. Se debe reproducir la geometría, tipografía, ritmo, superficies, gráficas y jerarquía en los componentes reales de Cliente, Coach y Admin.

**Seguridad:** el repositorio iberfit/iberfit-m26-app es PÚBLICO. No copiar HTML/PNG privados, claves API ni archivos DEMO a su Git ni a GitHub Actions artifacts; podrían estar accesibles a terceros. Las exportaciones se guardan solo en .tmp/stitch-private (ignorado), con permisos locales restringidos. No hay sincronización automática Stitch → rama protegida.

## Exportación privada sin servicios de pago

El script scripts/stitch_export_private.mjs usa @google/stitch-sdk v0.3.5; solo llama list screens, get_project, getHtml, getImage. Nunca genera ni edita pantallas.

La API key de Stitch existente en AppDeploy no se transfiere automáticamente a GitHub. Configurar STITCH_API_KEY únicamente en un entorno privado y temporal, nunca en el chat, PR o navegador público.

Para ejecutar sobre un equipo/runner PRIVADO con conexión a npm y Stitch:
1. Instalar SDK en un entorno de desarrollo, sin incluirlo en el bundle productivo: npm install --no-save --no-package-lock --ignore-scripts @google/stitch-sdk@0.3.5
2. node --test tests/stitch_private_export.test.mjs
3. Con STITCH_API_KEY inyectada de forma segura: node scripts/stitch_export_private.mjs --list --title ""
4. node scripts/stitch_export_private.mjs --title "Cliente · Hoy" --limit 1
5. Inspeccionar .tmp/stitch-private/1399435845853535416/manifest.json y archivos asociados.

Si no están disponibles las etiquetas del lienzo, usar --screen <id> tras inventariar. La salida nunca va al directorio public ni a un artefacto CI público.

## Homologación real, no copia de un prototipo

- Cliente Hoy: src/m26/modules/route-render.js + src/m26/design/iberfit-premium-v3.css.
- Ejecución: src/m26/workflows/session-ui.js + src/m26/design/premium-ux.css.
- Coach Agenda: componentes existentes de prescripción, ocurrencias, agenda y estado de ejecución.
- Admin: componentes y autorizaciones existentes, sin inventar certificaciones RLS o métricas.
- IRI inicial permanece separado de Evolución.

El HTML de Stitch se inspecciona como referencia de presentación. Se adaptan sus clases, layout, tipografía y SVG a la aplicación M26, sin insertar CDN Tailwind ni scripts no auditados, ni sustituir autenticación, RLS, estado, controles reales y persistencia.

QA de aceptación: capturas Stitch y app autenticada a 320/390/430, 834/1024, 1440; keyboard, scroll, safe area, PWA, zoom, contraste WCAG 2.2 AA, estados empty/offline/error/confirmed y pruebas de sesiones. Mantener único PR principal de visual SIGNATURE, Canary certificado y promoción PROD por runbook separado.

**Estado:** herramienta preparada y test local simulado; falta ejecución autenticada contra la API desde un entorno con su secreto seguro, exportación real y homologación de pantallas.

## SIGNATURE U80 · Evidencia visual sintética completa, sin fingir homologación

La prueba `SIGNATURE U77` del navegador aislado mantiene sus verificaciones
de las 43 rutas canónicas con renderizador real e identidad **sintética**.
Como complemento, `U80` adjunta una captura JPEG de página completa para
**cada ruta** en móvil Chromium 390px y escritorio Chromium 1440px,
más un manifiesto JSON por rol/proyecto que declara
`authenticated: false` y `stitchParityCertified: false`.
Los demás proyectos preservan su evidencia existente. No hay peticiones
nuevas al backend ni incorporación de identidades o métricas DEMO a producto.

Estas 86 capturas son una **base de revisión artística**, no certificación
automática. Deben compararse manualmente con originales aprobados de Stitch
y complementarse con capturas y tareas autenticadas de QA para cerrar el gate.
Actualmente sólo hay un original formal verificado:
Cliente Hoy V2.3 móvil 390px. No afirmar homologación de Coach/Admin
ni 43 pantallas equivalentes a Stitch basándose en estos fixtures.
