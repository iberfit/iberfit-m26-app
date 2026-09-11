# IBERFIT Security Advisor classification · 2026-09-11

This record classifies the live Supabase Security Advisor findings observed in PROD
(`pjhmrhejsoofmouedavw`) while keeping authorization fail-closed. It is evidence,
not an allowlist: any new object, new grant, changed function body, or increased count
requires review.

## RLS enabled with no policy · 26 objects

Twenty-five objects have **no direct table privileges for `anon` or
`authenticated`**. Their no-policy state is intentionally deny-all and access is
mediated by narrow RPCs / backend functions.

The one outlier was `public.active_execution_locks_v26`, which still had redundant
`SELECT`, `REFERENCES`, and `TRIGGER` grants for both roles despite RLS having
no policy. Migration
`20260911135500_active_execution_locks_least_privilege_v1.sql` revokes those
unnecessary grants while preserving the guarded command RPC surface.

Do not create RLS policies merely to silence this INFO finding.

## Anonymous SECURITY DEFINER · 2 intentional public catalog RPCs

### iberfit_exercise_catalog_public_v1(integer, integer)

Intentional public read surface for IBERFIT exercise catalog content only.

Live contract reviewed:
- `SECURITY DEFINER` with empty `search_path`;
- source is `public.exercise_catalog` plus exercise-name translations only;
- only active, non-retired catalog rows are returned;
- page size is capped at 200 and offset is non-negative;
- no user, organization, health, session, token, or tenant data is joined.

Keeping the underlying catalog private while exposing a curated bounded RPC is safer
than granting anonymous direct-table access.

### iberfit_exercise_media_manifest_v1()

Intentional public manifest for approved IBERFIT-owned exercise media.

Live contract reviewed:
- `SECURITY DEFINER` with empty `search_path`;
- source is exercise catalog data only;
- requires active, approved, published media;
- validates IBERFIT visual schema/style/bucket, approved QA state, visibility,
  MIME allowlist, bounded path length, exercise-id path prefix, and rejects `..`;
- no user, organization, health, session, token, or tenant data is joined.

Any future private join or removal of these filters invalidates this classification.

## Authenticated SECURITY DEFINER · 37

All 37 live functions were verified with an empty `search_path`; anonymous EXECUTE
is absent except for the two intentionally public catalog RPCs above.

They are grouped as follows and remain subject to regression tests:

- privileged Admin/invitation mutations: require privileged assurance plus
  Admin/Coach authorization and relevant organization/client scope;
- command/mutation execution: narrow command registry, identity/idempotency and
  client-scope guards;
- bootstrap/context/read helpers: derive the authenticated actor's permitted role,
  application, organization and/or client context;
- IRI/report and appointment operations: guarded client access and privileged
  mutation paths where appropriate;
- telemetry functions: actor/client access helpers and bounded import/read/delete
  contracts;
- custom exercise creation: authenticated Coach/Admin only, validated bounded
  inputs, duplicate serialization, and no direct table INSERT grant;
- public exercise catalog/media functions: classified separately above.

The PROD-vs-QA count difference (37 vs 33 at review time) is explained by three
client-invitation activation RPCs and `iberfit_create_custom_exercise_v1`, which
are present in PROD product functionality and have dedicated source-contract tests.

No bulk revoke or bulk conversion to `SECURITY INVOKER` is permitted. Each function
must retain or improve its consumer authorization contract.

## Leaked password protection · unresolved external Auth setting

Security Advisor reports Supabase leaked-password protection disabled.

Current Supabase documentation states:
- the feature rejects passwords found through the HaveIBeenPwned Pwned Passwords API;
- it is configured in hosted Auth settings;
- it is available on Pro Plan and above;
- strengthened password requirements can affect existing users at password sign-in
  and password-change flows, so QA validation is required before production.

This is **not** a SQL migration setting and must not be approximated by database DDL.
The current ChatGPT Supabase connector exposes database/project/function/advisor
operations but no hosted Auth-configuration mutation. Enabling it therefore requires
authorized hosted Auth/Management configuration, followed by QA checks for sign-in,
recovery, password change and existing-user compatibility before PROD.

Until that external setting is enabled and verified, this warning remains open rather
than being mislabeled as resolved.
