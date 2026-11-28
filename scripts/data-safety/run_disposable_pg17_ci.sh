#!/usr/bin/env bash
# CI-only disposable PostgreSQL: random, masked credential; loopback-only port.
# Never starts or connects to a hosted service. No repository secrets required.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]] || { echo 'IBERFIT_DISPOSABLE_PG17_CI_ONLY' >&2; exit 65; }
[[ "$#" == 1 ]] || exit 65
case "$1" in
  scripts/data-safety/m26_c_v47_isolated_pg17.sh|scripts/data-safety/gx_document_consent_isolated_pg17.sh|scripts/data-safety/connected360_v48_v58_isolated_pg17.sh) ;;
  *) exit 65 ;;
esac
credential="$(openssl rand -hex 32)"
[[ "$credential" =~ ^[a-f0-9]{64}$ ]] || exit 65
printf '::add-mask::%s\n' "$credential"
export POSTGRES_PASSWORD="$credential" PGPASSWORD="$credential"
unset credential
export IBERFIT_PG17_SYNTHETIC_ONLY=YES PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGDATABASE=postgres
# Only remove the container whose ID this invocation created.
container_id="$(docker run -d --rm -e POSTGRES_PASSWORD -p 127.0.0.1:5432:5432 postgres:17-alpine)"
trap 'docker rm -f "$container_id" >/dev/null 2>&1 || true' EXIT
unset POSTGRES_PASSWORD
# A TCP authentication probe, not pg_isready's unauthenticated readiness.
for ((attempt=0;attempt<60;attempt++)); do
  if docker exec -e PGPASSWORD "$container_id" psql -h 127.0.0.1 -U postgres -d postgres -Atqc 'SELECT 1' >/dev/null 2>&1; then
    bash "$1"
    exit 0
  fi
  sleep 1
done
echo 'IBERFIT_DISPOSABLE_PG17_NOT_READY' >&2
exit 65
