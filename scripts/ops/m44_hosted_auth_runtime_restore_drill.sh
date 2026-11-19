#!/usr/bin/env bash
# M44: GoTrue + SMTP recovery rehearsal against a disposable CLONE of genuine
# recovered PG17 data, on an internal Docker network with no internet route.
# Never changes PROD, QA, original restored snapshot, signing keys or users.
set -euo pipefail
umask 077
fail(){ printf 'M44_AUTH_RUNTIME_DRILL_%s\n' "$1" >&2; exit 79; }
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux &&
   "${GITHUB_REPOSITORY:-}" == iberfit/iberfit-m26-app &&
   "${M44_AUTH_RUNTIME_DRILL_ENABLED:-}" == true ]] || fail RUNNER_INVALID
[[ "${PGHOST:-}" == 127.0.0.1 && "${PGPORT:-}" == 5432 &&
   "${PGUSER:-}" == supabase_admin &&
   "${PGDATABASE:-}" == iberfit_recovery_test &&
   "${PGPASSWORD:-}" =~ ^[a-f0-9]{64}$ ]] || fail LOCAL_DATABASE_INVALID
[[ "$#" == 1 && -n "${RUNNER_TEMP:-}" &&
   "$1" == "$RUNNER_TEMP/iberfit-recovery/isolated" &&
   -d "$1" && ! -L "$1" ]] || fail RESTORE_PATH_INVALID
for name in SUPABASE_ACCESS_TOKEN IBERFIT_PROD_DATABASE_URL SUPABASE_DB_URL \
  DATABASE_URL SUPABASE_SERVICE_ROLE_KEY IBERFIT_PROD_STORAGE_SERVICE_KEY \
  IBERFIT_BACKUP_PASSPHRASE IBERFIT_PROD_STORAGE_URL; do
 [[ -z "${!name:-}" ]] || fail LIVE_CREDENTIALS_FORBIDDEN
done
[[ "$(docker inspect --format '{{.State.Running}}' iberfit-m44-local-restore 2>/dev/null)" == true ]] ||
  fail RECOVERED_PG17_NOT_RUNNING
[[ "$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostIp}}' iberfit-m44-local-restore 2>/dev/null)" == 127.0.0.1 ]] ||
  fail PG17_NOT_BOUND_LOOPBACK
scratch="$1/m44-hosted-auth-private"
mkdir -m 700 -p "$scratch"
clone=iberfit_m44_hosted_auth_runtime_test
net=iberfit-m44-hosted-recovery-internal
mail=iberfit-m44-smtp-isolated
auth=iberfit-m44-gotrue-isolated
pg(){ docker run --rm --network host -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD postgres:17-alpine "$@"; }
cleanup(){
 set +e
 docker rm -f "$auth" "$mail" >"$scratch/containers-cleanup-private.log" 2>&1
 docker network disconnect -f "$net" iberfit-m44-local-restore > /dev/null 2>&1
 docker network rm "$net" > /dev/null 2>&1
 pg dropdb --if-exists --force -h 127.0.0.1 -p 5432 -U supabase_admin "$clone" \
   >"$scratch/db-cleanup-private.log" 2>&1
 rm -f "$scratch/jwt-private.json" "$scratch/startup-private.log"
}
# No network / database mutation may happen until original backup is present and
# clone name is proven unused. This script only accepts an already restored DB.
[[ "$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d postgres \
 -c "SELECT (to_regclass('pg_catalog.pg_database') IS NULL OR NOT EXISTS
   (SELECT 1 FROM pg_database WHERE datname='$clone'))::int;" 2>"$scratch/db-check-private.log")" == 1 ]] ||
  fail CLONE_EXISTS
pg createdb -h 127.0.0.1 -p 5432 -U supabase_admin \
  --template=iberfit_recovery_test "$clone" >"$scratch/clone-private.log" 2>&1 ||
  fail RESTORED_CLONE_FAILED
trap cleanup EXIT
# Invalidate old sessions only in new clone, not in original archive or LIVE.
pg psql -X -q -v ON_ERROR_STOP=1 -d "$clone" \
 >"$scratch/invalidate-private.log" 2>&1 <<'SQL' || fail CLONE_AUTH_INVALIDATION_FAILED
BEGIN;
DO $guard$
BEGIN
 IF current_database()<>'iberfit_m44_hosted_auth_runtime_test' OR
   (SELECT value#>>'{}' FROM public.iberfit_system_settings
    WHERE key='environment') IS DISTINCT FROM 'PRODUCTION' THEN
  RAISE EXCEPTION 'M44_LOCAL_CLONE_ONLY';
 END IF;
END $guard$;
DELETE FROM auth.refresh_tokens;
DELETE FROM auth.sessions;
COMMIT;
SQL
[[ "$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d "$clone" \
 -c 'SELECT ((SELECT count(*) FROM auth.sessions)=0 AND (SELECT count(*) FROM auth.refresh_tokens)=0)::int' \
 2>"$scratch/auth-check-private.log")" == 1 ]] || fail OLD_SESSIONS_REMAIN
