# IBERFIT · SIGNATURE MASTER VISUAL U90 · Macrobloque único de integración
**Estado:** WIP en PR #1213; el código de este macrobloque NO se declara aprobado, fusionado, desplegado ni homologado con Stitch.

## Cambio real
Integra el lenguaje artístico basado en Stitch V2.3/R20–R26 en los componentes reales compartidos de las **43 rutas existentes** (9 Cliente, 17 Coach, 17 Admin), usando el mismo `src/m26/design/iberfit-premium-v3.css` que carga la aplicación autenticada. Las rutas, permisos, datos, navegación, acciones, fuentes de actividad, IRI, sesiones y Auth siguen implementados por sus controladores originales. No se incorpora HTML/PNG del repositorio privado ni métricas de demostración.

Identidad visual: superficies verde-negro mate, marfil cálido, dorado champán selectivo, tipografía editorial de Cliente y estilos operativos específicos Coach/Admin. Se refuerzan jerarquía, superficies, tablas, controles, densidad por rol, legibilidad tabular y nitidez de SVG en el producto real.

## Criterios de QA y limitaciones
- Node: `node --test tests/m26_signature_master_visual_u90.test.mjs`.
- Cobertura funcional y renderizado sintético: `qa/device-experience/signature-u25-real-route-bodies.spec.mjs` en la configuración existente con matriz de 43 rutas, sin añadir tráfico Supabase.
- Calidad real: comparación de capturas autenticadas SHA exacto contra Stitch a 320/390/430, 768/820/1024/1280/1440; acciones táctiles, E2E Cliente/Coach/Admin, safe area, focus, read-only, error/retry, WebKit/Android y gráficos Retina. NO considerar equivalencia visual probada por tests estáticos.
- Aceptación artística: Cliente Hoy V2.3 único aprobado; los demás candidatos aún deben homologarse. El sistema transversal no convierte automáticamente los mockups en pantallas aprobadas.
- Integración: usar la PR visual existente #1213; antes del merge resolver conflictos con Canary vigente, revisar cambios ajenos de Supabase y ejecutar gates de seguridad, CI, dispositivos y producción de manera controlada.
- Riesgo: la hoja actual del producto contiene varias capas CSS históricas. U90 centraliza los nuevos criterios en la capa visual ya cargada y NO añade otra hoja. Si alguna pantalla necesita reestructura HTML, hacerlo en la misma PR y probar sin degradar estados y permisos.
- No se modifica `approved.json` privado, Supabase, RLS, releases, Canary ni app.iberfit.cl. No usar este documento como certificado de producción.
