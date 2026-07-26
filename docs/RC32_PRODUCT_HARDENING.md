# IBERFIT M26 Canary RC32 · Product hardening

## Alcance

RC32 corrige incoherencias visibles detectadas en RC31 sin modificar producción ni el contrato backend RC30.

## Cambios de producto

- Las propuestas de agenda se separan de las citas confirmadas.
- Hoy ya no usa una propuesta privada para afirmar que la agenda está confirmada.
- El estado superior distingue operaciones de sincronización de estados de agenda.
- El IRI se presenta por dominios y completitud, sin una puntuación global automática.
- El contexto normativo conserva sexo para baremos, edad, fecha y versión del motor.
- El expediente incorpora contacto, modalidad y logística de entrenamiento desde un perfil canónico.
- Presencial e híbrido requieren dirección habitual; online no la exige.
- La agenda puede heredar la dirección habitual sin reemplazar una ubicación escrita manualmente.
- La biblioteca visual RepDB se incluye en el candidato desplegable y se verifica por manifiesto y hash.
- El candidato publica únicamente el mapa canónico y las imágenes WebP necesarias; los datasets fuente, mapas de auditoría y CSS histórico permanecen fuera del runtime.
- Samsung Health y Strava aparecen como integraciones preparadas, pero no como conectadas sin puente nativo u OAuth seguro.
- Se añaden protecciones CSS contra solapamiento, desbordamiento y textos largos.

## Privacidad

Los campos de contacto y logística se proyectan solo dentro del expediente autorizado. Las notas privadas continúan excluidas de la proyección Cliente. No se incorporan tokens ni credenciales de wearables al frontend.

## Gates

RC32 exige:

1. suite completa sin fallos;
2. gate de infraestructura heredado;
3. gate de coherencia y seguridad RC32;
4. build con mapa e imágenes RepDB, sin artefactos fuente innecesarios;
5. grafo de módulos completo;
6. runtime QA fail-closed en el repositorio;
7. candidato RC32 con hashes, presupuesto separado de código y medios, y service worker propio.

## Pendiente antes de GO

- gate remoto autenticado en la rama RC32;
- QA HTTP del dominio desplegado, incluidos MIME reales de JSON y WebP;
- QA visual y de interacción en móvil físico;
- ciclo PWA de actualización RC31 → RC32;
- conexión Health Connect mediante aplicación Android;
- OAuth Strava mediante backend seguro y credenciales registradas.
