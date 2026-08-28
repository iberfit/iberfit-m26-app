# RC65-A · Wearable owner isolation

Base cerrada: `7a4c58893223b3b2d85ba8ce754c300e499bdca3`

## Riesgo demostrado

La cola IndexedDB `wearable_sync_v44` utilizaba claves basadas en
`clientId + provider + date`, sin `ownerId`. En un navegador compartido,
una sesión posterior podía enumerar registros pendientes de otra cuenta.
RLS seguía siendo la defensa servidor, pero el aislamiento local no era
suficiente.

## Cambio mínimo

- La cola nueva queda sellada por `ownerId` autenticado.
- `application.js` pasa `session.user.id` al controlador wearable.
- El controlador lo propaga al sincronizador.
- Cada registro guarda además su `ownerId`.
- `pendingCount`, `flush`, `revoke` y `deleteAll` sólo operan sobre
  el prefijo del owner actual.
- Se añade `clearOwner()` para el futuro flujo explícito
  "cerrar sesión y borrar este dispositivo".

## Legacy

El prefijo histórico sin owner NO se adopta y NO se elimina en RC65-A.
No existe evidencia suficiente para atribuir esos registros a un usuario.
Queda ignorado y preservado hasta una migración/limpieza separada con
evidencia.

## Pruebas

El test RC65-A demuestra:

1. A y B comparten almacenamiento físico pero no cola lógica.
2. B no intenta sincronizar la cola de A.
3. El legacy no atribuible no se adopta ni se destruye.
4. `clearOwner()` sólo borra al owner actual.
5. Una sesión posterior del mismo owner recupera y sincroniza su cola.
6. Crear un sincronizador sin owner falla cerrado.
7. Los fixtures históricos RC44/RC64 pasan un owner sintético explícito sin introducir fallback de producción.