# No Internet route for GoTrue, SMTP or the client probe. No host port exposed.
docker network create --internal "$net" > /dev/null 2>"$scratch/network-private.log" ||
  fail INTERNAL_NETWORK_CREATION_FAILED
[[ "$(docker network inspect --format '{{.Internal}}' "$net")" == true ]] ||
  fail EXTERNAL_NETWORK_REJECTED
docker network connect --alias m44db "$net" iberfit-m44-local-restore \
  > /dev/null 2>"$scratch/network-connect-private.log" ||
  fail LOCAL_DATABASE_LINK_FAILED
# Use a local SMTP sink, never send any message to a real address.
docker run -d --name "$mail" --network "$net" --cap-drop ALL \
 --tmpfs /tmp:rw,noexec,nosuid,size=32m \
 -e MP_DATABASE=/tmp/m44-mailpit.db -e MP_SMTP_AUTH_ACCEPT_ANY=true \
 -e MP_SMTP_AUTH_ALLOW_INSECURE=true \
 axllent/mailpit:v1.27.2 > /dev/null 2>"$scratch/smtp-start-private.log" ||
 fail LOCAL_SMTP_START_FAILED
# Fresh private signing material is generated entirely in this runner. NEVER
# copies the existing PROD JWKS private part, credentials or SMTP passwords.
node --input-type=module -e '
import {generateKeyPairSync,randomUUID} from "node:crypto";
import {writeFileSync} from "node:fs";
const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
const key=pair.privateKey.export({format:"jwk"});
writeFileSync(process.argv[1],JSON.stringify([{...key,kid:randomUUID(),
 alg:"ES256",key_ops:["sign","verify"],use:"sig"}]),{mode:0o600});
' "$scratch/jwt-private.json" > /dev/null 2>"$scratch/keygen-private.log" ||
 fail SYNTHETIC_JWT_SIGNING_KEY_FAILED
GOTRUE_JWT_KEYS="$(cat "$scratch/jwt-private.json")"
GOTRUE_JWT_SECRET="$(openssl rand -hex 32)"
export GOTRUE_JWT_KEYS GOTRUE_JWT_SECRET
GOTRUE_DB_DATABASE_URL="postgres://supabase_admin:${PGPASSWORD}@m44db:5432/${clone}?sslmode=disable"
export GOTRUE_DB_DATABASE_URL
docker run -d --name "$auth" --network "$net" --cap-drop ALL \
 --tmpfs /tmp:rw,nosuid,size=32m \
 -e GOTRUE_JWT_KEYS -e GOTRUE_JWT_SECRET -e GOTRUE_DB_DATABASE_URL \
 -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9999 \
 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_SITE_URL=http://m44-auth:9999 \
 -e API_EXTERNAL_URL=http://m44-auth:9999 \
 -e GOTRUE_JWT_ISSUER=http://m44-auth:9999 \
 -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_EXP=3600 \
 -e GOTRUE_DISABLE_SIGNUP=false -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
 -e GOTRUE_MAILER_AUTOCONFIRM=false \
 -e GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true \
 -e GOTRUE_SMTP_HOST="$mail" -e GOTRUE_SMTP_PORT=1025 \
 -e GOTRUE_SMTP_USER=only-local -e GOTRUE_SMTP_PASS=only-local \
 -e GOTRUE_SMTP_ADMIN_EMAIL=m44@example.invalid \
 -e GOTRUE_SMTP_SENDER_NAME=IBERFIT-DR-LOCAL \
 --network-alias m44-auth \
 supabase/gotrue:v2.197.0 > /dev/null 2>"$scratch/auth-start-private.log" ||
 fail GOTRUE_START_FAILED
unset GOTRUE_JWT_KEYS GOTRUE_JWT_SECRET GOTRUE_DB_DATABASE_URL
# All HTTP calls remain on this Docker --internal network, run only on a
# synthetic .invalid identity, and do not print tokens, emails or response JSON.
if ! docker run --rm --network "$net" --cap-drop ALL --read-only \
 -v "$PWD/scripts/ops/m44_isolated_auth_roundtrip.mjs:/work/probe.mjs:ro" \
 node:22-alpine node /work/probe.mjs \
 >"$scratch/http-private.log" 2>&1; then
 fail HOSTED_AUTH_SMTP_ROUNDTRIP_FAILED
fi
# The original independent restore remains intact throughout the rehearsal.
[[ "$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d iberfit_recovery_test \
 -c "SELECT ((SELECT count(*) FROM auth.sessions)>0 AND (SELECT count(*) FROM auth.users)>0)::int" \
 2>"$scratch/source-check-private.log")" == 1 ]] ||
 fail ORIGINAL_RESTORED_AUTH_CHANGED
cleanup
trap - EXIT
printf '%s\n' 'M44_ISOLATED_GOTRUE_ES256_SMTP_AUTH_ROUNDTRIP_VERIFIED_ONLY'
printf '%s\n' 'M44_HOSTED_PLATFORM_AND_EDGE_RUNTIME_NOT_CERTIFIED'
