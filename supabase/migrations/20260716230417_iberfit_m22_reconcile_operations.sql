create or replace function public.iberfit_reconcile_operations(p_operations jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  op jsonb;
  result jsonb;
  ack jsonb := '[]'::jsonb;
  conflicts jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
  revisions jsonb := '{}'::jsonb;
  env jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  env := public.iberfit_environment();
  if env->>'environment' <> 'PRODUCTION' or coalesce((env->>'realDataAllowed')::boolean,false)=false or coalesce((env->>'productionBlocked')::boolean,true)=true then raise exception 'Entorno productivo no autorizado'; end if;
  if jsonb_typeof(p_operations) <> 'array' then raise exception 'p_operations debe ser un array'; end if;
  for op in select value from jsonb_array_elements(p_operations)
  loop
    result := public.iberfit_process_operation(op);
    if result->>'kind'='ack' then
      ack := ack || jsonb_build_array(result - 'kind');
      if result ? 'entityKey' then revisions := revisions || jsonb_build_object(result->>'entityKey',(result->>'remoteRevision')::bigint); end if;
    elsif result->>'kind'='conflict' then
      conflicts := conflicts || jsonb_build_array(result - 'kind');
    else
      rejected := rejected || jsonb_build_array(result - 'kind');
    end if;
  end loop;
  return jsonb_build_object('ack',ack,'conflicts',conflicts,'rejected',rejected,'remoteRevisions',revisions);
end
$$;
revoke all on function public.iberfit_reconcile_operations(jsonb) from public,anon;
grant execute on function public.iberfit_reconcile_operations(jsonb) to authenticated;;
