-- IBERFIT · Security & Data Access 360 · Canary RPC least privilege v1
--
-- iberfit_canary_enabled_v26 is an internal capability lookup used by
-- SECURITY DEFINER command/validation functions. The authenticated frontend
-- does not call it directly. Keeping direct authenticated EXECUTE would expose
-- Canary-enrolment state as an unnecessary side channel.
--
-- Preserve service_role for trusted operational diagnostics. Internal
-- SECURITY DEFINER callers continue executing as their owner.

revoke all on function public.iberfit_canary_enabled_v26(uuid)
from public, anon, authenticated;

grant execute on function public.iberfit_canary_enabled_v26(uuid)
to service_role;

notify pgrst, 'reload schema';
