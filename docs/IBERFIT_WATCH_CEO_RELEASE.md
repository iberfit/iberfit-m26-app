# IBERFIT Watch · Edición CEO

## Estado

Contrato definitivo de producto para el reloj personal del CEO de IBERFIT.

No es merchandising, no es una esfera genérica y no es una línea destinada actualmente a clientes. Es una interfaz privada de IBERFIT OS en la muñeca de Carlos.

## Objetivo

Reducir la necesidad de sacar el teléfono y presentar IBERFIT de forma coherente en cuatro contextos reales:

1. **CLÁSICO** — representación de marca y uso diario elegante.
2. **CONTROL** — dirección de la jornada IBERFIT.
3. **SESIÓN** — herramienta operativa mientras se entrena a un cliente.
4. **ENTRENO** — rendimiento personal del CEO.

La regla de producto es: **si un dato no cambia una decisión en 1–2 segundos, no ocupa la esfera**.

## Identidad

- Isotipo: únicamente el isotipo oficial IBERFIT del repositorio. No se permiten reinterpretaciones ni marcas generadas.
- Idioma visible: castellano.
- Fondo principal: `#06110D`.
- Verde: `#436A52`.
- Verde tenue: `#243F33`.
- Dorado: `#FBDD8B`.
- Crema: `#F2E8D3`.
- Uso del dorado: acento, no superficie dominante.
- Iconografía: mínima. Se priorizan números, tipografía, líneas y geometría.

## Arquitectura de lanzamiento

### Paquete de esfera

- Formato: Watch Face Format.
- Objetivo de hardware inicial: Galaxy Watch9 44 mm / SM-L350.
- Objetivo visual: 480 × 480 físicos, con espacio lógico WFF y assets maestros 4096 × 4096.
- Una sola esfera de producto: **IBERFIT · CEO**.
- Los cuatro modos se exponen mediante configuración de lista y sabores/presets.
- Cada modo activa únicamente los elementos y complicaciones que corresponden a su contexto.
- El AOD se diseña de forma específica por modo.

### App Wear OS privada

La lógica de aplicación se distribuye separada del paquete WFF. Es la responsable de:

- sincronización operativa con M26;
- Health Services en tiempo real;
- puente con Samsung Health/Health Connect cuando corresponda;
- estado de sesión;
- cronómetro y descanso;
- fuentes de datos de complicaciones IBERFIT;
- acciones de toque de las complicaciones;
- almacenamiento local mínimo y seguro;
- modo offline con último estado operativo no sensible.

La esfera no implementa lógica empresarial ni acceso directo al backend.

## Privacidad de muñeca

La esfera es una superficie pública por naturaleza. Por tanto, queda prohibido mostrar:

- nombre completo del cliente;
- iniciales del cliente;
- teléfono;
- email;
- RUT/DNI;
- dirección;
- diagnóstico;
- notas clínicas;
- pagos o importes;
- cualquier dato que identifique innecesariamente a una persona.

La esfera puede mostrar contexto operativo no identificable: hora de próxima sesión, número de sesiones, pendientes, ejercicio actual, serie y descanso.

## Modo CLÁSICO

### Propósito

Ser un reloj IBERFIT antes que un smartwatch deportivo.

### Diseño

- analógico;
- isotipo oficial a las 12;
- dial verde-negro;
- índices finos dorados;
- agujas crema/dorado;
- segundero fino con detalle verde;
- fecha discreta;
- batería integrada visualmente en el dial;
- sin FC, pasos, kcal ni agenda.

### AOD

- agujas;
- índices cardinales;
- isotipo;
- fecha solo si mantiene el presupuesto de píxeles.

## Modo CONTROL

### Propósito

Responder de un vistazo: qué viene ahora y qué requiere atención.

### Datos

- hora;
- próxima sesión;
- sesiones de hoy;
- seguimientos pendientes;
- IRI pendientes;
- batería;
- estado `AL DÍA` o `PENDIENTES`.

No muestra identidad del cliente.

## Modo SESIÓN

### Propósito

Reducir el uso del teléfono durante una sesión presencial.

### Datos

- tiempo transcurrido;
- ejercicio actual;
- serie actual / total;
- descanso;
- siguiente ejercicio;
- hora de próxima sesión;
- batería.

### Acciones previstas

- iniciar/pausar/reanudar descanso;
- avanzar serie;
- marcar ejercicio completado;
- abrir ejecución completa en IBERFIT cuando sea necesario.

Las escrituras deben usar los contratos y controles de concurrencia de M26. La esfera no escribe directamente en Supabase.

## Modo ENTRENO

### Propósito

Entrenamiento personal de Carlos.

### Prioridad

1. duración;
2. frecuencia cardíaca;
3. zona;
4. FC media / máxima;
5. energía activa;
6. batería.

Los pasos no forman parte de la jerarquía principal durante una sesión.

### Fuente de telemetría

Se reutiliza `wear_os_health_services` y el pipeline de telemetría canónica existente en M26. No se crea una segunda representación de FC/RR.

## Complicaciones privadas IBERFIT

La app Wear OS deberá exponer, como mínimo:

- `IBERFIT · Próxima sesión`;
- `IBERFIT · Sesiones hoy`;
- `IBERFIT · Pendientes`;
- `IBERFIT · Estado de sesión`;
- `IBERFIT · Descanso`;
- `IBERFIT · Entreno personal`.

La esfera decide la representación visual. Las fuentes solo entregan datos.

## Offline

- CLÁSICO siempre funcional.
- ENTRENO puede operar con Health Services local sin depender de red para mostrar telemetría básica.
- CONTROL muestra el último estado sincronizado con indicador de frescura si la conexión no está disponible.
- SESIÓN conserva únicamente el estado local mínimo necesario para continuar una ejecución ya iniciada y reconciliar posteriormente mediante los contratos de M26.

## Seguridad

- fail closed ante datos inválidos;
- sin tokens en recursos WFF;
- sin claves dentro del APK de esfera;
- secretos y credenciales fuera de recursos versionados;
- el paquete WFF no contiene código ejecutable;
- la app nativa mantiene el mínimo de datos y permisos necesario;
- toda presentación visible pasa por la política de privacidad de muñeca.

## Gate de lanzamiento

No se considera listo hasta que:

- isotipo oficial verificado;
- cuatro modos presentes;
- toda la UI visible en castellano;
- pruebas automáticas de no filtración de PII;
- AOD validado;
- funcionamiento real en SM-L350;
- compilación reproducible con JDK fijado;
- conexión y reconexión ADB probadas;
- consumo y legibilidad comprobados en uso real;
- tests M26 existentes verdes;
- telemetría no duplica contratos existentes;
- no hay escritura directa a backend desde la esfera;
- build release firmado y reproducible.
