#!/usr/bin/env bash
# Integration test on the GitHub Actions PostgreSQL 17 SERVICE ONLY.
# No hosted Supabase connection, no customer data or real credentials.
set -euo pipefail
umask 077
export PGPASSWORD=local-synthetic-only
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=supabase_admin
source_db=iberfit_m44_snapshot_synthetic_source
restored_db=iberfit_m44_snapshot_synthetic_restored
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
docker run --rm --network host -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER \
  postgres:17-alpine createdb "$source_db"
docker run --rm --network host -i -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER \
  postgres:17-alpine psql -X -q -v ON_ERROR_STOP=1 -d "$source_db" <<'SQL'
CREATE SCHEMA auth;
CREATE SCHEMA vault;
CREATE SCHEMA storage;
CREATE TABLE auth.users(id integer PRIMARY KEY);
CREATE TABLE auth.identities(id integer PRIMARY KEY);
CREATE TABLE auth.sessions(id integer PRIMARY KEY);
CREATE TABLE auth.refresh_tokens(id integer PRIMARY KEY);
CREATE TABLE auth.mfa_factors(id integer PRIMARY KEY);
CREATE TABLE auth.webauthn_credentials(id integer PRIMARY KEY);
CREATE TABLE auth.oauth_clients(id integer PRIMARY KEY);
CREATE TABLE auth.sso_providers(id integer PRIMARY KEY);
CREATE TABLE auth.saml_providers(id integer PRIMARY KEY);
CREATE TABLE auth.custom_oauth_providers(id integer PRIMARY KEY);
CREATE TABLE vault.secrets(id integer PRIMARY KEY);
CREATE TABLE storage.buckets(id integer PRIMARY KEY);
CREATE TABLE storage.objects(id integer PRIMARY KEY);
INSERT INTO auth.users VALUES (1),(2);
INSERT INTO auth.identities VALUES (1),(2);
INSERT INTO auth.sessions VALUES (1);
INSERT INTO auth.refresh_tokens VALUES (1),(2),(3);
INSERT INTO storage.buckets VALUES (1);
INSERT INTO storage.objects VALUES (1);
SQL
# The helper itself uses only its supplied database URL and an allowlisted
# read-only SQL census. The source and destination are isolated local DBs.
export IBERFIT_PROD_DATABASE_URL="postgresql://supabase_admin:local-synthetic-only@127.0.0.1:5432/$source_db?sslmode=disable"
bash scripts/ops/m44_consistent_source_dump.sh "$scratch"
docker run --rm --network host -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER \
  postgres:17-alpine createdb "$restored_db"
docker run --rm --network host -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER \
  -v "$scratch:/work" postgres:17-alpine pg_restore --exit-on-error \
  --no-owner --no-acl -d "$restored_db" /work/database.pgcustom >/dev/null
docker run --rm --network host -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER \
  -v "$scratch:/work" \
  -v "$PWD/scripts/ops/m44_auth_vault_census.sql:/m44-census.sql:ro" \
  postgres:17-alpine sh -c \
  'psql -X -A -t -v ON_ERROR_STOP=1 -d "$1" -f /m44-census.sql \
    > /work/auth-vault-restored.json' sh "$restored_db"
node scripts/ops/m44_auth_vault_cardinality_contract.mjs \
  "$scratch/auth-vault-source.json" "$scratch/auth-vault-restored.json" >/dev/null
echo 'IBERFIT_M44_REAL_PG17_SYNTHETIC_SOURCE_SNAPSHOT_AND_AUTH_VAULT_PARITY_PASS'
