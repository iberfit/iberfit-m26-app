# IBERFIT · SIGNATURE EXCELLENCE 360 · Auditoría de producto 09/11/2026

Base verificada de Canary y PROD tras la release universal: `20f88839490daf996a6fb45db15d4baa12518c8c`. La PR universal #1303 se fusionó y se publicó con el workflow protegido #42684613908. Las migraciones U90/U91 no se ejecutaron en PROD mediante esa release frontend-only.

## Contratos protegidos

- Prescripción, ocurrencia y ejecución son entidades diferentes; dos fechas implican ejecuciones independientes
- Diagnóstico IRI inicial ≠ evolución longitudinal
- Éxito local ≠ ACK del servidor; no esconder errores o inventar datos
- Cliente, Coach y Admin mantienen experiencias y autorización independientes
- No hacer ninguna baja de personas sin inventario cross-service, consentimiento/legalidad, backup+restore y postcondición verificable
- No modificar Auth, RLS, datos personales, Storage ni migraciones desde CSS/QA frontend

## Hallazgos de la auditoría senior y estado actual

| Informe | Estado verificado / salida necesaria |
| --- | --- |
| F01 M44 | Cerrado para release universal: respaldo PostgreSQL+Storage restaurado, control de reintentos fail-closed |
| F02 DELETE direct | PROD+QA RLS activa; anon/authenticated sin privilegio DELETE; service_role requiere orquestación privilegiada |
| F03 supresión Auth/Storage/DB | Pendiente de proceso integral de baja; preservar íntegramente a Patricia |
| F04 multifecha U71 | E2E protegido de dos fechas aprobado en QA SHA fusionado, intento 2 #42680228605 |
| F05 WebAuthn y Coach | Coach/Admin QA real aprobado; Coach móvil Hoy 3,86s, Clientes 7,01s, Planificación 7,37s; no extrapolar a PROD |
| F06 recibos de operación | Contratos existentes U360, mantener y volver a probar bajo latencia y doble toque |
| F07 visibilidad de repo | Requiere decisión empresarial; no privatizar cambiando dependencias sin revisar CI |
| F08 release y SQL | Frontend-only publicado con SHA exacto; U90 en PROD sigue pendiente, U91 es estrictamente QA |
| F09 media | Auditoría de cobertura técnica/atribuida por ejercicio pendiente |
| F10 nativo/wearables | No considerar permisos web como sincronización real; certificar dispositivo físico por SO |
| F11 auth/reconexión | Mantener matriz de expiración, segundo acceso, multi-dispositivo, offline y recovery |
| F12 Supabase Free | Presupuesto de payload y render: 3,47 MB, 1.367 check-ins, 202 reportes y 659 sesiones en evidencia Coach QA de segundo acceso |
| F13–F17 arquitectura/UI | Refactorizar con contratos; no reescribir ni eliminar capacidades; visual 4K por rol |
| F18 CI | Sin desactivar gates; minimizar ejecuciones y evitar solapes de credenciales QA |
| F19 versión | Fuente de verdad es /m26/version.json, no encabezados históricos |
| F20–F21 UHD/AA | Añadir inspección autenticada 3840×2160 y accesibilidad; capturas no son prueba de cumplimiento WCAG completo |
| F22 informes | IRI inicial y seguimiento separados, validación de emisión/lectura y permisos |
| F23 offline | Cola e idempotencia sin prometer sincronización que no se confirmó |
| F24 analítica | Opt-in, agregados sin datos personales, sin URL/token privado |
| F25 legal | Revisión jurídica Ley 21.719 Chile y retención; ninguna supresión automática |
| F26 nativo | Conservar Kotlin/Swift existentes; hardware, firma y stores no certificados por CI web |

## Macrobloque de rendimiento + UHD

La evidencia real del Coach muestra 718 ciclos y 640 sesiones históricas con tarjetas DOM dentro de disclosures cerrados. La primera intervención conserva cada elemento y sus acciones, pero mantiene en templates inertes los batches no abiertos; el Coach los activa por teclado o touch y el DOM real se rellena una única vez al abrir el grupo. Los datos, permisos, orden y recibos remotos no cambian. La validación añade visual QA 3840×2160 en superficies autenticadas y test de apertura real de batch.

**No declarar rendimiento mejorado sin comparar tiempos y DOM con una ejecución del mismo escenario.** Objetivo inicial: Coach Hoy <5s; Clientes/Planificación <5s en escenario representativo, QA sin errores HTTP 500/57014, pruebas Cliente/Coach/Admin completas y sin cambios de datos. El plan de siguientes implementaciones permanece en esta misma rama/PR hasta el gate final; el carácter de documento no equivale a funcionamiento certificado.
