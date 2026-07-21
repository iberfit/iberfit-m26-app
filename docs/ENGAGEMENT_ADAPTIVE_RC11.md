# IBERFIT M26 RC11 · Engagement y sesiones adaptativas

## Estado

RC11 es acumulativo sobre RC10 y permanece **no desplegable**. No se modificó producción ni se aplicó ninguna migración.

## Contrato dinámico seguro

El registro canónico base conserva exactamente 44 comandos. Los ocho comandos de engagement forman una extensión separada. Solo se activan en tiempo de ejecución cuando una lectura autenticada devuelve las 52 definiciones con tipo, entidad, evento, roles y requisitos exactamente coincidentes.

La interfaz usa `client`, mientras que el registro de comandos utiliza `cliente`. RC11 normaliza esa diferencia sin ampliar privilegios. Un comando de check-in, hábito o nota privada no puede atravesar el Command Bus si la extensión remota está ausente o presenta una discrepancia.

## Engagement

- Check-ins y registros de hábitos pueden quedar pendientes offline, siempre separados por usuario y sin mostrarse como confirmados.
- Definir o archivar hábitos requiere Coach/Admin.
- Las notas privadas requieren Coach/Admin, conexión activa y ACK remoto.
- Las notas privadas no se guardan en la cola offline y nunca se exponen en navegación Cliente.
- Todos los comandos usan payload `patch`, revisión, entidad y clientId canónicos.

## IA de sesiones

La propuesta utiliza datos confirmados de los últimos 28 días: adherencia, RPE, volumen, check-in reciente y carga histórica.

- Dolor alto informado bloquea la generación automática y exige revisión del Coach.
- Recuperación limitada reduce series, RPE y complejidad; evita circuitos.
- Adherencia baja simplifica la sesión para reducir barreras.
- Una progresión estable solo genera un rango sugerido. Nunca aumenta cargas automáticamente.
- La IA mantiene alternativas del catálogo y aprobación obligatoria del Coach.

## Backend

Se incluyen contrato de 52 comandos, preflight de solo lectura, candidata de migración con guardas y plan de rollback. La candidata se revierte deliberadamente mientras no exista captura autenticada del esquema de transiciones, RPC y bootstrap. Esto evita instalar una extensión incompleta o exponer notas privadas por una RLS incorrecta.

## Bloqueos

1. Lectura autenticada del catálogo instalado.
2. Captura exacta de esquema de transiciones y funciones RPC.
3. Generación y revisión de la migración final.
4. Aplicación en rama/staging QA, nunca directamente en producción.
5. QA autenticado y visual por rol.
