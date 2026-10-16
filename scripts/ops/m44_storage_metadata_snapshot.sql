-- IBERFIT M44: read-only PostgreSQL Storage object metadata snapshot.
-- Object names and paths are private. Only encrypt inside recovery package.
SELECT coalesce(json_agg(json_build_object(
 'bucket_id',bucket_id,
 'name',name,
 'id',id::text,
 'version',version,
 'updated_at',CASE WHEN updated_at IS NULL THEN NULL ELSE to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
 'size',metadata->>'size'
) ORDER BY bucket_id,name),'[]'::json)
FROM storage.objects;
