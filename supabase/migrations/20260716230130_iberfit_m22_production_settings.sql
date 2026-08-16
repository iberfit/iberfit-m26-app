insert into public.iberfit_system_settings(key,value) values
 ('environment','"PRODUCTION"'::jsonb),
 ('real_data_allowed','true'::jsonb),
 ('production_blocked','false'::jsonb),
 ('release_channel','"production"'::jsonb),
 ('m10_gate',jsonb_build_object('environment','PRODUCTION','real_data_allowed',true,'production_blocked',false))
on conflict (key) do update set value=excluded.value, updated_at=now();;
