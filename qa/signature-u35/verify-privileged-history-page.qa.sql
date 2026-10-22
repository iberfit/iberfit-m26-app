-- U35 AUTHENTICATED QA ROLLBACK SMOKE.
-- Run only in isolated QA in this exact order, in ONE connection/transaction:
-- BEGIN; <privileged-history-page-v1.qa.sql>; <this smoke file>; ROLLBACK;
-- Never grant EXECUTE or apply the candidate to production through this script.
do $u35_smoke$
declare
 v_coach uuid;
 v_client uuid;
 v_assigned uuid;
 v_foreign uuid;
 v_section text;
 v_snapshot timestamptz;
 v_cursor jsonb;
 v_expected bigint;
 v_page jsonb;
 v_seen text[];
 v_key text;
 v_pages integer;
 v_denied boolean;
 v_rejected boolean;
begin
 select id into v_coach from auth.users where email='qa.rc74.coach@iberfit.cl';
 select id into v_client from auth.users where email='qa.rc74.client-a@iberfit.cl';
 select a.client_id into v_assigned
 from public.client_assignments a where a.coach_user_id=v_coach and a.active
 order by a.client_id limit 1;
 select c.id into v_foreign from public.clients c
 where not exists (
   select 1 from public.client_assignments a where a.client_id=c.id
     and a.coach_user_id=v_coach and a.active
 ) order by c.id limit 1;
 if v_coach is null or v_client is null or v_assigned is null then
   raise exception 'U35_QA_IDENTITIES_MISSING';
 end if;
 perform set_config('request.jwt.claim.sub',v_coach::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 if public.iberfit_current_role_v26()<>'coach' then
   raise exception 'U35_QA_EXPECTED_COACH';
 end if;
 -- Exhaustive keyset parity in all three sections, no duplicates or missing rows.
 for v_section in select unnest(array[
   'm26Entities','domainEvents','sessionExecutions'
 ]) loop
   v_snapshot:=null;v_cursor:=null;v_expected:=null;
   v_seen:=array[]::text[];v_pages:=0;
   loop
     v_page:=private.iberfit_privileged_history_page_u35_qa(
       v_assigned,v_section,v_snapshot,v_cursor,v_expected,32);
     if v_snapshot is null then
       v_snapshot:=(v_page->>'snapshotAt')::timestamptz;
       v_expected:=(v_page->>'totalCount')::bigint;
     end if;
     for v_key in select case when v_section='m26Entities'
       then (entry.value->>'entityType')||':'||(entry.value->>'entityId')
       else entry.value->>'id' end
       from jsonb_array_elements(v_page->'records') entry(value)
     loop
       if v_key is null or v_key=any(v_seen) then
         raise exception 'U35_DUPLICATE_OR_NULL_RECORD';
       end if;
       v_seen:=array_append(v_seen,v_key);
     end loop;
     v_pages:=v_pages+1;
     if v_pages>150 then raise exception 'U35_PAGING_NEVER_FINISHED';end if;
     exit when v_page->>'hasMore'='false';
     v_cursor:=v_page->'nextCursor';
     if v_cursor is null then raise exception 'U35_MISSING_CONTINUATION';end if;
   end loop;
   if cardinality(v_seen)<>v_expected then
     raise exception 'U35_MISSING_HISTORY_RECORDS';
   end if;
 end loop;
 -- Drift must abort rather than return an incomplete, misleading history.
 v_page:=private.iberfit_privileged_history_page_u35_qa(
   v_assigned,'m26Entities',null,null,null,8);
 v_rejected:=false;
 begin
   perform private.iberfit_privileged_history_page_u35_qa(
     v_assigned,'m26Entities',(v_page->>'snapshotAt')::timestamptz,
     v_page->'nextCursor',(v_page->>'totalCount')::bigint+1,8);
 exception when serialization_failure then v_rejected:=true;
 end;
 if not v_rejected then raise exception 'U35_SNAPSHOT_DRIFT_ALLOWED';end if;
 v_rejected:=false;
 begin
   perform private.iberfit_privileged_history_page_u35_qa(
     v_assigned,'m26Entities',null,null,null,33);
 exception when invalid_parameter_value then v_rejected:=true;
 end;
 if not v_rejected then raise exception 'U35_UNBOUNDED_PAGE_ALLOWED';end if;
 v_rejected:=false;
 begin
   perform private.iberfit_privileged_history_page_u35_qa(
     v_assigned,null,null,null,null,8);
 exception when invalid_parameter_value then v_rejected:=true;
 end;
 if not v_rejected then raise exception 'U35_NULL_SECTION_ALLOWED';end if;
 if v_foreign is not null then
   v_denied:=false;
   begin
     perform private.iberfit_privileged_history_page_u35_qa(
       v_foreign,'m26Entities');
   exception when insufficient_privilege then v_denied:=true;
   end;
   if not v_denied then raise exception 'U35_FOREIGN_COACH_ACCESS';end if;
 end if;
 perform set_config('request.jwt.claim.sub',v_client::text,true);
 if public.iberfit_current_role_v26()<>'cliente' then
   raise exception 'U35_QA_EXPECTED_CLIENT';
 end if;
 v_denied:=false;
 begin
   perform private.iberfit_privileged_history_page_u35_qa(
     v_assigned,'m26Entities');
 exception when insufficient_privilege then v_denied:=true;
 end;
 if not v_denied then raise exception 'U35_CLIENT_ACCESS';end if;
 perform set_config('request.jwt.claim.sub','',true);
 v_denied:=false;
 begin
   perform private.iberfit_privileged_history_page_u35_qa(
     v_assigned,'m26Entities');
 exception when insufficient_privilege then v_denied:=true;
 end;
 if not v_denied then raise exception 'U35_ANON_ACCESS';end if;
end
$u35_smoke$;
select true as qa_u35_privileged_history_full_paging_and_roles_pass;
