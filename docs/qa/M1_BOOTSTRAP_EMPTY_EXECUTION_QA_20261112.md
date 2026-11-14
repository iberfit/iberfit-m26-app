# M1 / P0 #1209 · QA bootstrap: vacíos históricos, igualdad y rollback

**Registro operativo 12/11/2026. NO es una certificación de producción.** Rama PR #1335, origen QA `gjztkdwfmunnzhtvxrsu` exclusivamente; no editar clientes ni PROD.

## Error causal
GitHub Authenticated Client Interaction #43323447634, intento 1: Chromium Client a 320px terminó con `POST /rest/v1/rpc/iberfit_bootstrap_v26` HTTP 500. Supabase QA `edge_logs` registró un upstream de 8355 ms (22:50:46.694 UTC); `postgres_logs` registró SQLSTATE **57014** por statement timeout (22:50:54.971 UTC). La UI U60 RC39 ya montaba correctamente: es un fallo de **bootstrap SQL**, no un selector de interfaz.

## Optimización aplicada y alcance
- Migration QA aplicada por Supabase el 12/11/2026; ledger **`20261112225518`**, nombre `m1_qa_empty_execution_sanitizer_fast_path`. Archivo de repositorio alineado a la versión real.
- Hash función `public.iberfit_bootstrap_v26()` antes: `5b9547e2230994fa96cb6cb629f8fb2d`; después: `5d3e13ffc4f00c1e5f29d61fb81cd6e3`. Owner `postgres` y ACL `postgres,authenticated,service_role` sin modificación.
- Únicamente se utiliza para cuentas sintéticas QA Client A/B y entorno `QA`; depende de los hash exactos de los **dos sanitizadores M43**. El CASE rápido opera solo sobre `results`, `feedback`, `sourceSnapshot`, `planSnapshot` verdaderamente vacíos; otro cuerpo o deriva de función invoca el sanitizador original. Sin truncado, eliminación de historia, ACL, RLS, GRANT ni cambio de datos.
- Comparación directa en QA: **704/704** entradas vacías Cliente A y **18/18** Cliente B, **0 diferencias JSONB** del saneador original. No se omite ningún elemento ni se altera orden/revisión.
- `EXPLAIN ANALYZE` de la función real después: Cliente A **1993,092 ms**, Cliente B **112,89 ms**, pruebas individuales sin garantía de p95 ni de carga paralela.
- Repetición del gate real Authenticated Client Interaction #43323447634 (intento 2, solo job fallido) **SUCCESS** con cuatro dispositivos, cross-owner, sin escrituras.
- Readback PROD: proyecto `pjhmrhejsoofmouedavw`, `environment=PRODUCTION`, bootstrap hash `aedea9df3d4986496626e10318628c41`, sin cambios.

## Reversión exacta sin ejecutar
El archivo `supabase/qa-rollbacks/20261112225518_m1_qa_empty_execution_sanitizer_fast_path.rollback.sql` reconstruye la definición original solo con **los 3 reemplazos inversos**, condicionados a QA y al hash candidato `5d3e13...`. Dry-run read-only de reversión: el resultado reconstruido genera exactamente `5b9547e2230994fa96cb6cb629f8fb2d` y desaparece el marcador M1. El rollback no fue ejecutado, de modo que QA conserva la optimización. La versión del ledger permanece registrada; si hubiera reversión efectiva, conciliar también ese estado administrativamente antes de volver a migrar.

## Pendiente / NO-GO
El pico intermitente SQLSTATE 57014 aún exige muestreo bajo concurrencia real y solución de la carga estructural para todos los Clientes/Coach; la mejora presente no es un despliegue productivo. M44 requiere copia cifrada y restauración integral **fresca <=2 h**, y U60 todavía necesita pausa/reanudación persistente y E2E visual de escritura por fecha. Mantener la PR Draft hasta completar los gates y una promoción protegida.
