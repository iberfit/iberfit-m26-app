with
relations as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'name', c.relname,
    'kind', c.relkind,
    'owner', pg_get_userbyid(c.relowner),
    'rowSecurity', c.relrowsecurity,
    'forceRowSecurity', c.relforcerowsecurity,
    'acl', coalesce(to_jsonb(c.relacl), '[]'::jsonb)
  ) order by n.nspname, c.relname), '[]'::jsonb) as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','private')
    and c.relkind in ('r','p','v','m','S')
),
relation_columns as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'relation', c.relname,
    'kind', c.relkind,
    'column', a.attname,
    'ordinal', a.attnum,
    'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
    'notNull', a.attnotnull,
    'default', pg_catalog.pg_get_expr(ad.adbin, ad.adrelid),
    'identity', a.attidentity,
    'generated', a.attgenerated
  ) order by n.nspname, c.relname, a.attnum), '[]'::jsonb) as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a
    on a.attrelid = c.oid
   and a.attnum > 0
   and not a.attisdropped
  left join pg_catalog.pg_attrdef ad
    on ad.adrelid = c.oid
   and ad.adnum = a.attnum
  where n.nspname in ('public','private')
    and c.relkind in ('r','p','v','m','S')
),
routines as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'identity', p.oid::regprocedure::text,
    'kind', p.prokind,
    'owner', pg_get_userbyid(p.proowner),
    'acl', coalesce(to_jsonb(p.proacl), '[]'::jsonb),
    'definition', pg_catalog.pg_get_functiondef(p.oid)
  ) order by n.nspname, p.oid::regprocedure::text), '[]'::jsonb) as value
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private')
    and p.prokind in ('f','p')
),
triggers as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'relation', c.relname,
    'name', t.tgname,
    'definition', pg_catalog.pg_get_triggerdef(t.oid, true)
  ) order by n.nspname, c.relname, t.tgname), '[]'::jsonb) as value
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','private')
    and not t.tgisinternal
),
policies as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', p.schemaname,
    'relation', p.tablename,
    'name', p.policyname,
    'permissive', p.permissive,
    'roles', p.roles,
    'command', p.cmd,
    'using', p.qual,
    'withCheck', p.with_check
  ) order by p.schemaname, p.tablename, p.policyname), '[]'::jsonb) as value
  from pg_catalog.pg_policies p
  where p.schemaname in ('public','private')
),
constraints as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'relation', c.relname,
    'name', co.conname,
    'type', co.contype,
    'definition', pg_catalog.pg_get_constraintdef(co.oid, true)
  ) order by n.nspname, c.relname, co.conname), '[]'::jsonb) as value
  from pg_catalog.pg_constraint co
  join pg_catalog.pg_class c on c.oid = co.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','private')
),
indexes as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'relation', tbl.relname,
    'name', idx.relname,
    'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
  ) order by n.nspname, tbl.relname, idx.relname), '[]'::jsonb) as value
  from pg_catalog.pg_index i
  join pg_catalog.pg_class idx on idx.oid = i.indexrelid
  join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
  join pg_catalog.pg_namespace n on n.oid = tbl.relnamespace
  where n.nspname in ('public','private')
),
views as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'name', c.relname,
    'kind', c.relkind,
    'definition', pg_catalog.pg_get_viewdef(c.oid, true)
  ) order by n.nspname, c.relname), '[]'::jsonb) as value
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','private')
    and c.relkind in ('v','m')
),
types as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', n.nspname,
    'name', t.typname,
    'kind', t.typtype,
    'category', t.typcategory,
    'owner', pg_get_userbyid(t.typowner),
    'acl', coalesce(to_jsonb(t.typacl), '[]'::jsonb),
    'enumLabels', coalesce((
      select jsonb_agg(e.enumlabel order by e.enumsortorder)
      from pg_catalog.pg_enum e
      where e.enumtypid = t.oid
    ), '[]'::jsonb)
  ) order by n.nspname, t.typname), '[]'::jsonb) as value
  from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  where n.nspname in ('public','private')
    and t.typtype in ('e','d','c')
)
select jsonb_build_object(
  'schema', 'iberfit.prod.schema-recovery.v1',
  'capturedAt', clock_timestamp(),
  'database', current_database(),
  'serverVersionNum', current_setting('server_version_num'),
  'relations', (select value from relations),
  'relationColumns', (select value from relation_columns),
  'routines', (select value from routines),
  'triggers', (select value from triggers),
  'policies', (select value from policies),
  'constraints', (select value from constraints),
  'indexes', (select value from indexes),
  'views', (select value from views),
  'types', (select value from types)
) as snapshot;
