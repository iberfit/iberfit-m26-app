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
# The guarded SQL transaction is sent to psql on stdin. Docker must keep
# stdin open; without -i psql can exit 0 without executing any DELETE.
pg(){ docker run --rm -i --network host -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD postgres:17-alpine "$@"; }
cleanup(){
 set +e
 docker rm -f "$auth" "$mail" >"$scratch/containers-cleanup-private.log" 2>&1
 docker network disconnect -f "$net" iberfit-m44-local-restore > /dev/null 2>&1
 docker network rm "$net" > /dev/null 2>&1
 pg dropdb --if-exists --force -h 127.0.0.1 -p 5432 -U supabase_admin "$clone" \
   >"$scratch/db-cleanup-private.log" 2>&1
 rm -f "$scratch/jwt-private.json" "$scratch/startup-private.log" \
  "$scratch/m44-smtp-private.key" "$scratch/m44-smtp-cert.pem"
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
# Generate one-day ephemeral TLS identity with SAN exactly matching the isolated
# Docker SMTP name. Its public self-signed cert is GoTrue's ONLY local trust
# anchor (SSL_CERT_FILE); no public CA, external SMTP or live key involved.
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
 -subj '/CN=iberfit-m44-smtp-isolated' \
 -addext 'subjectAltName=DNS:iberfit-m44-smtp-isolated' \
 -addext 'extendedKeyUsage=serverAuth' \
 -keyout "$scratch/m44-smtp-private.key" \
 -out "$scratch/m44-smtp-cert.pem" \
 >"$scratch/smtp-tls-private.log" 2>&1 || fail LOCAL_SMTP_TLS_GENERATION_FAILED
chmod 600 "$scratch/m44-smtp-private.key"
chmod 644 "$scratch/m44-smtp-cert.pem"
# Use a local SMTP sink, never send any message to a real address.
docker run -d --name "$mail" --network "$net" --cap-drop ALL \
 --user "$(id -u):$(id -g)" \
 --tmpfs /tmp:rw,noexec,nosuid,mode=1777,size=32m \
 -v "$scratch/m44-smtp-private.key:/certs/smtp-private.key:ro" \
 -v "$scratch/m44-smtp-cert.pem:/certs/smtp-cert.pem:ro" \
 -e MP_DATABASE=/tmp/m44-mailpit.db -e MP_DISABLE_VERSION_CHECK=true \
 -e MP_SMTP_AUTH_ACCEPT_ANY=true -e MP_SMTP_REQUIRE_STARTTLS=true \
 -e MP_SMTP_TLS_CERT=/certs/smtp-cert.pem -e MP_SMTP_TLS_KEY=/certs/smtp-private.key \
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
# Unique synthetic local-SMTP credential per rehearsal, never fixed in source.
GOTRUE_SMTP_PASS="$(openssl rand -hex 32)"
export GOTRUE_SMTP_PASS
GOTRUE_DB_DATABASE_URL="postgres://supabase_admin:${PGPASSWORD}@m44db:5432/${clone}?sslmode=disable"
export GOTRUE_DB_DATABASE_URL
docker run -d --name "$auth" --network "$net" --cap-drop ALL \
 --tmpfs /tmp:rw,nosuid,size=32m \
 -v "$scratch/m44-smtp-cert.pem:/certs/smtp-ca.pem:ro" \
 -e SSL_CERT_FILE=/certs/smtp-ca.pem \
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
 -e GOTRUE_SMTP_USER=only-local -e GOTRUE_SMTP_PASS \
 -e GOTRUE_SMTP_ADMIN_EMAIL=m44-recovery-sink@gmail.com \
 -e GOTRUE_SMTP_SENDER_NAME=IBERFIT-DR-LOCAL \
 --network-alias m44-auth \
 supabase/gotrue:v2.197.0 > /dev/null 2>"$scratch/auth-start-private.log" ||
 fail GOTRUE_START_FAILED
unset GOTRUE_JWT_KEYS GOTRUE_JWT_SECRET GOTRUE_DB_DATABASE_URL GOTRUE_SMTP_PASS
# All HTTP calls remain on this Docker --internal network, run only on a
# synthetic .invalid identity, and do not print tokens, emails or response JSON.
probe_started="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
if ! docker run --rm --network "$net" --cap-drop ALL --read-only \
 -v "$PWD/scripts/ops/m44_isolated_auth_roundtrip.mjs:/work/probe.mjs:ro" \
 node:22-alpine node /work/probe.mjs \
 >"$scratch/http-private.log" 2>&1; then
 # The synthetic probe emits only a bounded failure category.
 # Never print the actual HTTP, SMTP, JWT or GoTrue private log.
 safe_failure="$(grep -Eom1 '^M44_AUTH_PROBE_[A-Z0-9_]{3,70}$' "$scratch/http-private.log" || true)"
 if [[ -z "$safe_failure" ]]; then safe_failure=M44_AUTH_PROBE_UNKNOWN_ERROR; fi
 printf '%s\n' "$safe_failure" >&2
 # GoTrue's private log stays on this isolated runner. Only a closed-set
 # diagnostic category crosses CI; never print raw lines or their values.
 docker logs --since "$probe_started" "$auth" > "$scratch/gotrue-failure-private.log" 2>&1 || true
 log_reason=UNCLASSIFIED
 if grep -Eiq 'permission denied|insufficient privilege|SQLSTATE.?42501' "$scratch/gotrue-failure-private.log"; then
  log_reason=DB_PERMISSION
 elif grep -Eiq 'database error|SQLSTATE.?[0-9A-Z]{5}|pq:|duplicate key|violates.*constraint|relation .* does not exist' "$scratch/gotrue-failure-private.log"; then
  log_reason=DB_ERROR
 elif grep -Eiq 'smtp.*(535|authenticat)|535[ -].*authenticat|authentication credentials invalid|invalid.*smtp.*credential' "$scratch/gotrue-failure-private.log"; then
  log_reason=SMTP_AUTH
 elif grep -Eiq 'dial tcp.*(refused|timeout)|connect: connection refused|connect: network is unreachable|no such host' "$scratch/gotrue-failure-private.log"; then
  log_reason=SMTP_CONNECT
 elif grep -Eiq 'starttls|tls handshake|x509:|certificate.*(invalid|verify)|unencrypted connection' "$scratch/gotrue-failure-private.log"; then
  log_reason=SMTP_TLS
 elif grep -Eiq 'smtp.*(fail|error|refused)|gomail:|mailer.*(fail|error)|send.*email.*(fail|error)|send.*mail.*(fail|error)' "$scratch/gotrue-failure-private.log"; then
  log_reason=SMTP_SEND
 elif grep -Eiq 'jwt.*(invalid|fail)|signing key.*(invalid|fail)' "$scratch/gotrue-failure-private.log"; then
  log_reason=JWT_ERROR
 fi
 printf 'M44_AUTH_RUNTIME_PRIVATE_CAUSE_%s\n' "$log_reason" >&2
 # Reveal only a whitelisted SQLSTATE class; never SQL error text.
 state="$(grep -Eom1 'SQLSTATE[^[:alnum:]]*[A-Z0-9]{5}' "$scratch/gotrue-failure-private.log" |
  grep -Eo '[A-Z0-9]{5}$' || true)"
 case "$state" in
  23502|23503|23505|42501|42703|42P01|42P10|42883|22023)
   printf 'M44_AUTH_RUNTIME_SQLSTATE_%s\n' "$state" >&2 ;;
 esac
 # Only on SQLSTATE 42703, classify the missing Auth schema column from
 # private clone-only logs using a fixed whitelist. Never emit raw SQL/logs.
 if [[ "$state" == 42703 ]]; then
  safe_column="$(node scripts/ops/m44_classify_gotrue_missing_column.mjs \
   "$scratch/gotrue-failure-private.log" 2>/dev/null || true)"
  if [[ "$safe_column" =~ ^M44_AUTH_RUNTIME_42703_COLUMN_[A-Z0-9_]{3,64}$ ]]; then
   printf '%s\n' "$safe_column" >&2
  fi
 fi
 # Read back only an aggregate of synthetic records inside the CLONE. This
 # distinguishes a valid confirmation from a failure redirect in GoTrue.
 confirmation="$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d "$clone" \
  -c "SELECT count(*)::text||':'||count(email_confirmed_at)::text
      FROM auth.users WHERE email LIKE 'm44-recovery-%@gmail.com';" \
  2>"$scratch/synthetic-email-private.log" || true)"
 case "$confirmation" in
  1:1) echo M44_AUTH_RUNTIME_SYNTHETIC_EMAIL_CONFIRMED_ONLY >&2 ;;
  1:0) echo M44_AUTH_RUNTIME_SYNTHETIC_EMAIL_UNCONFIRMED_ONLY >&2 ;;
  *) echo M44_AUTH_RUNTIME_SYNTHETIC_EMAIL_STATE_UNKNOWN >&2 ;;
 esac
 fail HOSTED_AUTH_SMTP_ROUNDTRIP_FAILED
