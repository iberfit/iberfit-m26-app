# IBERFIT M26 Canary RC33 · Primera sesión e IRI

## Alcance

RC33 transforma el diagnóstico IRI en un flujo guiado y reproducible para la primera sesión:

`Nueva clienta → expediente → entrevista → composición corporal → movilidad → fuerza → test cardiorrespiratorio → revisión → diagnóstico → plan → informes`.

Parte del commit protegido `7e20bd5087d6acdb07d691bb029b4c44be3bc7f6` de RC32. No modifica `main`, producción ni el contrato canónico de 44 comandos del backend RC30.

## Alta y expediente

La pantalla Clientes incorpora un alta de expediente para Coach/Admin. El alta:

- normaliza identidad, contacto, modalidad, logística, objetivos y contexto;
- mantiene `accessEnabled: false` e `inviteClient: false`;
- utiliza únicamente en canary el RPC heredado `iberfit_create_client_draft`;
- rehidrata el bootstrap antes de mostrar el expediente como confirmado;
- no incorpora `CLIENTE_CREAR` al catálogo canónico.

El RPC debe confirmarse mediante un **gate remoto autenticado** antes de usar RC33 con una persona real. El frontend no presume que la entidad existe hasta recibir respuesta y rehidratar.

## Primera sesión guiada

El borrador utiliza el esquema `iberfit-iri-first-session-v1` y queda aislado por identidad, cliente y alcance `iri-first-session`.

Las siete etapas son:

1. Perfil y servicio.
2. Entrevista y seguridad.
3. Composición corporal.
4. Movilidad.
5. Fuerza por patrones.
6. Capacidad cardiorrespiratoria.
7. Revisión profesional.

Cada etapa permite volver, guardar, continuar o marcar una prueba como no realizada con un motivo. La aplicación calcula completitud, valida la etapa activa y no presenta un borrador como confirmado.

## Batería funcional

### Movilidad

- Dorsiflexión de tobillo, rodilla a pared, tres intentos por lado en centímetros.
- Cadena posterior tipo back-saver/sit-and-reach, tres intentos por lado en centímetros.
- Thomas modificado mediante observación estandarizada.
- Rotación de cadera mediante comparación visual estructurada.
- Sentadilla profunda asistida con registro de profundidad, talones, rodillas, tronco, desplazamiento, dolor y respuesta a asistencia.

No se estiman ni convierten grados que no hayan sido medidos. Las observaciones visuales no generan un percentil universal de movilidad.

### Fuerza

- Chair Stand de 30 segundos, con altura de silla, repeticiones y validez.
- Empuje estándar, inclinado o con rodillas. Cada variante es un protocolo diferente.
- Remo TRX con altura de asas, distancia de talones, posición y repeticiones válidas.
- Plancha frontal y lateral con calidad técnica y asimetría.
- Cadena posterior opcional. Biering-Sørensen solo con equipamiento compatible; el banco de 45° se registra como variante distinta. No se improvisan sujeciones.

Una variante adaptada de empuje no se mezcla con el baremo de flexiones estándar.

### Cardiorrespiratorio

- YMCA 3-Minute Step Test estándar: escalón de 30,5 cm y cadencia de 96 pulsos por minuto.
- Variante IBERFIT de tres minutos con escalón de 20 cm: referencia individual, no baremo YMCA.
- Duración máxima de ejercicio: 180 segundos.
- Registro de FC en reposo, final, al minuto y opcionalmente a los dos minutos, RPE, síntomas, validez y motivo de interrupción.

El test se detiene ante solicitud de la persona, síntomas incompatibles con la continuación, dolor, pérdida de estabilidad o imposibilidad de mantener la cadencia. La evaluación IBERFIT es de rendimiento y **no sustituye una valoración ni un diagnóstico médico**.

## Diagnóstico IRI

RC33 separa:

- medida objetiva;
- protocolo y variante;
- referencia normativa compatible, cuando existe;
- comparación bilateral;
- calidad técnica;
- dolor o respuesta;
- referencia individual cuando no existe baremo adecuado.

