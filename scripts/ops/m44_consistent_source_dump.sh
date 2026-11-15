#!/usr/bin/env bash
# M44 · export a PostgreSQL custom dump and an Auth/Vault/Storage census from
# ONE MVCC snapshot. The source connection is READ ONLY. All output stays in
# the ephemeral protected runner and is encrypted before artifact upload.
set -euo pipefail
umask 077
if [[ $# -ne 1 || -z "$1" || "$1" != /* || ! -d "$1" ||
      -z "$IBERFIT_PROD_DATABASE_URL" ]]; then
  echo 'IBERFIT_M44_SNAPSHOT_ARGUMENTS_OR_CREDENTIAL_MISSING' >&2
  exit 41
fi
work="$1"
sql="$PWD/scripts/ops/m44_auth_vault_census.sql"
if [[ ! -f "$sql" || -e "$work/database.pgcustom" ||
      -e "$work/auth-vault-source.json" || -e "$work/source-snapshot.id" ]]; then
  echo 'IBERFIT_M44_SNAPSHOT_SOURCE_NOT_CLEAN' >&2
  exit 42
fi
# Keep this session alive until pg_dump has successfully imported its exact
# exported MVCC snapshot. Never use two independent READ COMMITTED censuses.
coproc M44_SOURCE {
  docker run --rm --network host -i -e IBERFIT_PROD_DATABASE_URL \
    -v "$work:/work" -v "$sql:/m44-census.sql:ro" \
    postgres:17-alpine sh -c \
    'exec psql -X -q -A -t -v ON_ERROR_STOP=1 --dbname="$IBERFIT_PROD_DATABASE_URL"'
} 2>"$work/m44-source-private-errors"
snapshot_pid=$M44_SOURCE_PID
cleanup(){
  kill "$snapshot_pid" 2>/dev/null || true
  wait "$snapshot_pid" 2>/dev/null || true
  rm -f "$work/source-snapshot.id" "$work/m44-source-private-errors" \
    "$work/m44-dump-private-errors"
}
trap cleanup EXIT
printf '%s\n' \
  'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;' \
  '\o /work/source-snapshot.id' \
  'SELECT pg_export_snapshot();' \
  '\o /work/auth-vault-source.json' \
  '\i /m44-census.sql' \
  '\o' >&"${M44_SOURCE[1]}"
# psql \o closes/flushes files when switching output destinations. Never
# print the snapshot identifier, counts, DB URI, credentials, or SQL errors.
ready=false
for ((i=0;i<100;i++)); do
  if [[ -s "$work/source-snapshot.id" && -s "$work/auth-vault-source.json" ]]; then
    ready=true
    break
  fi
  if ! kill -0 "$snapshot_pid" 2>/dev/null; then break; fi
  sleep 0.2
done
if [[ "$ready" != true ]]; then
  echo 'IBERFIT_M44_MVCC_SNAPSHOT_EXPORT_FAILED' >&2
  exit 43
fi
snapshot="$(tr -d '\r\n' < "$work/source-snapshot.id")"
if [[ ! "$snapshot" =~ ^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{8}-[0-9]+$ ]]; then
  echo 'IBERFIT_M44_EXPORTED_SNAPSHOT_ID_INVALID' >&2
  exit 44
fi
if ! node --input-type=module - "$work/auth-vault-source.json" >/dev/null 2>&1 <<'NODE'
import fs from 'node:fs';
import {validateAuthVaultCensus} from './scripts/ops/m44_auth_vault_cardinality_contract.mjs';
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
validateAuthVaultCensus(data);
NODE
then
  echo 'IBERFIT_M44_SOURCE_AUTH_VAULT_CENSUS_INVALID' >&2
  exit 45
fi
# The pg_dump session imports the SAME exported snapshot as the census.
# Any failure aborts backup; never silently retry without the source lock.
if ! docker run --rm --network host -e IBERFIT_PROD_DATABASE_URL \
    -v "$work:/work" postgres:17-alpine sh -c \
    'pg_dump -Fc --snapshot="$1" --dbname="$IBERFIT_PROD_DATABASE_URL" \
      -f /work/database.pgcustom 2>/work/m44-dump-private-errors' \
    sh "$snapshot" >/dev/null 2>&1; then
  echo 'IBERFIT_M44_MATCHING_SNAPSHOT_DUMP_FAILED' >&2
  exit 46
fi
if [[ ! -s "$work/database.pgcustom" ]]; then
  echo 'IBERFIT_M44_DUMP_EMPTY' >&2
  exit 47
fi
# Close the exported snapshot AFTER pg_dump succeeds. On any error the trap
# also terminates the source connection; never leave an idle transaction.
if ! printf '%s\n' 'ROLLBACK;' '\q' >&"${M44_SOURCE[1]}"; then
  echo 'IBERFIT_M44_SOURCE_SNAPSHOT_RELEASE_FAILED' >&2
  exit 48
fi
if ! wait "$snapshot_pid"; then
  echo 'IBERFIT_M44_SOURCE_SESSION_FAILED' >&2
  exit 49
fi
echo 'IBERFIT_M44_SAME_MVCC_SOURCE_CENSUS_AND_PGCUSTOM_READY'
