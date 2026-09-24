# IBERFIT · Política de seguridad para nuevas tablas y secuencias `public`

Vigente para migraciones con timestamp **`20260924000000` o posterior**.

## Principio

Una tabla o secuencia nueva en `public` no puede depender de privilegios implícitos de Supabase/PostgreSQL.

**Nuevo objeto `public` = acceso denegado hasta que IBERFIT declare explícitamente quién puede utilizarlo.**

La migración que crea una tabla debe declarar en el mismo archivo:

1. La intención de seguridad/acceso.
2. RLS habilitado, salvo excepción explícita y razonada.
3. Acceso de `anon` mediante `GRANT` o `REVOKE` explícito.
4. Acceso de `authenticated` mediante `GRANT` o `REVOKE` explícito.
5. Privilegios necesarios de `service_role` mediante `GRANT` explícito.
6. La estrategia de policies: `service-role-only` o `rls-client`.
7. Policies RLS en la misma migración si existe acceso directo de cliente.

La migración que crea explícitamente una secuencia `public` debe declarar en el mismo archivo:

1. `-- IBERFIT-SEQUENCE-ACCESS: public.<sequence> :: <intención>`.
2. Acceso de `anon` mediante `GRANT` o `REVOKE` explícito.
3. Acceso de `authenticated` mediante `GRANT` o `REVOKE` explícito.
4. Los privilegios estrictamente necesarios de `service_role` mediante `GRANT` explícito.

El CI ejecuta `scripts/ci/check_migration_security_policy.mjs` a través del gate canónico `scripts/remote-gates/check_repository_hygiene.mjs`.

## Patrón recomendado: tabla solo backend/RPC

```sql
-- IBERFIT-TABLE-ACCESS: public.example :: Internal data reachable only through narrow SECURITY DEFINER RPCs and service operations.
-- IBERFIT-POLICY: public.example = service-role-only
create table public.example (...);

alter table public.example enable row level security;
alter table public.example force row level security;
revoke all on table public.example from public, anon, authenticated;
grant all on table public.example to service_role;
```

No se crea una policy cliente porque `anon` y `authenticated` no tienen privilegios directos sobre la tabla.

## Patrón permitido: tabla con acceso directo de cliente y RLS

```sql
-- IBERFIT-TABLE-ACCESS: public.example :: Authenticated users read only rows scoped to their own identity.
-- IBERFIT-POLICY: public.example = rls-client
create table public.example (...);

alter table public.example enable row level security;
revoke all on table public.example from public, anon, authenticated;
grant select on table public.example to authenticated;
grant all on table public.example to service_role;

create policy example_select_own
on public.example
for select
to authenticated
using (user_id = auth.uid());
```

El `GRANT` no sustituye a RLS y RLS no sustituye al `GRANT`: ambas capas deben estar declaradas.

## Patrón permitido: secuencia explícita

```sql
-- IBERFIT-SEQUENCE-ACCESS: public.example_id_seq :: Only authenticated inserts and service operations consume generated IDs.
create sequence public.example_id_seq;

revoke all on sequence public.example_id_seq from public, anon;
grant usage, select on sequence public.example_id_seq to authenticated;
grant all on sequence public.example_id_seq to service_role;
```

Las secuencias creadas implícitamente mediante `serial` o `identity` también nacen fail-closed. Si un rol necesita consumirlas directamente, la migración debe otorgar de forma explícita el privilegio mínimo sobre la secuencia generada. Se recomienda evitar depender de privilegios implícitos y preferir UUID o una secuencia explícitamente declarada cuando el contrato de acceso necesite ser auditable.

## Excepción de RLS

Una excepción requiere las dos cosas en la misma migración:

```sql
-- IBERFIT-RLS-EXCEPTION: public.example :: Razón técnica y de seguridad concreta y suficientemente detallada.
alter table public.example disable row level security;
```

La excepción no permite omitir la declaración de grants ni la intención de policy. Debe ser excepcional y revisable.

## Reglas adicionales

- Toda tabla o secuencia nueva debe usar schema explícito.
- No se aceptan comentarios, strings o cuerpos de funciones como sustitutos de DDL real; el linter los ignora al analizar SQL.
- Las tablas y secuencias históricas anteriores al corte quedan grandfathered y se revisan por separado; no se reescriben de forma masiva.
- No se restaurará mediante default privileges el antiguo comportamiento de auto-grant global a `anon/authenticated`.
- Cambiar default privileges de los roles creadores requiere validación previa en QA y posterior promoción controlada a Producción.
- Los defaults de tablas y secuencias son fail-closed; una migración que necesite acceso debe declararlo explícitamente y probarlo.
