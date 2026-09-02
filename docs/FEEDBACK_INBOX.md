# IBERFIT · Feedback Inbox

## Uso

Entrada única para dudas, fricciones, bugs e ideas surgidas al usar IBERFIT. El propietario no rellena plantillas: ChatGPT/Codex transforma su comentario natural en una entrada mínima cuando merece seguimiento.

No guardar aquí datos personales, nombres reales de clientes, emails, teléfonos, contenido sensible ni credenciales.

## Estados

`NEW -> TRIAGED -> INVESTIGATING -> READY -> IN PROGRESS -> QA -> CANARY CERTIFIED -> LIVE/MEASURING -> DONE`

También: `BLOCKED`, `DUPLICATE`, `NOT A BUG`, `REJECTED`.

## Campos mínimos por entrada

```text
ID:
Fecha:
Estado:
Tipo: LIVE BUG | PRODUCT | UX/UI | DATA/SECURITY | PERFORMANCE | GROWTH
Superficie: Cliente | Coach | Admin | Backend | Web | Infra
Entorno observado: LIVE | Canary | desconocido
Descripción normalizada:
Evidencia no sensible:
Impacto:
Prioridad: P0 | P1 | P2 | P3
¿Canary ya lo resuelve?: sí | no | parcial | pendiente
Carril: LIVE SUPPORT | PRODUCT EVOLUTION | WEBSITE | GROWTH
Criterio de cierre:
Siguiente acción:
Referencia GitHub/PR si existe:
```

## Bandeja activa

### FB-001 · Entrada nativa y credenciales cómodas

- Fecha: 2026-09-02
- Estado: QA
- Tipo: UX/UI | PRODUCT
- Superficie: Cliente | Coach | Admin
- Entorno observado: LIVE (`app.iberfit.cl`)
- Descripción normalizada: la pantalla de acceso se percibe como una tarjeta/pegotón sobre otro fondo; el isotipo aparece descentrado y existe un control/cuadrado vacío. Se solicita una superficie visual continua a pantalla completa en desktop/tablet/móvil, control Mostrar/Ocultar contraseña y opción Recordar correo.
- Evidencia no sensible: captura del acceso LIVE compartida por el propietario.
- Impacto: primera impresión de marca, ergonomía recurrente de acceso y coherencia PWA/native.
- Prioridad: P1 de experiencia de producto (sin incidencia de seguridad).
- ¿Canary ya lo resuelve?: no; candidato preparado desde Canary certificado.
- Carril: PRODUCT EVOLUTION
- Criterio de cierre: layout full-screen continuo y responsive; isotipo real centrado; sin cuadrado huérfano; toggle de contraseña accesible; recordatorio opt-in sólo del correo; auth/WebAuthn/roles intactos; CI + auditoría + validación visual Canary verdes.
- Siguiente acción: completar CI del candidato y validar visualmente en Canary antes de considerar integración.
- Referencia GitHub/PR: PR #42 `feat(auth): login nativo responsive + recordar correo`.

## Reglas de triage

- una duda de uso no es automáticamente un bug;
- comparar LIVE con Canary antes de volver a implementar algo;
- si afecta seguridad/datos/roles, escalar prioridad y detener experimentación;
- si es una mejora estética, exigir beneficio de claridad/confianza/usabilidad;
- si es Growth, conectar con una métrica del funnel;
- si se resuelve en conversación sin cambio ni seguimiento, no ensuciar el inbox;
- cerrar duplicados apuntando a la entrada canónica.

## Limpieza

Semanalmente:

- eliminar sólo entradas que nunca necesitaron seguimiento, conservando decisiones relevantes en `DECISIONS.md`;
- mover prioridades reales a `BACKLOG.md`;
- no duplicar el mismo problema en tres documentos;
- mantener aquí el contexto mínimo de observaciones del propietario.
