# RC28 · Checklist de privacidad por rol

## Cliente

- [ ] El payload de bootstrap contiene un solo `clientId` autorizado.
- [ ] No contiene notas privadas, disponibilidad Coach, Inteligencia interna ni auditoría.
- [ ] No contiene borradores, aprobaciones internas ni publicaciones retiradas.
- [ ] Identidad sin metadatos internos, tokens, claves o credenciales.
- [ ] Registro de comandos limitado a roles Cliente.
- [ ] Métricas sin datos internos o secretos anidados.
- [ ] Revisiones remotas vinculadas por segmento exacto al cliente propio.
- [ ] Petición directa con otro `clientId` denegada por servidor.
- [ ] Comando Coach denegado por servidor.

## Coach

- [ ] Solo recibe la cartera autorizada.
- [ ] La selección de expediente no amplía permisos.
- [ ] Las notas privadas nunca se incorporan a vistas Cliente.
- [ ] Aprobar no publica.
- [ ] Publicar exige vista previa aceptada.
- [ ] Retirar exige motivo.
- [ ] Las operaciones pendientes no aparecen confirmadas.

## Cierre y cambio de identidad

- [ ] Al cerrar sesión se borra identidad, colecciones, operaciones, conflictos y último ACK.
- [ ] Al cambiar de cuenta no se conserva ruta ni expediente previo.
- [ ] IndexedDB/local storage quedan aislados por propietario.
- [ ] No quedan marcadores privados en memoria accesible.

## Evidencia obligatoria en canario

- [ ] Captura de red del bootstrap Cliente.
- [ ] Resultado de intento de acceso cruzado.
- [ ] Resultado de intento de comando no autorizado.
- [ ] Captura de RLS/políticas efectivas.
- [ ] Captura posterior al cierre de sesión.
