# IBERFIT · UX 360 Coach/Cliente — Auditoría integral y macrointegración M32

**Fecha:** 13-10-2026 · **Base inicial verificada:** `f26b78aa133abda8e808ada94481be1e6270030e` (`canary/rc74-4`).
**Enfoque:** experiencia real en Coach y Cliente, móvil primero, publicación explícita y seguridad. Esta revisión se ejecuta como **una sola rama y un solo PR**, no PRs por defecto.

## Inventario prioritario y decisiones

| ID | Prioridad | Superficie/flujo | Evidencia de revisión | Mejora y aceptación |
|---|---|---|---|---|
| UX01 | P0 | Inicio de sesiones / todas las rutas | La política de modalidad y la existencia de bloques se verificaban por separado | Proyección única de ejecutabilidad real; ninguna CTA operativa para sesiones vacías |
| UX02 | P0 | Agenda | Estado terminal evaluado después de confirmación histórica | Cancelación/cierre domina confirmación y solicitudes antiguas |
| UX03 | P0 | Coach en Agenda/Sesiones | Inicio en tarjetas incluso sin cita válida y sesión publicable | CTA de Coach solo cuando sesión publicada, ejecutable y cita supervisada confirmada |
| UX04 | P1 | Hoy Cliente | Sesión autónoma sin cita exigía otro paso de navegación | Iniciar directamente sesión guiada disponible sin inventar cita |
| UX05 | P1 | Entrenamiento | Referencias RPE/RIR/tempo/descanso implícitas cuando faltaba dato | Solo mostrar prescripción explícita, manteniendo el cero real |
| UX06 | P1 | Constructor Coach | Muchas acciones visibles compiten con el flujo de revisión | Mantener revisión obligatoria y jerarquizar trabajo útil; no publicar desde un borrador sin previsualización |
| UX07 | P1 | Publicación | Vistas previas extensas repetidas abiertas por defecto | Disclosure cerrado por defecto y siguiente decisión expresada en el encabezado |
| UX08 | P1 | Planificación Coach | Ciclo, sesión, publicación y Agenda obligaban a inferir siguiente paso | Camino compacto contextual de cuatro hitos; acceso directo al siguiente tramo |
| UX09 | P1 | Comunicación | Mensajes sin leer a cero se presentaban como 0 nuevos; campos sin etiqueta visible | Mostrar insignia solo cuando hay mensajes, etiquetar controles y normalizar fecha local |
| UX10 | P1 | Navegación por roles | Variaciones entre superficie clásica y RC39 | Mismas restricciones de ejecución, modo y servicio pausado |
| UX11 | P1 | Estados | Falta de bloques confundida con modalidad supervisada | Distinguir sesión presencial, en preparación, pausada y autónoma |
| UX12 | P1 | Identidad | Título operativo personal vinculado a fundador | Identidad corporativa estable: «Hoy en IBERFIT» |
| UX13 | P2 | Estética/jerarquía | 4.000+ líneas de estilos de superficie y listas densas | Pulido dirigido, sin otra capa de gradientes ni nuevos contenedores innecesarios |
| UX14 | P2 | Móvil/a11y | Disclosures y formularios en áreas estrechas | Touch >=44px, foco visible, wrap seguro y movimiento reducido |
| UX15 | P2 | Rendimiento percibido | Cada publicación desplegaba contenido denso por defecto | Detalles bajo demanda, sin eliminar contenido ni cambiar persistencia |

## Contratos que no se pueden romper

- **Cliente** solo puede iniciar sesiones publicadas, guiadas, con datos ejecutables y servicio activo. «Visible» no equivale a «ejecutable».
- **Coach** decide estructura, publicación y ejecución supervisada. Una propuesta de cita no permite iniciar una sesión dirigida.
- **IRI** inicial y **seguimiento** permanecen separados. No se modifican esquemas, identidad de cuentas, consentimientos ni datos históricos.
- Los estados de borrador, publicación, pendiente, error y sincronización no se maquillan con mensajes optimistas.
- Ningún cambio destruye o migra sesiones; la compatibilidad histórica y seguridad de RLS/backend siguen siendo obligatorias.

## Cobertura funcional auditada

Coach: Hoy, cartera, expediente, IRI, planificación, editor de sesiones, plantillas, biblioteca, previsualización, publicación, Agenda/citas, ejecución, feedback, progreso, informes, mensajes y pendientes. Cliente: Hoy, onboarding, planificación, sesiones presenciales/autónomas, actividad y wearables, Live Workout, progreso y evolución, informes, retos, mensajes y Ajustes. Transversales: navegación, responsive, sesión/autenticación, accesibilidad, recuperación, estados y diseño.

## Validación de macro PR

- Pruebas de regresión específicas M32 y toda la suite Node.
- Fast Lane, Continuous Audit, Canary Policy, sesión QA, autenticación y experiencia de dispositivo.
- Pruebas de navegación/funciones con roles y preflight autenticado de QA sin mutaciones de datos reales.
- Despliegue exacto en Canary, promoción de SHA aprobado, verificación de `app.iberfit.cl` y evidencia de rollback.

## Límites y elementos paralelos

La revisión está basada en código, contratos y evidencia de CI disponible. **No equivale a inspección ocular manual de cada pantalla en un dispositivo físico**. El PR #908 (natación M29) y #809 (imágenes de ejercicios) se mantienen como líneas concurrentes: no se incorporan automáticamente mientras tengan fallos de CI o conflictos. La infraestructura de Supabase PROD y los wearables no reciben migraciones dentro de esta intervención de UX.
