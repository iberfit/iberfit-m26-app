// M44 isolated GoTrue diagnostics: never emit raw logs, SQL or identities.
// This file runs only on a local restored clone and accepts a local log file.
import {readFileSync, lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
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


// PostgreSQL writes its 42703 detail to its own *private* container log even
// when GoTrue reduces the error to SQLSTATE. The caller checks the GoTrue
// SQLSTATE before consulting this diagnostic. No raw lines cross CI.
const PG_ERROR_COLUMN = /\bcolumn\s+(?:(?:"[a-z][a-z0-9_]{0,62}"|[a-z][a-z0-9_]{0,62})\.)?(?:"([a-z][a-z0-9_]{0,62})"|([a-z][a-z0-9_]{0,62}))(?:\s+of\s+relation\s+"?[a-z][a-z0-9_.]{0,127}"?)?\s+does\s+not\s+exist\b/iu;
const PG_RECORD_FIELD = /\brecord\s+"?(?:new|old)"?\s+has\s+no\s+field\s+"?([a-z][a-z0-9_]{0,62})"?\b/iu;
export function classifyPostgresColumnCandidate(log) {
  if (typeof log !== 'string' || log.length > 4_000_000) return 'UNAVAILABLE';
  // Never classify arbitrary SQL, parameters, non-error log records or
  // statements containing user data. Only the ERROR summary line is parsed.
  const lines = log.split(/\r?\n/u);
  for (let i=lines.length-1; i>=Math.max(0,lines.length-500); i--) {
    const line=lines[i];
    const error=/\bERROR:\s*(.{0,512})/iu.exec(line);
    if (!error) continue;
    const columnMatch=PG_ERROR_COLUMN.exec(error[1]);
    const match=columnMatch || PG_RECORD_FIELD.exec(error[1]);
    if (!match) continue;
    const column=(match[1]||match[2]||'').toLowerCase();
    if (KNOWN_COLUMNS.has(column)) return column.toUpperCase();
    // An unknown identifier may contain project-specific schema context.
    // Never print it. Emit only a deterministic 64-bit digest of the
    // SQL identifier plus the error form; no user values or statements.
    const digest=createHash('sha256').update(column,'utf8')
      .digest('hex').slice(0,16).toUpperCase();
    return 'UNLISTED_'+(columnMatch?'COLUMN':'RECORD')+'_H'+digest;
  }
  return 'UNKNOWN';
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let result = 'UNAVAILABLE';
  const name = process.argv[2] || '';
  try {
    const isAuthLog=name.endsWith('/m44-hosted-auth-private/gotrue-failure-private.log');
    const isDbLog=name.endsWith('/m44-hosted-auth-private/postgres-failure-private.log');
    if (isAuthLog || isDbLog) {
      const meta = lstatSync(name);
      if (meta.isFile() && !meta.isSymbolicLink() && meta.size <= 4_000_000) {
        const data=readFileSync(name, 'utf8');
        result = isDbLog ? classifyPostgresColumnCandidate(data) : classifyMissingColumn(data);
      }
    }
  } catch { /* private diagnostic must be best-effort */ }
  console.log((name.endsWith('/m44-hosted-auth-private/postgres-failure-private.log') ? 'M44_AUTH_PG42703_CANDIDATE_' : 'M44_AUTH_RUNTIME_42703_COLUMN_') + result);
}
