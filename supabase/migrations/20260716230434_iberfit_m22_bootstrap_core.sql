create or replace function public.iberfit_bootstrap_core()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'clients',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.clients c),'[]'::jsonb),
    'clientProfiles',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.client_app_profiles p),'[]'::jsonb),
    'cycles',coalesce((select jsonb_agg(to_jsonb(cy) order by cy.created_at) from public.training_cycles cy),'[]'::jsonb),
    'sessions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from public.sessions s),'[]'::jsonb),
    'iriAssessments',coalesce((select jsonb_agg(to_jsonb(i) order by i.evaluated_at desc nulls last,i.created_at desc) from public.iri_assessments i),'[]'::jsonb)
  )
$$;
revoke all on function public.iberfit_bootstrap_core() from public,anon;
grant execute on function public.iberfit_bootstrap_core() to authenticated;;
