# IBERFIT Free QA — restaurar capacidad Auth sin borrar datos

Revisión: 23-11-2026. **Solo QA** (`gjztkdwfmunnzhtvxrsu`).

## Motivo
Antes del reseteo había 116.866 sesiones de Auth de **tres cuentas sintéticas**. La cuenta real PROD queda fuera. En Free, las sesiones no tienen tiempo máximo configurable (la limitación de sesión es de Pro); el cierre local de cada suite previene fugas de renovación, pero no garantiza por sí mismo limpiar 116 mil sesiones heredadas.

## Acción
Un workflow protegido, cuyo único efecto es `POST /auth/v1/logout?scope=global` en las tres cuentas sintéticas después de probar el inicio de sesión de las tres. Ni borra usuarios, ni informes, ni tablas, ni contraseñas, ni MFA, ni Storage. La ejecución se serializa con todos los jobs que usan `iberfit-qa-shared-auth-readonly`. Solo admite el SHA Canary actual, la rama exacta, el origen QA y las tres direcciones sintéticas. Si hay otros workflows GitHub activos o la rama avanzó, salta sin modificar Auth. La acción global puede impedir el refresh de sesiones antiguas de QA (deseado); no revoca JWT hasta su expiración.

## Prueba de aceptación posterior (read-only)
1. Consultar recuentos `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_amr_claims` y tamaño físico QA, antes y después; distinguir registros eliminados de espacio físico recuperado.
2. Certificar que los tres fixtures pueden iniciar sesión de nuevo; el workflow prueba esto sin bypass WebAuthn.
3. Volver a ejecutar las pruebas Coach→Cliente y aislamiento con sus propios mutex, sin tocar PROD.
4. Si no reduce el tamaño físico, **no ejecutar VACUUM FULL** durante pruebas; revisar autovacuum, bloat y recuperación antes de intervención.
5. Si el reset se salta, comprobar primero el estado de Actions y volver a ejecutar el mismo job desde GitHub Actions, sin generar nuevas PR ni cambios.

## Prohibiciones
No hacer DELETE en auth.* ni storage.objects, no resetear cuentas reales, no filtrar tokens, no tocar proyecto PRODUCTIVO, no confundir revocación de refresco con borrado físico y no relajar MFA/RLS.
