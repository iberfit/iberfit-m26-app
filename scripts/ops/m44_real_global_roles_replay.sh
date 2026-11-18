#!/usr/bin/env bash
# Rehearse real M44 global roles in new isolated PG17, NEVER on PROD/QA.
# This does not certify Hosted Auth, JWT, Vault, Edge, or app-level RLS.
set -euo pipefail
fail(){ echo "M44_REAL_GLOBAL_ROLES_$1" >&2; exit 61; }
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]] || fail RUNNER_REQUIRED
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] || fail RUN_ID_INVALID
archive="${IBERFIT_M44_ROLES_FILE:-}"
[[ -n "$archive" && "$archive" == /* && -f "$archive" && ! -L "$archive" ]] || fail SOURCE_REQUIRED
[[ "$archive" == "${RUNNER_TEMP:-/not-valid}/iberfit-recovery/isolated/global-roles.sql" ]] || fail SOURCE_OUTSIDE_PRIVATE_RESTORE
[[ "$(stat -c '%a' "$archive")" =~ ^[0-7]*[0-6]00$|^[0-6]00$ ]] || fail FILE_PRIVACY_INVALID
command -v docker >/dev/null 2>&1 || fail DOCKER_REQUIRED
command -v openssl >/dev/null 2>&1 || fail ENTROPY_REQUIRED
node scripts/ops/m44_global_roles_archive_check.mjs "$archive" >/dev/null || fail SOURCE_FORMAT_INVALID
expected="$(awk '/^CREATE ROLE /{n++} END{print n+0}' "$archive")"
[[ "$expected" =~ ^[0-9]+$ ]] && (( expected>=8 && expected<=60 )) || fail SOURCE_COUNT_INVALID
umask 077
work="$(mktemp -d "${RUNNER_TEMP}/m44-real-global.XXXXXXXX")"
chmod 700 "$work"
name="iberfit-m44-roles-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
cleanup(){ docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
credential=$(openssl rand -hex 32)
[[ "${#credential}" == 64 ]] || fail ENTROPY_INVALID
export POSTGRES_PASSWORD PGPASSWORD
POSTGRES_PASSWORD=$credential
PGPASSWORD=$credential
docker run -d --rm --pull=always --network none --security-opt no-new-privileges \
  --name "$name" -e POSTGRES_USER=m44_restore_admin -e POSTGRES_DB=postgres \
  -e POSTGRES_PASSWORD postgres:17-alpine >"$work/start.log" 2>&1 || fail START_FAILED
[[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$name")" == none ]] || fail NETWORK_NOT_ISOLATED
[[ -z "$(docker port "$name")" ]] || fail PORT_EXPOSED
ready=false
for _ in $(seq 1 60); do
  if docker exec "$name" pg_isready -h 127.0.0.1 -U m44_restore_admin -d postgres >"$work/ready.log" 2>&1; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]] || fail PG17_NOT_READY
docker cp "$archive" "$name:/tmp/global-roles.sql" >"$work/copy.log" 2>&1 || fail COPY_FAILED
docker exec -u root "$name" sh -c 'chown postgres:postgres /tmp/global-roles.sql && chmod 0400 /tmp/global-roles.sql' >"$work/mode.log" 2>&1 || fail PRIVATE_MODE_FAILED
if ! docker exec -e PGPASSWORD "$name" psql -X -q -v ON_ERROR_STOP=1 \
  -v VERBOSITY=sqlstate \
  -h 127.0.0.1 -U m44_restore_admin -d postgres -f /tmp/global-roles.sql \
  >"$work/replay.log" 2>&1; then
  # PostgreSQL's SQLSTATE-only verbosity prevents leaking role names, SQL,
  # paths, or secrets. Output at most one validated five-character class.
  state="$(grep -Eo 'ERROR:[[:space:]]+[0-9A-Z]{5}' "$work/replay.log" \
      | tail -n 1 | grep -Eo '[0-9A-Z]{5}
actual="$(docker exec -e PGPASSWORD "$name" psql -X -A -t -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U m44_restore_admin -d postgres \
  -c "SELECT count(*) FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname <> 'm44_restore_admin';" \
  2>"$work/readback.log")" || fail READBACK_FAILED
[[ "$actual" == "$expected" ]] || fail ROLE_CARDINALITY_DRIFT
ok="$(docker exec -e PGPASSWORD "$name" psql -X -A -t -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U m44_restore_admin -d postgres \
  -c "SELECT (EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') AND
              EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon' AND NOT rolcanlogin) AND
              EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated' AND NOT rolcanlogin) AND
              EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role'))::int;" \
  2>"$work/role-check.log")" || fail REQUIRED_ROLE_CHECK_FAILED
[[ "$ok" == 1 ]] || fail REQUIRED_ROLES_MISSING
echo M44_REAL_GLOBAL_ROLES_RESTORED_IN_ISOLATED_PG17_ONLY
echo M44_HOSTED_AUTH_VAULT_EDGE_AND_EFFECTIVE_RLS_NOT_CERTIFIED
 || true)"
  if [[ "$state" =~ ^[A-Z0-9]{5}$ ]]; then
    echo "M44_REAL_ROLES_REPLAY_SQLSTATE:$state" >&2
  else
    echo 'M44_REAL_ROLES_REPLAY_SQLSTATE:UNAVAILABLE' >&2
  fi
  fail REAL_ROLES_REPLAY_FAILED
fi
actual="$(docker exec -e PGPASSWORD "$name" psql -X -A -t -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U m44_restore_admin -d postgres \
  -c "SELECT count(*) FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname <> 'm44_restore_admin';" \
  2>"$work/readback.log")" || fail READBACK_FAILED
[[ "$actual" == "$expected" ]] || fail ROLE_CARDINALITY_DRIFT
ok="$(docker exec -e PGPASSWORD "$name" psql -X -A -t -v ON_ERROR_STOP=1 \
  -h 127.0.0.1 -U m44_restore_admin -d postgres \
  -c "SELECT (EXISTS(SELECT 1 FROM pg_roles WHERE rolname='postgres') AND
              EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon' AND NOT rolcanlogin) AND
              EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated' AND NOT rolcanlogin) AND
              EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role'))::int;" \
  2>"$work/role-check.log")" || fail REQUIRED_ROLE_CHECK_FAILED
[[ "$ok" == 1 ]] || fail REQUIRED_ROLES_MISSING
echo M44_REAL_GLOBAL_ROLES_RESTORED_IN_ISOLATED_PG17_ONLY
echo M44_HOSTED_AUTH_VAULT_EDGE_AND_EFFECTIVE_RLS_NOT_CERTIFIED
