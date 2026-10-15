-- M44 publication must never expose the canonical report body to clients.
-- The approved/published client-facing projection contains whitelisted data.
create or replace function public.iberfit_m44_report_private_body_guard_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.entity_type='report' then
    new.body:=coalesce(new.body,'{}'::jsonb)
      || jsonb_build_object('visibleToClient',false);
  end if;
  return new;
end
$function$;
drop trigger if exists trg_m44_report_private_body_guard on public.domain_entities_v26;
create trigger trg_m44_report_private_body_guard
before insert or update on public.domain_entities_v26
for each row execute function public.iberfit_m44_report_private_body_guard_v1();

create or replace function public.iberfit_m44_report_public_projection_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_published boolean;
  v_client_json jsonb;
  v_status public.publication_status;
begin
  if new.entity_type<>'report' then return new;end if;
  v_published:=new.status='publicado';
  v_status:=case when new.status='anulado' then 'retirado'::public.publication_status
    else new.status::public.publication_status end;
  -- Explicit public fields prevent coachComment, internal actor identities,
  -- draft fingerprints and internal signatures from leaking into public.reports.
  v_client_json:=jsonb_build_object(
    'id',new.entity_id,'clientId',new.client_id,
    'reportType',new.body->>'reportType',
    'title',new.body->>'title',
    'summary',new.body->>'summary',
    'conclusions',new.body->>'conclusions',
    'recommendations',new.body->>'recommendations',
    'periodStart',new.body->>'periodStart',
    'periodEnd',new.body->>'periodEnd',
    'evidence',coalesce((
      select jsonb_agg(jsonb_build_object(
        'label',item->>'label','text',item->>'text',
        'source',item->>'source','quality',left(coalesce(item->>'quality',''),120)
      ) order by ord)
      from jsonb_array_elements(coalesce(new.body->'evidence','[]'::jsonb))
      with ordinality as evidence(item,ord)
    ),'[]'::jsonb),
    'activitySeries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'from',item->>'from','to',item->>'to','count',item->'count'
      ) order by ord)
      from jsonb_array_elements(coalesce(new.body->'activitySeries','[]'::jsonb))
      with ordinality as series(item,ord)
    ),'[]'::jsonb),
    'format','a4-premium','visibleToClient',true
  );
  update public.reports r set
    status=v_status,
    revision=new.revision,
    audience=case when v_published then 'cliente' else 'coach' end,
    content=case when v_published then v_client_json else new.body end,
    title=coalesce(nullif(new.body->>'title',''),r.title),
    summary=new.body->>'summary',
    published_at=case when v_published then coalesce(r.published_at,now())
      else r.published_at end,
    approved_at=case when new.status in ('aprobado','publicado')
      then coalesce(r.approved_at,now()) else r.approved_at end
  where r.id=new.entity_id and r.client_id=new.client_id;
  return new;
end
$function$;
drop trigger if exists trg_m44_report_client_safe_projection on public.domain_entities_v26;
create trigger trg_m44_report_client_safe_projection
after insert or update on public.domain_entities_v26
for each row execute function public.iberfit_m44_report_public_projection_v1();

drop policy if exists m44_private_canonical_report_body on public.domain_entities_v26;
create policy m44_private_canonical_report_body
on public.domain_entities_v26 as restrictive for select to authenticated
using (entity_type<>'report' or coalesce(public.iberfit_current_role_v26(),'') in ('coach','admin'));

revoke all on function public.iberfit_m44_report_private_body_guard_v1() from public,anon,authenticated;
revoke all on function public.iberfit_m44_report_public_projection_v1() from public,anon,authenticated;
