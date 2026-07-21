# RC28 · Runbook de publicación controlada

## Principio

La publicación se realiza por etapas reversibles. Ninguna etapa autoriza automáticamente la siguiente. `iberfit.cl` no se modifica. `app.iberfit.cl` y `coach.iberfit.cl` permanecen intactos hasta la aprobación final.

## 0. Congelar el candidato

- Verificar SHA-256 de los ZIP RC28.
- Conservar M25.1 como rollback inmutable.
- Conservar M25.2 como baseline funcional.
- Confirmar `runtime-config.js` desactivado en el artefacto local.

## 1. Preflight Supabase de solo lectura

- Ejecutar las auditorías SQL de solo lectura.
- Comparar exactamente las 52 definiciones del registro remoto.
- Rechazar diferencias de tipo, entidad, evento, rol, motivo, vista previa o habilitación.
- No ejecutar migraciones hasta revisar el resultado.

## 2. Cuentas QA reales

Crear como mínimo:

- un Entrenador QA;
- dos Clientes QA de ámbitos diferentes;
- datos ficticios identificables y eliminables.

Comprobar que cada Cliente solo recibe su identidad, expediente, publicaciones y revisiones remotas.

## 3. Pruebas de abuso y RLS

- intentar consultar el ID del otro Cliente;
- intentar invocar comandos Coach desde Cliente;
- intentar consultar notas privadas y contenido no publicado;
- inspeccionar el payload de bootstrap y cada respuesta REST/RPC;
- confirmar que la denegación ocurre en servidor, no solo en interfaz.

## 4. Desplegar el canario

Destino exclusivo: `m26-canary.iberfit.cl`.

- no cambiar DNS de producción;
- no reutilizar secretos en frontend;
- activar únicamente las variables QA;
- confirmar CSP, service worker y cabeceras efectivas;
- registrar hora, versión y operador.

## 5. Observación funcional

Ejecutar en el canario:

- recorrido Coach completo;
- recorrido Cliente completo;
- publicación y retirada de plan, sesión e informe;
- cambio de cuenta y cierre de sesión;
- pérdida y recuperación de red;
- conflicto de revisión;
- historial amplio y búsqueda de clientes.

## 6. Dispositivos y accesibilidad

Probar al menos:

- iPhone físico;
- Android físico;
- tableta;
- navegador de escritorio;
- teclado completo;
- VoiceOver o TalkBack;
- tamaño de texto aumentado y reducción de movimiento.

Health Connect solo se habilita después del puente nativo y del consentimiento real.

## 7. Ensayo de rollback

- desplegar RC28 en canario;
- restaurar M25.1 siguiendo el procedimiento documentado;
- comprobar cachés, rutas, sesión y datos;
- medir tiempo total y registrar incidencias;
- volver a RC28 únicamente tras confirmar el rollback.

## 8. Decisión de publicación

Solo procede si:

- todos los gates anteriores están en verde;
- no hay datos Coach en payload Cliente;
- no hay accesos cruzados;
- los dispositivos físicos son utilizables;
- el rollback está ensayado;
- existe aprobación humana expresa.

La sustitución de `app.iberfit.cl` o `coach.iberfit.cl` será una operación separada, con ventana, monitorización y posibilidad inmediata de retorno.
