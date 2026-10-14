# IBERFIT NEXT · M41 Ultrapremium — sistema visual integral

**Fuente de verdad:** `IBERFIT_NEXT_ULTRAPREMIUM_M41_M45_MASTER.md`, `src/m26/design/tokens.json` y `brand-truth.json`.
**Rama de trabajo:** `feat/m41-integral-premium-visual-system` desde Canary/PROD M43 `e6c06cd071e756e4151f83aa75d74c8469103d29`.
**Modalidad:** una integración M41, un PR Draft mientras se trabaja; Ready solo cuando el candidato completo está preparado. La ejecución de GitHub, Canal Canary y PROD deberá demostrarse por separado.

## 1. Diagnóstico — diseño anterior frente al objetivo

En la auditoría del código productivo se detectó superposición de nueve generaciones de estilos. V3 era la última capa canónica y contenía **28 declaraciones de degradado** y **312 declaraciones `!important`**. `role-surfaces.css` contenía **91 degradados** y el dock Cliente añadía brillos, blur y sombras innecesarios. Varias superficies operativas usaban tamaño de 10–12 px para texto importante, especialmente el constructor Coach, la autenticación y la navegación compacta.

No se borra CSS heredado a ciegas: hay contratos RC58/RC64 y rutas históricas que dependen de sus selectores. La estrategia conserva la hoja premium como capa terminal y **edita las reglas existentes** en vez de añadir `m41-final-override.css`, crear nuevas tarjetas o romper contratos por reducir un contador.

## 2. Gramática de marca y materiales

- **Verde bosque profundo:** arquitectura, seguridad, identidad, barra y navegación; superficies mates `#0B1310`, `#13221C`, `#192E24`.
- **Crema/papel `#F5F5F0`:** instantes editoriales de mayor calidez y significado; no un cambio indiscriminado a interfaces blancas. Aplicado a «Hoy tranquilo» con títulos y ayuda de tinta verde de contraste WCAG AA. No convertir formularios, popovers ni informes con estado en superficies blancas inesperadas.
- **Dorado `#C5A059` / `#D7BA7C`:** navegación activa, línea editorial, CTA principal y foco perceptible; jamás indicador genérico de éxito. Éxito y error conservan sus colores semánticos.
- **Materiales:** menos sombras, gradientes, blur y acuarelas de fondo; distancia por espaciado, valor por tipografía y contraste, no por ornamentación.
- **Marca:** preservación estricta del isotipo PNG aprobado, sin cambiar firma de archivo, convertirlo en vector no aprobado ni recolorarlo. Inter Variable y Source Serif 4 ya autohospedadas.
- **Tipografía:** Serif editorial para los encabezados significativos del Cliente; Inter para lectura densa de Coach y gestión/Admin; valores medidos con números tabulares.

## 3. Tres experiencias realmente distintas

| Área | Lenguaje y ritmo | Lo que se conserva |
|---|---|---|
| Cliente | Espacios más generosos, encabezados editoriales, CTA principal inteligible, tarjetas sobrias, papel crema solo donde comunica calma y descanso; dock móvil con etiquetas legibles | Hoy contextual, sesión guiada/presencial, IRI separado, evolución, formularios y progreso |
| Coach | Verde funcional y directo, herramientas compactas, etiquetas legibles, añadir ejercicios con toque de 44 px, rutas y selección rápidas | Editor/borradores, publicar, ejecutar, planificar, IRI, agenda, control de errores y WebAuthn |
| Admin | Tono ejecutivo, menos decoración, tablas escaneables, estados y asistentes legibles, títulos Inter, numeración tabular | Controles, tablas, permisos, jerarquía, auditoría y trazabilidad |

La **experiencia de entrada** es una cuarta superficie compartida que debe percibirse como un umbral de confianza: bosque sobrio, tipografía accesible, menos ruido artificial, guías y recuperación legibles. No se altera ningún flujo de identidad.

## 4. Alcance real de código

