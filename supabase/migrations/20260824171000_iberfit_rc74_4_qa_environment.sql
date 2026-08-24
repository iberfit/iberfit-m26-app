-- IBERFIT M26 RC74.4C · isolated QA environment guard
-- Branch-only migration for canary/rc74-4.
-- The canonical historical chain contains production settings; this migration
-- deliberately overrides them for the FREE isolated QA project.

insert into public.iberfit_system_settings(key,value) values
  ('environment','"QA"'::jsonb),
  ('real_data_allowed','false'::jsonb),
  ('production_blocked','true'::jsonb),
  ('release_channel','"qa"'::jsonb),
  ('m10_gate',jsonb_build_object(
    'environment','QA',
    'real_data_allowed',false,
    'production_blocked',true,
    'purpose','RC74.4 isolated authenticated write/RLS canary'
  ))
on conflict (key) do update
set value=excluded.value, updated_at=now();

do $qa_guard$
declare
  v_env jsonb;
begin
  v_env := public.iberfit_environment();

  if coalesce(v_env->>'environment','') <> 'QA' then
    raise exception 'M26_RC74_4_QA_ENVIRONMENT_REQUIRED';
  end if;

  if coalesce((v_env->>'realDataAllowed')::boolean,true) is not false then
    raise exception 'M26_RC74_4_REAL_DATA_MUST_BE_BLOCKED';
  end if;

  if coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'M26_RC74_4_PRODUCTION_BLOCK_REQUIRED';
  end if;
end
$qa_guard$;
