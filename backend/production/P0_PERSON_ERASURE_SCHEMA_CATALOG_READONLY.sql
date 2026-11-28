-- IBERFIT P0: READ-ONLY schema and permission inventory for selective person erasure.
-- NO person identifiers, emails, path names, personal data, DML or DDL in this file.
-- The catalog is necessary but never sufficient: JSON references, Auth/Storage API
-- ownership, RLS and real record counts require separate privileged read-only checks.

-- 1. All public client_id columns; discover missing/changed FK relationships.
SELECT c.table_schema,c.table_name,c.column_name,c.data_type,c.is_nullable,
       coalesce(cls.relrowsecurity,false) AS rls_enabled,
       co.conname AS fk_name,
       CASE co.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
         ELSE 'NO CLIENT FK' END AS client_fk_on_delete
FROM information_schema.columns c
JOIN pg_namespace ns ON ns.nspname=c.table_schema
JOIN pg_class cls ON cls.relnamespace=ns.oid AND cls.relname=c.table_name
JOIN pg_attribute attr ON attr.attrelid=cls.oid AND attr.attname=c.column_name
LEFT JOIN pg_constraint co ON co.conrelid=cls.oid
  AND co.contype='f'
  AND co.confrelid='public.clients'::regclass
  AND attr.attnum=ANY(co.conkey)
WHERE c.table_schema='public' AND c.column_name='client_id'
ORDER BY c.table_name,c.column_name,co.conname;

-- 2. Every inbound FK to hosted Auth, including non-client owner/creator references.
SELECT ns.nspname AS schema_name, cls.relname AS table_name,
       co.conname AS fk_name, pg_get_constraintdef(co.oid) AS definition,
       CASE co.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
         WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
         ELSE 'UNKNOWN' END AS auth_fk_on_delete
FROM pg_constraint co
JOIN pg_class cls ON cls.oid=co.conrelid
JOIN pg_namespace ns ON ns.oid=cls.relnamespace
WHERE co.contype='f' AND co.confrelid='auth.users'::regclass
ORDER BY ns.nspname,cls.relname,co.conname;

-- 3. Private objects overview; no object path or owner is returned.
SELECT bucket_id, count(*)::bigint AS object_count
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

-- 4. Live privilege boundary of the existing *partial* client-delete RPC.
SELECT c.relrowsecurity AS clients_rls,
       has_table_privilege('anon','public.clients','DELETE') AS anon_direct_delete,
       has_table_privilege('authenticated','public.clients','DELETE') AS authenticated_direct_delete,
       has_function_privilege('anon','public.iberfit_admin_delete_client_v26(jsonb,jsonb)','EXECUTE') AS anon_rpc_execute,
       has_function_privilege('authenticated','public.iberfit_admin_delete_client_v26(jsonb,jsonb)','EXECUTE') AS authenticated_rpc_execute,
       has_function_privilege('service_role','public.iberfit_admin_delete_client_v26(jsonb,jsonb)','EXECUTE') AS service_rpc_execute
FROM pg_class c WHERE c.oid='public.clients'::regclass;

-- 5. Basic discovery counters and catalog drift fingerprint (schema only).
WITH client_refs AS (
  SELECT c.table_schema||'.'||c.table_name||'.'||c.column_name AS value
  FROM information_schema.columns c
  WHERE c.table_schema='public' AND c.column_name='client_id'
),auth_refs AS (
  SELECT ns.nspname||'.'||cls.relname||'.'||co.conname||':'||pg_get_constraintdef(co.oid) AS value
  FROM pg_constraint co JOIN pg_class cls ON cls.oid=co.conrelid
  JOIN pg_namespace ns ON ns.oid=cls.relnamespace
  WHERE co.contype='f' AND co.confrelid='auth.users'::regclass
)
SELECT (SELECT count(*) FROM client_refs) AS client_id_columns,
       (SELECT count(*) FROM auth_refs) AS inbound_auth_fks,
       (SELECT md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM client_refs) AS client_catalog_md5,
       (SELECT md5(coalesce(string_agg(value,',' ORDER BY value),'')) FROM auth_refs) AS auth_catalog_md5;