Intervención directa en **las hojas existentes**, sin cuarta capa:
- `iberfit-premium-v3.css`: tokens materiales de cada rol; unifica paneles mate, acción primaria dorada sobria, jerarquía, borde semántico, foco perceptible, zonas táctiles, movilidad reducida y forced colors.
- `role-surfaces.css`: limpieza de fondos, sidebar/hero/dock, escalas de título Cliente/Coach/Admin y lectura numérica Admin.
- `dark-iberfit-v2.css`: prioridad única en Hoy, reducción de efectos, una banda cálida clara con contraste real, etiquetas del constructor, botones de ejercicio, controles y mensajes.
- `client-bottom-nav.css`: controles del dock, más legibilidad a 320 px, selección horizontal silenciosa, popover accesible y reducción de blur.
- `auth-native.css`: simplificación de fondo, autenticación editorial y mensajes/fases de MFA legibles.
- `admin.css`: navegación, formularios y microtextos Admin, incluidos pasos de alta.
- `shell.css`: primer fotograma estable, tipografía editorial tokenizada, branding y asistencia IRI móvil.
- `qa/device-experience/device-experience.spec.mjs`: permitir una sola superficie crema expresamente aprobada **si y solo si** sus textos reales superan 4.5:1, sin admitir tarjetas blancas aleatorias.
- `qa/device-experience/m41-premium-visual.spec.mjs`: evidencia sintética renderizada por navegador real en diez geometrías, materiales diferenciados, overflow, navegación y contraste real. Se integra en el Device Experience Gate existente.
- `tests/m41_integral_premium_visual_system.test.mjs`: cobertura estructural de marca, jerarquía, ausencia de capa adicional, semántica, a11y, áreas táctiles y wire-up de QA.

## 5. Aceptación transversal y casos sensibles

**Dispositivos:** 320, 360, 390, 768, 820, 1024, 1180, 1366 y 1440 px, horizontal/vertical; safe areas, menú Más, selección de cliente, campos, tablas, IRI, ejecución, print y reportes. Ampliación al 200% con lectura y navegación, sin suponer que 320px sintéticos sustituyen pruebas manuales de zoom.

**Roles:** Cliente Solo IRI no ve entrenamiento inventado; Coach no pierde borradores ni sesión al enfocar un input o desplegar Más; Admin conserva acciones críticas. La migración M43 y la separación IRI-evolución permanecen intactas.

**Estados:** loading, empty, success, error, offline, retry y conflicto no se unen en un color ambiguo; errores conservan texto, prioridad y recuperación. Estados seleccionados no dependen exclusivamente del dorado.

**Accesibilidad:** objetivo 48 px Cliente / 44 px profesionales; foco teclado >=3 px, alto contraste y Windows forced colors, tipografía funcional >=13–14 px en controles críticos, input móvil 16 px, scroll libre, reduced motion y numeración tabular.

**Rendimiento:** simplificar blur y gradientes sin tocar JavaScript, datos ni el motor de sesión. Medir Lighthouse y el comportamiento auténtico en Canary y PROD; no atribuir mejoras de Core Web Vitals sin medición.

**Confidencialidad:** snapshots QA sintéticos; navegadores Coach/Admin reales solo tras WebAuthn de confianza en Canary. Ningún cambio de datos, SQL, roles o permisos se justifica por cosmética.

## 6. Evidencias exigidas antes de cerrar

1. Tests M41 locales/Node y CI de contrato; comparativa de gradientes/cascade, validación de identidad/tokens.
2. Matriz Playwright Device Experience Gate con **fuente CSS real** y screenshots para Cliente, Coach y Admin, no una captura genérica.
3. Revisión QA de login/MFA, navegación, estados, tablas, builder, IRI, Cliente Hoy, scroll, touch y foco 320px–escritorio.
4. PR Ready una sola vez, todos los checks requeridos verdes y, post-merge, WebAuthn real Coach/Admin + Canary exacto verde.
5. Producción vía promoción oficial `release/prod-<sha>` (solo manifiesto), Lighthouse, revisión LIVE, registros de rollback y SHA.
6. Diferenciar siempre código preparado, rama/PR, merge, Canary desplegado y producción verificada. **Este documento no certifica por sí mismo esos hitos.**

## 7. Deuda honesta y próximos módulos

El CSS heredado con `!important` y rutas históricas sigue existiendo; M41 no puede borrarlo sin validar regresiones pantalla por pantalla. La intervención consolida materiales efectivos en V3 pero no pretende reescribir todo el historial RC58–RC74. Los aspectos de organización de contenido Cliente «Hoy» y «Mi plan» corresponden a M42; progreso longitudinal y nuevas visualizaciones a M44; cierre funcional del sistema a M45. No recrear esas capacidades dentro del sistema visual.
