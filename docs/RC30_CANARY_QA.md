# IBERFIT M26 RC30 · QA canary

RC30 es una capa canary sobre la base funcional RC29. Solo puede validarse en `https://m26-canary.iberfit.cl`, con el proyecto Supabase canónico `pjhmrhejsoofmouedavw`, cuentas QA existentes y una clave pública publicable. No autoriza cambios en producción, altas o bajas de usuarios, uso de `service_role`, despliegues manuales ni escrituras de prueba fuera del Command Bus previsto.

## Cambios locales de RC30

- Recuperación de contraseña desde el acceso, con respuesta genérica que no confirma si el correo existe.
- Redirección de recuperación fijada al origen canary y bloqueo local de direcciones no QA.
- Limpieza del fragmento de autenticación mediante `history.replaceState` antes de conservar el token temporal en memoria.
- Descarte completo del `refresh_token` del flujo de recuperación y validación de caducidad del enlace.
- Consulta de identidad con `GET /auth/v1/user` antes de cualquier `PUT`, de modo que una identidad no QA nunca llega a modificar su contraseña.
- Revocación con logout después de actualizar, al abandonar el flujo y al destruir la aplicación.
- Estados accesibles para error, carga y éxito; navegación de vuelta al acceso y controles táctiles de al menos 44 px.
- Configuraciones `qaOnly` habilitadas exclusivamente en canary (localhost se conserva solo para pruebas locales).
- Evidencia remota con huellas irreversibles de identificadores, sin correos, contraseñas, JWT ni identificadores crudos en el informe.

La IA mantiene su papel de propuesta revisable: el entrenador conserva siempre la decisión y la publicación explícita.

## Validación local reproducible

El flujo de RC29 estaba incompleto porque `verify:rc29` solo verifica manifiestos ya creados. El orden correcto es:

1. `npm run validate:rc29`
2. `npm run metadata:rc29`
3. `npm run verify:rc29`

`npm run seal:rc29` agrupa los pasos 2 y 3. No debe ejecutarse sobre RC30 para fingir que la interfaz sigue siendo idéntica a RC28; RC30 cambia de forma intencional la pantalla de acceso.

RC30 tiene un flujo independiente y trazable:

1. `npm run test:m26:rc30`
2. `npm test`
3. `npm run audit:rc30`
4. `npm run build:rc30:canary`
5. `npm run verify:build:rc30`
6. `npm run metadata:rc30`
7. `npm run verify:rc30`

`npm run validate:rc30:canary` ejecuta la secuencia automatizada. Requiere `M26_SUPABASE_URL`, `M26_SUPABASE_PUBLISHABLE_KEY` y `M26_QA_ONLY=true`. Para comprobar localmente el build sin crear un artefacto desplegable puede usarse una clave publicable sintética junto con `M26_RUNTIME_VALIDATION_ONLY=true`; el `version.json` resultante queda marcado `deployable: false`.

Los manifiestos RC30 se generan únicamente con scripts. El manifiesto del repositorio usa archivos versionados o no ignorados por Git, por lo que excluye `.env`, secretos y salidas locales ignoradas. No se deben editar sus hashes a mano.

## Clasificación de la línea base recibida

- Dos fallos eran específicos de Windows: convertir una URL `file:` a `.pathname` producía una ruta `C:\C:\...`. El cargador y los tests usan ahora el objeto URL de forma portable.
- El test de CI daba un falso positivo por la palabra inglesa “deployment” en un comentario; el workflow no contiene comandos de despliegue y el comentario operativo se eliminó.
- El manifiesto RC15 importado no coincide con su `_headers` histórico. Esa evidencia no se regenera ni se corrige manualmente: la prueba queda explícitamente omitida como obsoleta y RC30 verifica su propio artefacto y sus propios manifiestos.

## Checklist manual obligatorio en canary

Usar solo las cuentas QA ya existentes. No copiar enlaces, tokens ni contraseñas a tickets, capturas, logs o documentos.

### Recuperación de contraseña

