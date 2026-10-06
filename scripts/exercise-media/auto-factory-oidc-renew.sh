#!/usr/bin/env bash
# Source from an individual Actions step to obtain a new, short-lived GitHub
# OIDC credential. Do not persist or log JWT contents outside GITHUB_ENV.
iberfit_refresh_auto_factory_oidc() {
  if [[ "${GITHUB_ACTIONS:-}" != 'true' || -z "${GITHUB_ENV:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" || -z "${ACTIONS_ID_TOKEN_REQUEST_TOKEN:-}" || -z "${OIDC_AUDIENCE:-}" ]]; then
    echo 'AUTO_FACTORY_OIDC_REFRESH_CONTEXT_INVALID' >&2
    return 1
  fi
  local sep='?'
  [[ "$ACTIONS_ID_TOKEN_REQUEST_URL" == *'?'* ]] && sep='&'
  local response token
  response="$(curl --fail --silent --show-error --connect-timeout 10 --max-time 30 \
    -H "Authorization: Bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" \
    "${ACTIONS_ID_TOKEN_REQUEST_URL}${sep}audience=${OIDC_AUDIENCE}")" || return 1
  token="$(printf '%s' "$response" | jq -er '.value | select(type=="string" and length>100)')" || return 1
  if [[ ! "$token" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]]; then
    echo 'AUTO_FACTORY_OIDC_REFRESH_JWT_INVALID' >&2
    return 1
  fi
  # Refuse expired, near-expired and wrong-audience tokens. This check is
  # diagnostic only; Supabase always verifies the cryptographic claims.
  OIDC_TOKEN_CANDIDATE="$token" node - <<'NODE'
const encoded=String(process.env.OIDC_TOKEN_CANDIDATE||'').split('.');
if(encoded.length!==3)throw new Error('AUTO_FACTORY_OIDC_REFRESH_JWT_INVALID');
let claims;
try{claims=JSON.parse(Buffer.from(encoded[1],'base64url').toString('utf8'));}
catch{throw new Error('AUTO_FACTORY_OIDC_REFRESH_CLAIMS_INVALID');}
const now=Math.floor(Date.now()/1000);
if(claims.aud!==process.env.OIDC_AUDIENCE)throw new Error('AUTO_FACTORY_OIDC_REFRESH_AUDIENCE_INVALID');
if(!Number.isSafeInteger(claims.exp)||claims.exp-now<90)throw new Error('AUTO_FACTORY_OIDC_REFRESH_EXPIRED');
NODE
  local validation_rc=$?
  [[ "$validation_rc" -eq 0 ]] || return "$validation_rc"
  echo "::add-mask::$token"
  export IBERFIT_AUTO_FACTORY_OIDC="$token"
  printf 'IBERFIT_AUTO_FACTORY_OIDC=%s\n' "$token" >> "$GITHUB_ENV"
  echo 'AUTO_FACTORY_OIDC_RENEWED'
}
