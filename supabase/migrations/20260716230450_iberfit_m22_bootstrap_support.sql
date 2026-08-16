create or replace function public.iberfit_bootstrap_support()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'reports',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.reports r),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at) from public.documents d),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at desc) from public.client_timeline_events t),'[]'::jsonb),
    'sessionExecutions',coalesce((select jsonb_agg(to_jsonb(se) order by se.updated_at desc) from public.session_executions se),'[]'::jsonb),
    'intelligenceRuns',coalesce((select jsonb_agg(to_jsonb(ir) order by ir.created_at desc) from public.intelligence_runs ir),'[]'::jsonb),
    'planChanges',coalesce((select jsonb_agg(to_jsonb(pc) order by pc.created_at desc) from public.plan_change_proposals pc),'[]'::jsonb)
  )
$$;
revoke all on function public.iberfit_bootstrap_support() from public,anon;
grant execute on function public.iberfit_bootstrap_support() to authenticated;;
