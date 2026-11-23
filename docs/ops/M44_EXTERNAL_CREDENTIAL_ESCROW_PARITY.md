# IBERFIT M44 · Prueba de continuidad de secretos externos (sin valor expuesto)

## Alcance y estado

Este control **no** aprueba el corte M1/U72/U60. Integra en el job ya existente
\`m44-live-runtime-presence.yml\` una comparación de **digests** contra la
configuración Edge efectivamente desplegada en Supabase PROD
\`pjhmrhejsoofmouedavw\`. Solo acepta el contexto de integración Canary
protegida. No altera SQL, configuración Supabase, Edge, Auth, usuarios ni
proyectos Free.

El endpoint \`GET /v1/projects/{ref}/secrets\` puede incluir un campo \`value\`
que, para secretos administrados, es un **SHA-256 del valor**, no el texto
original recuperable. La presencia de ese nombre o digest **no permite**
reconstruir un proveedor en otra instalación.

Para evitar falso positivo, la prueba coteja el hash de una posible copia
custodiada **independientemente** como secreto de entorno protegido en GitHub,
sin leer ni emitir los valores en logs, artifacts, pull requests o evidencias
públicas. Si falta un candidato, su digest no coincide, cambia el formato del
Management API o no hay soporte de SHA-256, el resultado es NO-GO; la prueba
de inventario de Edge sigue funcionando por separado.

## Fuentes independientes soportadas

Las seis variables opcionales del entorno \`m26-canary-readonly\` son:

| Copia en GitHub Actions | Comprobación |
| --- | --- |
| \`IBERFIT_M44_RECOVERY_GEMINI_API_KEY\` | Digest de \`GEMINI_API_KEY\` |
| \`IBERFIT_M44_RECOVERY_GOOGLE_API_KEY\` | Digest de \`GOOGLE_API_KEY\` |
| \`IBERFIT_M44_RECOVERY_WEB_PUSH_VAPID_PRIVATE_KEY\` | Digest de clave VAPID privada |
| \`IBERFIT_M44_RECOVERY_WEB_PUSH_VAPID_PUBLIC_KEY\` | Digest de clave VAPID pública |
| \`IBERFIT_M44_RECOVERY_WEB_PUSH_VAPID_SUBJECT\` | Digest de sujeto VAPID |
| \`IBERFIT_M44_RECOVERY_SMTP_PASSWORD\` | Solo evidencia de *presencia*, sin digest verificable |

**No se crean, escriben ni solicitan valores** en esta PR. La copia debe venir
de una custodia legítima del operador; nunca inferirse del SHA-256 o de un
modelo. No introducir valores en conversaciones, archivos del repositorio,
variables del frontend, logs o PR. Un duplicado en GitHub Actions es otra
superficie de riesgo y requiere política de accesos/revisiones; si no existe
una copia segura independiente, la salida apropiada es NO-GO.

Si hay dos credenciales IA activas, deben coincidir las dos para certificar
paridad completa. El proveedor primario \`GEMINI_API_KEY\` tiene preferencia,
por lo que no basta el fallback si la primaria sigue configurada.

Para Web Push, rotar la clave VAPID no permite reutilizar sin más las
suscripciones previas; se necesita prueba o reinscripción explícita.
Para SMTP, conocer una contraseña candidata no demuestra que sea la vigente,
que las redirecciones de Auth sigan funcionando o que los mensajes se entreguen.

## Evidencias que produce

Una única salida de contadores/indicadores, sin hashes ni nombres de
destinatarios:

- Número de variables externas configuradas y digests soportados.
- Número de candidatos protegidos que coinciden exactamente.
- Coincidencia del proveedor IA primario y de las tres variables VAPID.
- Presencia de candidato SMTP **sin afirmar coincidencia**.
- \`fullPlatformRecoveryCertified=false\` y
  \`productionActivationAuthorized=false\` **siempre**.

Además quedan pendientes: custodia y prueba de reconstitución desde origen
independiente, Auth alojado/JWT reemitidos en proyecto aislado, MFA/WebAuthn
según el inventario real, SMTP funcional y recepción sin destinatarios reales,
Edge con nueva identidad y claves del proyecto destino, garantías de Vault,
Storage, RLS, RPO/RTO y pruebas de roles Cliente/Coach/Admin.

## Integración y coste

Se utiliza el mismo GET de \`/secrets\` que ya ejecuta la comprobación M44.
No añade consultas PostgreSQL, no hace polling, no crea proyectos Supabase y no
lanza ni consume tráfico de IA/Push/SMTP. Se ejecuta solo en un **push de
Canary** que cambie la fuente, los tests o el workflow de M44; nunca desde
código arbitrario de pull requests.

Ejecución de unit tests:
\`node --test tests/m44_external_escrow_digest_parity.test.mjs tests/m44_live_runtime_secret_presence.test.mjs\`

Documentación:
- https://supabase.com/docs/reference/api/v1-list-all-secrets
- https://registry.terraform.io/providers/supabase/supabase/latest/docs/resources/edge_function_secrets
