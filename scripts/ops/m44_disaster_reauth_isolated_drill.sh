#!/usr/bin/env bash
# M44 disaster recovery rehearsal: invalidate OLD refresh/session credentials
# only in a short-lived clone of an already restored PROD snapshot on LOCAL PG17.
# Does NOT rotate PROD JWT, contact Hosted Auth, send mail, or touch users.
set -euo pipefail
fail(){ printf 'M44_DISASTER_REAUTH_DRILL_%s\n' "$1" >&2; exit 78; }
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux &&
   "${GITHUB_REPOSITORY:-}" == iberfit/iberfit-m26-app &&
   "${M44_DISASTER_REAUTH_DRILL_ENABLED:-}" == true ]] || fail CI_ISOLATION_REQUIRED
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGPORT:-}" == 5432 &&
   "${PGUSER:-}" == supabase_admin && "${PGDATABASE:-}" == iberfit_recovery_test &&
   -n "${PGPASSWORD:-}" ]] || fail LOCAL_DATABASE_REQUIRED
for name in SUPABASE_ACCESS_TOKEN IBERFIT_PROD_DATABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY IBERFIT_PROD_STORAGE_SERVICE_KEY \
  SUPABASE_DB_URL DATABASE_URL; do
  [[ -z "${!name:-}" ]] || fail LIVE_CREDENTIALS_FORBIDDEN
done
[[ "$#" == 1 && -n "${RUNNER_TEMP:-}" &&
   "$1" == "$RUNNER_TEMP/iberfit-recovery/isolated" &&
   -d "$1" && ! -L "$1" ]] || fail RESTORE_PATH_INVALID
[[ "$(docker inspect --format '{{.State.Running}}' iberfit-m44-local-restore 2>/dev/null)" == true ]] ||
  fail RESTORE_CONTAINER_NOT_RUNNING
[[ "$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostIp}}' iberfit-m44-local-restore 2>/dev/null)" == 127.0.0.1 ]] ||
  fail RESTORE_CONTAINER_NOT_LOCALHOST
umask 077
scratch="$1/disaster-reauth-private"
mkdir -m 700 -p "$scratch"
clone=iberfit_m44_disaster_reauth_test
# Preserve stdin for the transaction sent to psql via heredoc below.
# Without -i Docker closes stdin; psql exits 0 having executed NO SQL.
pg(){ docker run --rm -i --network host \
  -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER \
  postgres:17-alpine "$@"; }
cleanup(){
  pg dropdb --if-exists --force -h 127.0.0.1 -p 5432 -U supabase_admin "$clone" \
    >"$scratch/cleanup-private.log" 2>&1 || true
}
# The snapshot source remains unchanged. Clone and ALL data changes are LOCAL.
[[ "$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d postgres \
  -c "SELECT (current_database()='postgres' AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='$clone'))::int;" \
  2>"$scratch/preflight-private.log")" == 1 ]] || fail CLONE_ALREADY_EXISTS
pg createdb -h 127.0.0.1 -p 5432 -U supabase_admin \
  --template=iberfit_recovery_test "$clone" >"$scratch/create-private.log" 2>&1 ||
  fail RESTORED_SNAPSHOT_CLONE_FAILED
trap cleanup EXIT
# No identifiers, sessions, emails, password hashes or tokens leave PG17.
counts_sql="SELECT concat_ws(',',
 (SELECT count(*) FROM auth.users),
 (SELECT count(*) FROM auth.identities),
 (SELECT count(*) FROM auth.mfa_factors),
 (SELECT count(*) FROM auth.webauthn_credentials),
 (SELECT count(*) FROM auth.sessions),
 (SELECT count(*) FROM auth.refresh_tokens));"
before="$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d "$clone" -c "$counts_sql" \
  2>"$scratch/before-private.log")" || fail COUNTS_BEFORE_FAILED
IFS=',' read -r users identities factors webauthn sessions refresh <<< "$before"
for value in "$users" "$identities" "$factors" "$webauthn" "$sessions" "$refresh"; do
  [[ "$value" =~ ^[0-9]+$ ]] || fail COUNTS_INVALID
done
[[ "$users" -gt 0 && "$identities" -gt 0 && "$sessions" -gt 0 && "$refresh" -gt 0 ]] ||
  fail REPRESENTATIVE_AUTH_STATE_MISSING
# Restored-session logout is ONLY for an actual disaster recovery deployment.
# Deleting all refresh tokens, including records with session_id NULL, is
# needed: an asymmetric signing key change alone does NOT revoke refresh tokens.
# Only the clone's DB name is accepted and checked again inside this txn.
pg psql -X -q -v ON_ERROR_STOP=1 -d "$clone" \
  >"$scratch/invalidate-private.log" 2>&1 <<'SQL' || fail ISOLATED_INVALIDATION_FAILED
BEGIN;
DO $guard$
BEGIN
 IF current_database() <> 'iberfit_m44_disaster_reauth_test' OR
    (SELECT value#>>'{}' FROM public.iberfit_system_settings
            WHERE key='environment') IS DISTINCT FROM 'PRODUCTION' THEN
   RAISE EXCEPTION 'M44_ISOLATED_DISASTER_REAUTH_TARGET_DENIED';
 END IF;
END $guard$;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;
COMMIT;
SQL
after="$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d "$clone" -c "$counts_sql" \
  2>"$scratch/after-private.log")" || fail COUNTS_AFTER_FAILED
IFS=',' read -r users_after identities_after factors_after webauthn_after sessions_after refresh_after <<< "$after"
# Diagnose category only: never print source counts or private identifiers.
[[ "$users_after" == "$users" ]] || fail USERS_COUNT_CHANGED
[[ "$identities_after" == "$identities" ]] || fail IDENTITIES_COUNT_CHANGED
[[ "$factors_after" == "$factors" ]] || fail MFA_FACTORS_COUNT_CHANGED
[[ "$webauthn_after" == "$webauthn" ]] || fail WEBAUTHN_CREDENTIALS_COUNT_CHANGED
[[ "$sessions_after" == 0 ]] || fail SESSIONS_NOT_INVALIDATED
[[ "$refresh_after" == 0 ]] || fail REFRESH_TOKENS_NOT_INVALIDATED
# Verify the unmodified recovery source still retains every original session.
source_counts="$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d iberfit_recovery_test -c "$counts_sql" \
  2>"$scratch/source-private.log")" || fail ORIGINAL_RESTORE_COUNTS_FAILED
[[ "$source_counts" == "$before" ]] || fail ORIGINAL_RESTORE_MUTATED
pg dropdb --force -h 127.0.0.1 -p 5432 -U supabase_admin "$clone" \
  >"$scratch/drop-private.log" 2>&1 || fail DISASTER_CLONE_CLEANUP_FAILED
[[ "$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d postgres \
  -c "SELECT (NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='$clone'))::int;" \
  2>"$scratch/absence-private.log")" == 1 ]] || fail DISASTER_CLONE_STILL_PRESENT
trap - EXIT
printf '%s\n' 'M44_ISOLATED_DISASTER_REAUTH_SESSIONS_PURGED_IDENTITY_MFA_PRESERVED_ONLY'
printf '%s\n' 'M44_HOSTED_AUTH_JWT_SMTP_EDGE_RUNTIME_NOT_CERTIFIED'