fi
# Even if the browser probe reports success, confirmation must exist in actual
# restored Auth tables of this disposable database. No private values leave CI.
confirmed="$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d "$clone" \
 -c "SELECT (
   count(*)=1 AND count(email_confirmed_at)=1
  )::int FROM auth.users WHERE email LIKE 'm44-recovery-%@gmail.com';" \
  2>"$scratch/synthetic-confirm-private.log" || true)"
[[ "$confirmed" == 1 ]] || fail SYNTHETIC_EMAIL_CONFIRMATION_NOT_PERSISTED
# The original independent restore remains intact throughout the rehearsal.
[[ "$(pg psql -X -A -t -v ON_ERROR_STOP=1 -d iberfit_recovery_test \
 -c "SELECT ((SELECT count(*) FROM auth.sessions)>0 AND (SELECT count(*) FROM auth.users)>0)::int" \
 2>"$scratch/source-check-private.log")" == 1 ]] ||
 fail ORIGINAL_RESTORED_AUTH_CHANGED
cleanup
trap - EXIT
printf '%s\n' 'M44_ISOLATED_GOTRUE_ES256_SMTP_AUTH_ROUNDTRIP_VERIFIED_ONLY'
printf '%s\n' 'M44_HOSTED_PLATFORM_AND_EDGE_RUNTIME_NOT_CERTIFIED'
