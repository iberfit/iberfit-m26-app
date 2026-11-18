-- M44 data-minimizing ACL sidecar v1; READ ONLY. Never print names, ACL,
-- identities, user rows, passwords, tokens or function source.
-- Extra categories complement (NEVER replace) the historical 12-digest catalog.
-- Use only with snapshot-attested source + isolated restored database.
WITH material AS (
 SELECT
 (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.schema_name),'[]'::jsonb)
  FROM (
   SELECT n.nspname AS schema_name,
    pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name,
    COALESCE(n.nspacl::text,'') AS schema_acl
   FROM pg_catalog.pg_namespace n
   WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp_%'
  ) x) AS schema_acl,
 (SELECT COALESCE(jsonb_agg(to_jsonb(x)
  ORDER BY x.schema_name,x.relation_name,x.attribute_number),'[]'::jsonb)
  FROM (
   SELECT n.nspname AS schema_name,c.relname AS relation_name,
    a.attnum AS attribute_number,a.attname AS column_name,
    COALESCE(a.attacl::text,'') AS column_acl
   FROM pg_catalog.pg_attribute a
   JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp_%'
    AND c.relkind IN ('r','p','v','m','f')
    AND a.attnum>0 AND NOT a.attisdropped
  ) x) AS column_acl,
 -- A recovery database deliberately has a different name. Fingerprint
 -- its owner and effective ACL, not the incidental target database name.
 (SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  FROM (
   SELECT pg_catalog.pg_get_userbyid(d.datdba) AS owner_name,
    COALESCE(d.datacl::text,'') AS database_acl,
    d.datallowconn AS allows_connections,
    d.datconnlimit AS connection_limit
   FROM pg_catalog.pg_database d
   WHERE d.datname=current_database()
  ) x) AS database_acl
)
SELECT jsonb_build_object(
 'schema','iberfit.m44.access-acl-supplement.v1',
 'schema_acl',encode(sha256(convert_to(schema_acl::text,'UTF8')),'hex'),
 'column_acl',encode(sha256(convert_to(column_acl::text,'UTF8')),'hex'),
 'database_acl',encode(sha256(convert_to(database_acl::text,'UTF8')),'hex')
)::text FROM material;
