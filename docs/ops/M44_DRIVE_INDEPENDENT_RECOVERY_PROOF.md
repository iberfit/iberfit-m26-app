# M44 — Recuperación independiente desde Google Drive

## Alcance demostrado

Workflow canónico: .github/workflows/m44-encrypted-disaster-recovery.yml.

El run 38833678711 superó exportación, cifrado, descifrado, restauración local PostgreSQL y comprobación de 126 objetos de Storage. El archivo guardado en Drive se verificó contra el SHA-256 del artefacto de GitHub: e60d46bc0973836449d3e3e6ee16be74a7923b18642fca27689414394fbc1f7a.

El verificador scripts/ops/m44_offsite_archive_guard.py comprueba procedencia y estructura de los bytes recuperados de Drive. Su modo unwrap exige el hash esperado y únicamente un fichero iberfit-prod-recovery.ibf, con cabecera IBFBAK01 y límites de tamaño. Su modo unpack rechaza rutas peligrosas, archivos inesperados, enlaces y duplicaciones tras el descifrado.

La comprobación ZIP/SHA no acredita descifrado por una clave recuperada externamente. La única prueba de autenticidad criptográfica es la validación AES-256-GCM del motor canónico scripts/ops/m44_encrypted_backup_archive.mjs. No crear un segundo cifrador o restaurador paralelo.

## Ensayos independientes efectuados: cuatro generaciones; última copia pendiente

El runbook se originó cuando solo existía un respaldo lógico. Al **16/10/2026** hay evidencia adicional confirmada por el operador Windows, introduciendo su clave en ventana local oculta, sin GitHub/Supabase ni secretos transmitidos al chat:

- Generaciones 1–3: recuperación externa de dump PG17 y bytes de 126 objetos Storage; la tercera agregó declaraciones de roles globales sin contraseñas **preservadas, no aplicadas**.
- Generación 4 (GitHub run 38849763961, Drive privado [identificador reservado al registro privado de custodia]): operador verificó SHA-256, AES-256-GCM, TAR, 126 objetos Storage, existencia de ACL y DEFAULT ACL en TOC y restauración PostgreSQL 17 en contenedor Docker sin red y sin puertos, eliminado al finalizar. Roles y ACL **no aplicados**: --no-owner --no-acl.
- Generación 5 (GitHub run 38888628869, Drive privado [identificador reservado al registro privado de custodia], SHA-256 3fd6a9aff8beda8342973da357824d04b3f6ef6508ba381d2495cea25a7d18bd): tres jobs GitHub SUCCESS, subida privada y descarga posterior desde Drive cotejada con el artefacto GitHub; **pendiente ensayo independiente offline con clave externa de esta última generación**.

La restauración PostgreSQL+Storage fuera de GitHub ya está demostrada con copias anteriores. La recuperación *integral* de Supabase, incluyendo aplicación real de roles/ACL, Auth alojado, JWT, Edge Functions, Vault y secretos, todavía NO lo está. Es incorrecto inferir recuperación de plataforma por presencia de ACL en un archivo. Ninguna de estas pruebas autoriza M44 PROD.

## Procedimiento repetible de prueba externa

1. Descargar los bytes del ZIP desde Drive, sin recuperar el artefacto temporal de GitHub.
2. Recuperar una clave de cifrado conservada de forma independiente y segura fuera de GitHub, sin mostrarla en chat, logs ni código.
3. Validar el SHA-256 del ZIP, su entrada exclusiva y la cabecera con el guard.
4. Descifrar únicamente en un entorno aislado temporal con el módulo canónico M44. Validar tag GCM.
5. Inspeccionar de forma segura el TAR y verificar todos los bytes y hashes mediante m44_storage_backup_bytes.mjs.
6. Restaurar PostgreSQL en una instancia aislada con imagen Supabase compatible (supabase/postgres:17.6.1.147), sin conexiones ni escrituras a PROD ni a QA.
7. Validar esquemas público/Auth/Storage, dependencias, funciones, integridad y componentes gestionados adicionales de Supabase. No imprimir contenido personal.
8. Registrar fecha, digest, alcance, resultados, RTO observado y RPO real, incluida validación del origen externo de la clave.
9. Limpiar los temporales con datos en claro. No subir respaldos, manifiestos privados ni claves al repositorio público.

## Limitaciones relevantes

No hay todavía backup diario automático ni transferencia automática privada acreditada. La retención del artefacto temporal GitHub es de un día y no equivale a almacenamiento duradero. El backup completo no debe clasificarse bajo ninguna persona.

El modo TLS sslmode=require cifra el tráfico pero no verifica plenamente la identidad del servidor: elevar a verify-full con una CA adecuada antes de una automatización permanente. Proteger estrictamente las credenciales con acceso amplio a Storage.

La recuperación aislada de PostgreSQL no demuestra recuperación integral de la configuración gestionada de Auth, Vault, Edge Functions, secretos y servicios externos. M44 tiene 12 migraciones en QA y ninguna confirmada en PROD en el inventario realizado: revisar inmediatamente antes de promoción.

ESTADO: recuperación independiente de PostgreSQL y Storage acreditada hasta la cuarta generación; roles y ACL archivados sin aplicación. Última copia pendiente de ensayo externo. Recuperación integral de plataforma y RTO/RPO **no certificados**; ninguna autorización de despliegue a PROD. Para duraciones observables de transferencia externa, consultar docs/ops/M44_RTO_RPO_MEASUREMENT_EVIDENCE.md.
