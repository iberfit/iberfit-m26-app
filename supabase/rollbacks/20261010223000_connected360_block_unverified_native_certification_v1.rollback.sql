-- Emergency rollback ONLY after an independently certified replacement fence.
-- Running this alone removes protection against spoofed certified_native claims.
begin;
drop trigger if exists m26_wearable_connections_certification_guard_v1
  on public.m26_wearable_connections_v44;
drop function if exists public.m26_wearable_connection_certification_guard_v1();
commit;
