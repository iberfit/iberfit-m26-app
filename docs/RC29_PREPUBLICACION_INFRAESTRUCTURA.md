# RC29 · Prepublicación e infraestructura controlada

RC29 corrige el kit de repositorio e infraestructura sin alterar la experiencia visible cerrada en RC28.

## Correcciones respecto del paquete anterior

1. Documentación y workflows apuntan a la versión vigente, no a RC18.
2. La CI ejecuta `validate:rc29` y no solicita caché npm sin archivo de bloqueo.
3. El gate remoto compara las **52 definiciones** completas, no solo el catálogo base de 44.
4. El gate remoto requiere Entrenador, Cliente A y Cliente B y verifica IDs distintos.
5. Las auditorías SQL utilizan los nombres RPC canónicos `iberfit_*_v26`.
6. Cloudflare apunta al candidato RC29 y mantiene el despliegue exclusivamente en canario.
7. La configuración runtime se genera de forma explícita, solo con clave publicable y `QA_ONLY=true`.
8. Ningún workflow despliega automáticamente.

## Repositorio requerido

Crear un repositorio **privado y vacío** con nombre recomendado `iberfit-app-m26`. No utilizar `iberfitweb`, `iberfit-assets` ni el repositorio web archivado.

## Gates que permanecen externos

- acceso autenticado a Supabase;
- comparación real de las 52 definiciones;
- cuentas QA reales;
- RLS y aislamiento cruzado;
- despliegue canario;
- dispositivos físicos;
- rollback real.
