begin;

-- Public wrappers intentionally call a small set of SECURITY DEFINER helpers
-- in the private schema. Authenticated users need schema USAGE and EXECUTE
-- only on those helpers; anonymous users remain blocked.
grant usage on schema private to authenticated;

grant execute on function private.iberfit_role() to authenticated;
grant execute on function private.iberfit_client_id() to authenticated;
grant execute on function private.is_assigned_coach(uuid) to authenticated;

revoke all on schema private from anon;
revoke execute on function private.iberfit_role() from anon;
revoke execute on function private.iberfit_client_id() from anon;
revoke execute on function private.is_assigned_coach(uuid) from anon;

commit;;
