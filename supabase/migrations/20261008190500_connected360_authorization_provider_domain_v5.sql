-- Connected 360 v5: allow the eight RC44 providers in the generation table.
-- Do not change the v44 policy_version constraint, RLS or client isolation.
-- IBERFIT-POLICY: public.m26_wearable_authorization_v2 = rls-client
begin;
alter table public.m26_wearable_authorization_v2
  drop constraint m26_wearable_authorization_v2_provider_check;
alter table public.m26_wearable_authorization_v2
  add constraint m26_wearable_authorization_v2_provider_check
  check (provider in (
    'normalized_file','health_connect','samsung_health','apple_health',
    'strava','garmin_connect','fitbit','oura'
  ));
commit;
