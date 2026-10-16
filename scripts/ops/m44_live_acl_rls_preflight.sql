-- IBERFIT M44: live read-only ACL/RLS preflight. One MVCC statement,
-- no customer rows or role/person identities are returned. This is only
-- a structural safety check, not a behavioral RLS certification.
WITH scoped_roles AS (
 SELECT oid AS role_oid, rolname
 FROM pg_catalog.pg_roles
 WHERE rolname IN ('anon','authenticated')
),
relations AS (
 SELECT c.oid AS relation_oid, n.nspname AS schema_name,
        c.relrowsecurity AS rls_enabled, r.rolname,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'SELECT') AS can_select,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'INSERT') AS can_insert,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'UPDATE') AS can_update,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'DELETE') AS can_delete,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'TRUNCATE') AS can_truncate,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'TRIGGER') AS can_trigger
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 CROSS JOIN scoped_roles r
 WHERE n.nspname IN ('public','storage','auth','vault')
 AND c.relkind IN ('r','p')
),
metrics AS (
 SELECT
    count(*) FILTER (WHERE rolname='anon')::int AS total_tables,
    count(*) FILTER (WHERE schema_name='public' AND rolname='anon')::int AS public_tables,
    count(*) FILTER (WHERE can_truncate)::int AS truncate_grants,
    count(*) FILTER (WHERE NOT rls_enabled
      AND (can_select OR can_insert OR can_update OR can_delete
        OR pg_catalog.has_any_column_privilege('anon',relation_oid,'SELECT')
        OR pg_catalog.has_any_column_privilege('anon',relation_oid,'INSERT')
        OR pg_catalog.has_any_column_privilege('anon',relation_oid,'UPDATE')
        OR pg_catalog.has_any_column_privilege('authenticated',relation_oid,'SELECT')
        OR pg_catalog.has_any_column_privilege('authenticated',relation_oid,'INSERT')
        OR pg_catalog.has_any_column_privilege('authenticated',relation_oid,'UPDATE')))::int AS unprotected_dml_grants,
    count(*) FILTER (WHERE schema_name='public' AND rolname='anon' AND can_delete)::int AS public_anon_delete,
    count(*) FILTER (WHERE schema_name='public' AND rolname='anon' AND can_trigger)::int AS public_anon_trigger,
    count(*) FILTER (WHERE schema_name='public' AND rolname='authenticated' AND can_delete)::int AS public_authenticated_delete,
    count(*) FILTER (WHERE schema_name='public' AND rolname='authenticated' AND can_trigger)::int AS public_authenticated_trigger,
    count(*) FILTER (WHERE schema_name='public' AND rolname='anon' AND can_insert)::int AS public_anon_insert,
    count(*) FILTER (WHERE schema_name='public' AND rolname='authenticated' AND can_insert)::int AS public_authenticated_insert
 FROM relations
)
SELECT json_build_object(
 'schema','iberfit.m44.live-acl-rls-preflight.v1',
 'captured_at',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'metrics',row_to_json(metrics)
) FROM metrics;
