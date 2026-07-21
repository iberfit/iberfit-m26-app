# RC18 canary runbook

## Preconditions

1. Local CI is green.
2. Supabase project ref equals `pjhmrhejsoofmouedavw`.
3. The authenticated registry matches all expected definitions exactly.
4. Only the explicit QA client appears in the canary allowlist.
5. Coach and Client QA accounts pass bootstrap and role checks.
6. Rollback artifact M25.1 is available and hash-verified.

## Deployment

1. Create or select the dedicated Cloudflare Pages canary project.
2. Upload the verified RC18 web artifact.
3. Attach only `m26-canary.iberfit.cl`.
4. Confirm no commercial or production hostname was changed.
5. Record deployment ID, commit SHA, artifact SHA and UTC time.

## Observation

Execute login, bootstrap, IRI read, plan read, session publication preflight, session execution, offline interruption, resync, conflict inspection and logout for both roles. Avoid destructive tests on real clients.

## Stop conditions

Stop and roll back for any cross-client data, wrong role, missing RLS, catalog mismatch, unacknowledged mutation presented as confirmed, failed offline recovery, private-note offline persistence or unrecoverable UI error.
