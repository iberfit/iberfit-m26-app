-- IBERFIT M44: read-only, data-minimizing platform catalog fingerprint.
-- Run ONLY with `psql -X -A -t -v ON_ERROR_STOP=1 -f ...` in a protected runner.
-- Result: one JSON object of SHA-256 values. No credentials, user rows, names,
-- SQL function source or ACL contents are printed. Not a platform restore proof.
WITH material AS (
 SELECT
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.role_name),'[]'::jsonb)
   FROM (SELECT rolname AS role_name,rolcanlogin AS can_login,rolcreatedb AS create_db,
          rolcreaterole AS create_role,rolbypassrls AS bypass_rls,rolinherit AS inherits,
          rolreplication AS replicates,rolconnlimit AS connection_limit
         FROM pg_catalog.pg_roles WHERE rolname NOT LIKE 'pg_%') x) AS roles,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.role_name,x.member_name,x.grantor_name),'[]'::jsonb)
   FROM (SELECT r.rolname AS role_name,mr.rolname AS member_name,
          coalesce(gr.rolname,'') AS grantor_name,
          a.admin_option,a.inherit_option,a.set_option
         FROM pg_catalog.pg_auth_members a
         JOIN pg_catalog.pg_roles r ON r.oid=a.roleid
         JOIN pg_catalog.pg_roles mr ON mr.oid=a.member
         LEFT JOIN pg_catalog.pg_roles gr ON gr.oid=a.grantor) x) AS role_memberships,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name,x.relation_name,x.kind),'[]'::jsonb)
   FROM (SELECT n.nspname AS schema_name,c.relname AS relation_name,c.relkind::text AS kind,
          pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,c.relrowsecurity AS rls_enabled,
          c.relforcerowsecurity AS rls_forced,
          coalesce(c.relacl::text,'') AS relation_acl,
          coalesce(c.reloptions::text,'') AS relation_options
         FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN ('public','auth','storage')
           AND c.relkind IN ('r','p','v','m','S','f')) x) AS relation_security,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.owner_name,x.schema_name,x.object_kind),'[]'::jsonb)
   FROM (SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner_name,
          coalesce(n.nspname,'*') AS schema_name,d.defaclobjtype::text AS object_kind,
          coalesce(d.defaclacl::text,'') AS default_acl
         FROM pg_catalog.pg_default_acl d
         LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace) x) AS default_privileges,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name,x.signature),'[]'::jsonb)
   FROM (SELECT n.nspname AS schema_name,
          p.oid::regprocedure::text AS signature,
          pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
          p.prosecdef AS security_definer,p.proleakproof AS leakproof,
          p.provolatile::text AS volatility,p.proparallel::text AS parallelism,
          coalesce(p.proacl::text,'') AS execute_acl,
          coalesce(p.proconfig::text,'') AS settings,
          md5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_md5
         FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname IN ('public','auth','storage') AND p.prokind IN ('f','p')) x) AS function_security,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name,x.table_name,x.policy_name),'[]'::jsonb)
   FROM (SELECT schemaname AS schema_name,tablename AS table_name,policyname AS policy_name,
          permissive,roles,cmd,qual,with_check
         FROM pg_catalog.pg_policies WHERE schemaname IN ('public','auth','storage')) x) AS policies,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name,x.table_name,x.trigger_name),'[]'::jsonb)
   FROM (SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,
          t.tgenabled::text AS enabled,md5(pg_catalog.pg_get_triggerdef(t.oid)) AS definition_md5
         FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage')) x) AS triggers,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.extension_name),'[]'::jsonb)
   FROM (SELECT e.extname AS extension_name,e.extversion AS version,
          n.nspname AS schema_name
         FROM pg_catalog.pg_extension e
         JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace) x) AS extensions,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.bucket_id),'[]'::jsonb)
   FROM (SELECT id AS bucket_id,name,public,file_size_limit,allowed_mime_types
         FROM storage.buckets) x) AS bucket_configuration,
  (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.version),'[]'::jsonb)
   FROM (SELECT version,name FROM supabase_migrations.schema_migrations) x) AS migration_history
)
SELECT jsonb_build_object(
 'schema','iberfit.m44.platform.catalog.v1',
 'roles',encode(sha256(convert_to(roles::text,'UTF8')),'hex'),
 'role_memberships',encode(sha256(convert_to(role_memberships::text,'UTF8')),'hex'),
 'relation_security',encode(sha256(convert_to(relation_security::text,'UTF8')),'hex'),
 'default_privileges',encode(sha256(convert_to(default_privileges::text,'UTF8')),'hex'),
 'function_security',encode(sha256(convert_to(function_security::text,'UTF8')),'hex'),
 'policies',encode(sha256(convert_to(policies::text,'UTF8')),'hex'),
 'triggers',encode(sha256(convert_to(triggers::text,'UTF8')),'hex'),
 'extensions',encode(sha256(convert_to(extensions::text,'UTF8')),'hex'),
 'bucket_configuration',encode(sha256(convert_to(bucket_configuration::text,'UTF8')),'hex'),
 'migration_history',encode(sha256(convert_to(migration_history::text,'UTF8')),'hex')
)::text FROM material;
