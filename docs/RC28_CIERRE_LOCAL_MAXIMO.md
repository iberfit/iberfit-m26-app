# IBERFIT M26 · RC28 · Cierre local máximo

## Estado

- Versión: `26.0.0-cierre-local-maximo.28`
- Estado: no desplegado.
- `deployable: false` hasta superar los gates externos.
- Producción modificada: no.
- Dominios modificados: no.
- Credenciales reales incorporadas: no.
- Dependencias comerciales nuevas: no.

RC28 representa el **cierre local máximo** razonablemente alcanzable sin conectar la aplicación a la infraestructura real, crear cuentas QA remotas, utilizar dispositivos físicos ni desplegar el canario.

## Garantías locales añadidas

1. La visibilidad editorial falla cerrada: una sesión, plan o informe sin estado público confirmado no llega al Cliente.
2. La proyección Cliente utiliza listas explícitas de campos permitidos y elimina secretos anidados, incluso cuando las claves usan mayúsculas, guiones o `snake_case`.
3. La identidad, el entorno, el canario, las métricas y las revisiones remotas se reducen antes de entrar en el estado Cliente.
4. La coincidencia de revisiones remotas utiliza segmentos exactos; `CLI-1` no coincide con `CLI-10`.
5. Un cambio de identidad descarta navegación, selección, operaciones, conflictos y confirmaciones de la sesión anterior.
6. Cerrar sesión reinicia el store completo y elimina las referencias de controladores y repositorios.
7. La cartera Coach incorpora búsqueda accesible, insensible a tildes y con anuncio de resultados.
8. La pantalla de autenticación queda contenida en móvil mediante cálculo de caja explícito.
9. Se prueban estados vacíos, ausencia de datos, textos extensos, carteras amplias, conflictos, reintentos, importación wearable y recorridos completos por rol.
10. Todo texto visible y accesible continúa en castellano de España.

## Alcance que permanece externo

RC28 no demuestra todavía la seguridad del servidor, la disponibilidad real ni el comportamiento físico. Permanecen bloqueados:

- comparación autenticada del registro remoto de 52 comandos;
- RLS y payloads reales por identidad en Supabase;
- cuentas QA reales de Entrenador y Cliente;
- puente Android Health Connect y dispositivos físicos;
- revisión OAuth restringida de Google Health API;
- despliegue en `m26-canary.iberfit.cl`;
- observación del canario y ensayo real de rollback a M25.1.

## Criterio de paso

No se sustituirá `app.iberfit.cl` ni `coach.iberfit.cl` hasta que todos los gates del runbook de publicación controlada estén aprobados y exista una decisión humana explícita.
