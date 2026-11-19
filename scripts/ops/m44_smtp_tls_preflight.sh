#!/usr/bin/env bash
# Synthetic TLS+SMTP AUTH handshake; no Supabase, no SMTP messages sent.
set -euo pipefail
umask 077
[[ "$GITHUB_ACTIONS" == true && "$RUNNER_OS" == Linux &&
   "$GITHUB_REPOSITORY" == iberfit/iberfit-m26-app ]] || exit 79
net=iberfit-m44-smtp-preflight-internal
mail=iberfit-m44-smtp-preflight
scratch="$(mktemp -d "$RUNNER_TEMP/iberfit-m44-smtp.XXXXXXXX")"
cleanup(){
 set +e
 docker rm -f "$mail" > /dev/null 2>&1
 docker network rm "$net" > /dev/null 2>&1
 rm -rf "$scratch"
}
trap cleanup EXIT
docker network create --internal "$net" >/dev/null
[[ "$(docker network inspect --format '{{.Internal}}' "$net")" == true ]] || exit 79
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 1 \
 -subj '/CN=iberfit-m44-smtp-preflight' \
 -addext 'subjectAltName=DNS:iberfit-m44-smtp-preflight' \
 -addext 'extendedKeyUsage=serverAuth' \
 -keyout "$scratch/m44-smtp-private.key" \
 -out "$scratch/m44-smtp-cert.pem" \
 > "$scratch/tls-private.log" 2>&1
chmod 600 "$scratch/m44-smtp-private.key"
chmod 644 "$scratch/m44-smtp-cert.pem"
docker run -d --name "$mail" --network "$net" --cap-drop ALL \
 --user "$(id -u):$(id -g)" \
 --tmpfs /tmp:rw,noexec,nosuid,mode=1777,size=32m \
 -v "$scratch/m44-smtp-private.key:/certs/smtp-private.key:ro" \
 -v "$scratch/m44-smtp-cert.pem:/certs/smtp-cert.pem:ro" \
 -e MP_DATABASE=/tmp/m44-mailpit.db -e MP_DISABLE_VERSION_CHECK=true \
 -e MP_SMTP_AUTH_ACCEPT_ANY=true -e MP_SMTP_REQUIRE_STARTTLS=true \
 -e MP_SMTP_TLS_CERT=/certs/smtp-cert.pem -e MP_SMTP_TLS_KEY=/certs/smtp-private.key \
 axllent/mailpit:v1.27.2 > /dev/null 2>"$scratch/smtp-start-private.log" || exit 79
verified=false
for attempt in $(seq 1 12); do
 if docker run --rm -i --network "$net" --cap-drop ALL --read-only \
   -v "$scratch/m44-smtp-cert.pem:/certs/smtp-cert.pem:ro" \
   python:3.12-alpine python - >"$scratch/probe-private.log" 2>&1 <<'PY'
import smtplib
import ssl
host='iberfit-m44-smtp-preflight'
context=ssl.create_default_context(cafile='/certs/smtp-cert.pem')
with smtplib.SMTP(host,1025,timeout=4) as smtp:
    smtp.ehlo()
    if not smtp.has_extn('starttls'):
        raise RuntimeError('TLS_MISSING')
    smtp.starttls(context=context)
    smtp.ehlo()
    smtp.login('only-local','synthetic-local-only')
PY
 then verified=true; break; fi
 sleep 1
done
if [[ "$verified" != true ]]; then
 docker logs "$mail" > "$scratch/mailpit-private.log" 2>&1 || true
 if grep -Eiq 'permission denied|operation not permitted' "$scratch/mailpit-private.log"; then
   echo M44_SYNTHETIC_SMTP_FIXTURE_PERMISSION_DENIED >&2
 elif grep -Eiq 'certificate|tls|x509' "$scratch/mailpit-private.log"; then
   echo M44_SYNTHETIC_SMTP_FIXTURE_TLS_INVALID >&2
 elif [[ "$(docker inspect --format '{{.State.Running}}' "$mail" 2>/dev/null)" != true ]]; then
   echo M44_SYNTHETIC_SMTP_FIXTURE_CONTAINER_EXITED >&2
 else
   echo M44_SYNTHETIC_SMTP_FIXTURE_PROTOCOL_FAILED >&2
 fi
 exit 79
fi
echo M44_SYNTHETIC_SMTP_STARTTLS_AUTH_VERIFIED_ONLY