No se fabrica una puntuación global universal. El resumen presenta completitud, cobertura, confianza y perfil por dominios. La interpretación y el plan requieren aceptación expresa del Coach.

La confirmación remota sigue usando `IRI_COMPLETAR` y exige una entidad IRI remota existente. Si el alta de cliente no crea esa entidad, el Coach podrá conservar el borrador y generar informes, pero no confirmarlo hasta que el backend disponga del contrato correspondiente.

## Informes automáticos

El sistema visual usa marfil cálido, verde bosque profundo y dorado refinado con contraste alto. El isotipo se integra como sello protagonista en portada, sello interior de cabecera y marca de agua inferior al 3 % de opacidad. La completitud del proceso se separa expresamente del resultado IRI para evitar confusiones.

### Versión Cliente

Siete páginas A4, orientadas a comprensión y acción:

1. Portada premium.
2. Punto de partida, completitud, cobertura, confianza y perfil por dominios.
3. Contexto y objetivos sin datos privados de contacto.
4. Composición corporal descriptiva.
5. Movimiento y movilidad.
6. Fuerza por patrones.
7. Cardiorrespiratorio, plan inicial y próximos pasos.

### Versión Coach / Admin

Trece páginas A4 base más anexos dinámicos:

1. Portada interna.
2. Resumen técnico.
3. Identificación, contacto y logística.
4. Entrevista inicial completa.
5. Seguridad y condiciones relevantes.
6. Composición corporal completa y reporte externo.
7. Movilidad objetiva y tres intentos por lado.
8. Movilidad observacional y compensaciones.
9. Fuerza de tren inferior y cadena posterior.
10. Empuje, tracción y tronco.
11. Evaluación cardiorrespiratoria completa.
12. Diagnóstico por dominios, validez y limitaciones.
13. Interpretación, planificación y trazabilidad.

Los anexos dinámicos conservan la representación íntegra del borrador normalizado, incluidos valores nulos, variantes, motivos de no realización, observaciones y metadatos. Así, la versión interna no pierde datos aunque los bloques editoriales utilicen resúmenes para mantener una maquetación estable.

Ambas versiones usan márgenes cerrados, tablas fijas, envoltura segura de texto, gráficos SVG y páginas A4 con desbordamiento bloqueado. Los textos extensos de la versión interna se conservan completos en anexos dinámicos.

La generación abre un documento local imprimible. No envía datos a un servicio externo de PDF.

## Bioimpedancia y adjuntos

RC33 registra nombre, tipo, tamaño, método, dispositivo, fecha y métricas revisadas por el Coach. El archivo seleccionado permanece local durante la generación del informe.

La carga persistente del PDF o imagen original no se afirma como disponible: requiere un contrato de almacenamiento remoto, políticas RLS, límites y retención aprobados. Hasta entonces, el informe muestra que existe un reporte externo revisado, pero no publica automáticamente el archivo.

## Privacidad

- Cliente recibe el informe simplificado y únicamente su propia proyección autorizada.
- Coach/Admin recibe el informe técnico.
- Las notas internas y campos de calidad no se incorporan a la versión Cliente.
- No se guardan claves, JWT, credenciales de Cloudflare ni `service_role` en el frontend.
- El runtime versionado permanece fail-closed.

## Gates antes de GO

1. Suite completa sin fallos.
2. Gate local RC33 y verificación del candidato.
3. Build con manifiesto y hashes.
4. Gate remoto autenticado de creación de cliente en canary, incluido rollback del registro QA creado.
5. Confirmación de que el alta devuelve o permite crear una entidad IRI remota.
6. Aislamiento Coach / Cliente A / Cliente B.
7. QA HTTP real de `m26-canary.iberfit.cl`.
8. QA visual en móvil, escritorio y zoom 200 %.
9. Prueba real de impresión de ambos informes, con nombres y textos largos.

RC33 no se declara lista para una clienta real hasta completar estos gates externos.

## Rollback

Punto de retorno: `7e20bd5087d6acdb07d691bb029b4c44be3bc7f6` (`canary/rc32`). El despliegue debe permanecer separado de `iberfit.cl`, `app.iberfit.cl`, `coach.iberfit.cl` y `main`.
