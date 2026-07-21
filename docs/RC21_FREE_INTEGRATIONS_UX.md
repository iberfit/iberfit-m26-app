# IBERFIT M26 · RC21 · Integraciones gratuitas y experiencia resiliente

## Regla económica

RC21 aplica una política de coste cero: ninguna integración que exija licencia, membresía de distribución, programa comercial o coste no confirmado puede activarse. La arquitectura se conserva para no cerrar opciones futuras, pero la interfaz no ofrece botones de conexión falsos.

### Disponible ahora

- Archivo normalizado IBERFIT JSON/CSV: análisis local en navegador, sin cuentas externas, sin envío automático y sin persistencia de datos crudos.

### Desarrollo gratuito preparado

- Android Health Connect: contrato de puente nativo, permisos mínimos y máquina de estados. No se presenta como conexión real hasta disponer de una aplicación Android y dispositivo de prueba.
- Google Health API para Fitbit y Pixel Watch: adaptador conceptual sobre el proveedor histórico `fitbit`; permanece sin activar hasta completar OAuth restringido y revisión externa.

### Bloqueado por la regla de coste cero

- Apple Health: se preserva el contrato, pero no se activa para distribución mientras requiera membresía de pago.
- Garmin Connect: no se activa mientras requiera acceso de socio o licencia comercial.
- Oura: permanece en espera hasta confirmar por escrito una vía gratuita adecuada para el producto.

## UX y seguridad

- Estados explícitos: no disponible, disponible, autorizando, conectado, sincronizando, pausado, revocado y error.
- Transiciones imposibles se bloquean.
- Proveedores bloqueados no pueden aparecer como conectados aunque llegue un estado heredado incorrecto.
- La importación cede el hilo principal, admite cancelación, bloquea doble envío y devuelve el foco a la vista previa.
- Los errores visibles se traducen a mensajes seguros sin exponer detalles internos.
- El Coach mantiene acceso de solo lectura a resúmenes confirmados.
- Los datos ausentes permanecen como ausentes; no se convierten en cero.
- Ningún dato wearable produce diagnóstico ni publica cambios de carga sin revisión del Coach.

## Estado de lanzamiento

Validación exclusivamente local. No se han creado credenciales, cuentas, aplicaciones móviles, migraciones remotas ni despliegues. Las integraciones nativas y OAuth continúan como gates externos.
