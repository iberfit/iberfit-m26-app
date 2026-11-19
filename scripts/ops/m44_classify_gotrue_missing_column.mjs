// M44 isolated GoTrue diagnostics: never emit raw logs, SQL or identities.
// This file runs only on a local restored clone and accepts a local log file.
import {readFileSync, lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const KNOWN_COLUMNS = new Set([
  'auth_code_issued_at', 'authentication_method', 'confirmed_at',
  'email_confirmed_at', 'email_optional', 'email_change_confirm_status',
  'encrypted_password', 'flow_state', 'id', 'identity_data',
  'is_anonymous', 'last_sign_in_at', 'linking_target_id',
  'oauth_client_id', 'provider_id', 'reauthentication_sent_at',
  'recovery_sent_at', 'refresh_token_counter', 'refresh_token_hmac_key',
  'scopes', 'session_id', 'updated_at', 'user_id', 'web_authn_credential'
]);
const ERROR_COLUMN = /\bcolumn\s+(?:"([a-z][a-z0-9_]{0,62})"|([a-z][a-z0-9_]{0,62}))(?:\s+of\s+relation\s+"?[a-z][a-z0-9_.]*"?)?\s+does\s+not\s+exist\b/iu;

export function classifyMissingColumn(log) {
  if (typeof log !== 'string' || log.length > 4_000_000) return 'UNAVAILABLE';
  if (!/\b42703\b/u.test(log)) return 'NO_42703';
  const match = ERROR_COLUMN.exec(log);
  if (!match) return 'UNKNOWN';
  const column = (match[1] || match[2]).toLowerCase();
  return KNOWN_COLUMNS.has(column) ? column.toUpperCase() : 'UNLISTED';
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let result = 'UNAVAILABLE';
  const name = process.argv[2] || '';
  try {
    if (name.endsWith('/m44-hosted-auth-private/gotrue-failure-private.log')) {
      const meta = lstatSync(name);
      if (meta.isFile() && !meta.isSymbolicLink() && meta.size <= 4_000_000) {
        result = classifyMissingColumn(readFileSync(name, 'utf8'));
      }
    }
  } catch { /* private diagnostic must be best-effort */ }
  console.log('M44_AUTH_RUNTIME_42703_COLUMN_' + result);
}
