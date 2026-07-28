# IBERFIT M26 Canary RC35 · Cierre de auditoría Coach QA 1

## Origen protegido

RC35 parte del estado real exportado desde `canary/rc34`, commit base `7691b9a85ec6de374834e9c8da48cf0e01163530`, con las 402 aprobaciones visuales de RepDB y su prueba ya confirmadas en el commit base. La reparación se preparó en una copia aislada. No modifica `main`, los dominios de producción ni Cloudflare durante la validación local.

## Defectos de bloqueo corregidos

- El IRI solo anuncia confirmación cuando la entidad reaparece tras la rehidratación remota.
- Planificación solo anuncia éxito cuando el ciclo persiste y vuelve a ser visible.
- Las sesiones guardan el borrador antes de salir y ofrecen guardado explícito.
- Las notas privadas verifican persistencia antes de confirmar el guardado.
- Agenda limpia errores al editar y evita el bloqueo silencioso del formulario.
- Los informes IRI son autocontenidos, conservan estilos y tienen alternativa cuando el navegador bloquea ventanas emergentes.
- El temporizador Cardio incorpora avisos sonoros de inicio, cuenta atrás y final.
- Las pruebas marcadas como no realizadas desactivan sus mediciones y exigen motivo.
- Se retira el resultado global histórico `80 / Performance` de cálculo, cronología y proyección Cliente.

## Coherencia y experiencia

- Un único desplazamiento documental sustituye los scrolls anidados principales.
- Hoy presenta prioridades y una acción operativa real.
- Clientes incorpora filtros, orden, estado normalizado del IRI y acceso explícito al expediente.
- Expediente enumera los campos esenciales pendientes y ofrece una ruta directa para completarlos.
- IRI identifica previamente los campos obligatorios y enfoca el primer error.
- Movilidad, Fuerza y Cardio incorporan protocolos, unidades y criterios de suspensión.
- Biblioteca prioriza coincidencias directas, ofrece filtros y explica la ausencia de imagen sin inventar contenido.
- Actividad prioriza bienestar y hábitos; las integraciones quedan como módulo opcional, plegado y sin lenguaje técnico.
- Progreso muestra adherencia y bienestar de forma visual sin inventar tendencias ni puntuaciones.
- Inteligencia acepta una pregunta deliberada del entrenador y mantiene la aprobación humana obligatoria.

## Límites honestos

El mapa canónico conserva 367 ejercicios. No todos disponen de imagen aprobada: la interfaz muestra una ausencia explícita y el protocolo escrito en lugar de fingir una referencia visual.

## Gates pendientes antes de usar clientes reales

1. Aplicar el paquete transaccional en una rama nueva `canary/rc35`, con copia de seguridad y rollback.
2. Ejecutar suite completa, gate RC35, build, verificación del candidato y CI de GitHub.
3. Ejecutar gate remoto autenticado de solo lectura y confirmar aislamiento Coach / Cliente QA 1 / Cliente QA 2.
4. Desplegar exclusivamente `m26-canary.iberfit.cl` y verificar versión, release, rama, commit, service worker, JSON RepDB y WebP reales.
5. Completar el barrido del Cliente QA 2 y de la aplicación Cliente en escritorio y móvil.
6. Solo después autorizar el uso con una clienta externa real.