- [ ] Abrir el acceso canary en una ventana privada y activar “Olvidé mi contraseña” solo con una cuenta QA autorizada.
- [ ] Confirmar que un correo QA y uno no autorizado reciben exactamente el mismo mensaje visible.
- [ ] Confirmar que un fallo de red muestra un mensaje humano y permite reintentar una sola vez.
- [ ] Abrir el correo QA y comprobar que el enlace apunta únicamente a `m26-canary.iberfit.cl`.
- [ ] Verificar visualmente que la barra de direcciones pierde el fragmento con tokens antes de aparecer el formulario.
- [ ] Probar enlace caducado, reutilizado, incompleto y manipulado; todos deben terminar en el mismo estado seguro sin mensajes técnicos.
- [ ] Probar contraseñas distintas, menos de 8 caracteres y doble pulsación; no debe existir ningún `PUT` hasta superar validación e identidad QA.
- [ ] Actualizar una contraseña QA de prueba y comprobar logout, vuelta al acceso e inicio posterior con la contraseña nueva.
- [ ] Abandonar el formulario mediante “Volver al acceso” y comprobar que el token temporal deja de ser utilizable.

### Roles, RLS y privacidad

- [ ] Iniciar sesión como Coach QA y como Cliente A y Cliente B QA, todos distintos.
- [ ] Confirmar que Cliente A nunca ve IDs, perfil, sesiones, citas, check-ins, hábitos o actividad de Cliente B, y viceversa.
- [ ] Confirmar que Cliente no puede abrir rutas Coach manipulando URL, DOM o estado local.
- [ ] Confirmar que notas privadas, propuestas internas de IA, disponibilidad Coach y eventos internos son invisibles para ambos Clientes.
- [ ] Confirmar que borradores, contenidos aprobados pero no publicados y `visibleToClient=false` no aparecen al Cliente.
- [ ] Inspeccionar RLS efectivo: todas las tablas alcanzadas por bootstrap tienen RLS, no hay políticas permisivas para `anon/public` y los helpers derivan identidad desde `auth.uid()`.
- [ ] Ejecutar el gate autenticado de solo lectura y conservar únicamente la evidencia RC30 sanitizada; debe informar dos clientId QA distintos y cero cruces.

### Funcionamiento y resiliencia

- [ ] Completar check-in, hábito y una sesión guiada con operación única; repetir clics no debe duplicar escrituras.
- [ ] Confirmar que la IA solo crea una propuesta editable y que publicar exige decisión expresa del Coach.
- [ ] Probar pérdida de red, reconexión, reintento, conflicto y rechazo; nada pendiente debe presentarse como confirmado.
- [ ] Confirmar que el service worker no cachea autenticación, RPC, REST ni runtime config y que una actualización elimina cachés M26 anteriores.
- [ ] Verificar estados vacíos, carga, error, offline y reconexión en todas las rutas principales.
- [ ] Confirmar que no aparecen fixtures, datos demo ni contenido de otro entorno.

### Accesibilidad, diseño y rendimiento

- [ ] Recorrer acceso, recuperación y aplicación solo con teclado; el foco debe ser visible y el orden lógico.
- [ ] Probar lector de pantalla: títulos asociados, errores anunciados, estados de carga y etiquetas de formularios.
- [ ] Revisar 320, 375, 768, 1024 y 1440 px sin scroll horizontal, solapamientos ni controles menores de 44 px.
- [ ] Probar preferencias de movimiento reducido y contraste alto.
- [ ] Revisar castellano de España, tildes y ausencia de códigos técnicos o mojibake.
- [ ] Confirmar `budgetOk=true`, hashes RC30 válidos, cero errores de consola y tiempos de interacción aceptables en móvil real.

## Criterio de salida

La validación local puede recomendar “listo para subir a canary”, pero no existe GO final mientras falten las pruebas autenticadas remotas de RLS/aislamiento, el correo real de recuperación QA y la revisión manual en dispositivos. Cualquier push a `canary/rc30` activa Cloudflare Pages y requiere aprobación explícita previa. Producción permanece fuera de alcance.
