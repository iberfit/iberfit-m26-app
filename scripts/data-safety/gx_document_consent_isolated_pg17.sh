#!/usr/bin/env bash
# Disposable synthetic database only. No hosted endpoint or production secret.
set -Eeuo pipefail
if [[ "${IBERFIT_PG17_SYNTHETIC_ONLY:-}" != YES || "${PGHOST:-}" != 127.0.0.1 ||
      "${PGPORT:-}" != 5432 || "${PGUSER:-}" != postgres || "${PGDATABASE:-}" != postgres ||
      "${PGPASSWORD:-}" != synthetic-local-only ]]; then
  echo GX_DOCUMENT_ISOLATED_PG17_ONLY >&2; exit 65
fi
cd "$(dirname "$0")/../.."
psql_synthetic(){
  docker run --interactive --rm --network host \
    -e PGPASSWORD -e PGHOST -e PGPORT -e PGUSER -e PGDATABASE \
    -v "$PWD:/repo:ro" postgres:17-alpine psql -X -q -v ON_ERROR_STOP=1 "$@"
}
# Refuse any populated service. Also pin the major version; no blind cleanup.
[[ "$(psql_synthetic -Atc "SELECT current_setting('server_version_num')::int/10000=17 AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN ('auth','private','gx_test')) AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m'))")" == t ]] || { echo GX_DOCUMENT_FRESH_PG17_REQUIRED >&2; exit 65; }
psql_synthetic -f /repo/qa/sql/connected360-document/fixture.sql
psql_synthetic -f /repo/qa/sql/connected360-document/closed_fence.sql
psql_synthetic -c "CREATE DATABASE gx_finalize_test"
psql_synthetic -d gx_finalize_test -f /repo/qa/sql/connected360-document/finalize_closed.sql
psql_synthetic -f /repo/supabase/release-procedures/connected360_v49_coach_activity_consent_v1.sql
# V53 full installer deliberately checks exact hosted V46/V51 hashes. Do NOT
# weaken those guards. Exercise only its byte-exact source-state function in
# this minimal fixture; full V53/V56 installation remains a separate QA gate.
python3 - <<'PY' | psql_synthetic
from pathlib import Path
s=Path('supabase/release-procedures/connected360_v53_apple_exercise_authorization_v1.sql').read_text()
a='CREATE FUNCTION private.m26_v53_apple_exercise_source_state('
b='REVOKE ALL ON FUNCTION private.m26_v53_apple_exercise_source_state(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;'
assert s.count(a)==s.count(b)==1
print(s[s.index(a):s.index(b)+len(b)])
PY
psql_synthetic -f /repo/supabase/release-procedures/gx_connected360_report_observations_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/gx_connected360_document_consent_v1.sql
# Exercise empty reversible install, in dependency order, before adding history.
psql_synthetic -f /repo/supabase/release-procedures/gx_connected360_document_consent_v1.rollback.sql
psql_synthetic -f /repo/supabase/release-procedures/gx_connected360_report_observations_v1.rollback.sql
psql_synthetic -c "SELECT gx_test.assert(to_regclass('private.gx_connected360_document_request_v1') IS NULL AND to_regprocedure('private.m26_gx_connected360_report_observations_v1(uuid,uuid,text,uuid,bigint,date,date)') IS NULL,'empty rollback');"
psql_synthetic -f /repo/supabase/release-procedures/gx_connected360_report_observations_v1.sql
psql_synthetic -f /repo/supabase/release-procedures/gx_connected360_document_consent_v1.sql
psql_synthetic -f /repo/qa/sql/connected360-document/lifecycle.sql
# Test exact private/read/PDF boundary definitions with synthetic legacy
# adapter. Do not install or bypass the hosted read-boundary preflight.
python3 - <<'PY_READ' | psql_synthetic
from pathlib import Path
fixture=Path('qa/sql/connected360-document/private_read.sql').read_text()
fence=Path('supabase/release-procedures/gx_connected360_document_closed_fence_v1.sql').read_text()
read=Path('supabase/release-procedures/gx_connected360_document_read_boundaries_v1.sql').read_text()
a='CREATE FUNCTION private.gx_document_has_external_v1('
b='-- Validated CHECKs'
c='CREATE FUNCTION private.gx_document_other_evidence_current_v1('
d='-- Existing client evidence policy'
for source,start,end in [(fence,a,b),(read,c,d)]:
    assert source.count(start)==source.count(end)==1
m44=Path('supabase/migrations/20261015142000_m44_report_client_safe_publication_v1.sql').read_text()
m44_marker=r'\ir private_read_m44_generated.sql'
m44_end='-- The policy must not exist before'
assert fixture.count(m44_marker)==m44.count(m44_end)==1
fixture=fixture.replace(m44_marker,m44[:m44.index(m44_end)])
# Extract the exact staged function definitions only. The minimal fixture has
# a synthetic bus, so never bypass the real installer fingerprints in QA.
parts=[]
for name,start in [('prepare_approval','CREATE FUNCTION private.gx_document_prepare_approval_v1('),('apply_transition','CREATE FUNCTION private.gx_document_apply_transition_v1(')]:
    source=Path(f'supabase/release-procedures/gx_connected360_document_{name}_v1.sql').read_text()
    assert source.count(start)==1 and source.rstrip().endswith('COMMIT;')
    parts.append(source[source.index(start):source.rindex('COMMIT;')])
transition_marker=r'\ir private_read_transition_generated.sql'
assert fixture.count(transition_marker)==1
fixture=fixture.replace(transition_marker,'\n'.join(parts))
marker=r'\ir private_read_generated.sql'
assert fixture.count(marker)==1
# Exercise the exact ingress helper/wrapper after the certified V3.1 scenario.
# Keep the V3.1 fixture unchanged; the bus is still deliberately synthetic.
boundary=Path('supabase/release-procedures/gx_connected360_document_bus_boundary_v1.sql').read_text()
start='CREATE FUNCTION private.gx_document_generic_rejection_v1('
assert boundary.count(start)==1 and boundary.rstrip().endswith('COMMIT;')
extra=Path('qa/sql/connected360-document/bus_boundary.sql').read_text()
extra_marker=r'\ir bus_boundary_generated.sql'
assert extra.count(extra_marker)==1
extra=extra.replace(extra_marker,boundary[boundary.index(start):boundary.rindex('COMMIT;')])
final_rollback='ROLLBACK;\n'+r'\echo GX_DOCUMENT_PRIVATE_READ_PG17_OK'
assert fixture.count(final_rollback)==1
fixture=fixture.replace(final_rollback,extra+'\n'+final_rollback)
# Stage exact storage functions/triggers and transition patch, after the
# original V3.1 and generic-ingress assertions; no hosted preflight bypass.
storage=Path('supabase/release-procedures/gx_connected360_document_storage_boundary_v1.sql').read_text()
start='CREATE TABLE private.gx_document_write_permit_v1 ('
assert storage.count(start)==1 and storage.rstrip().endswith('COMMIT;')
new_fixture=Path('qa/sql/connected360-document/storage_boundary.sql').read_text()
storage_marker=r'\ir storage_boundary_generated.sql'
assert new_fixture.count(storage_marker)==1
new_fixture=new_fixture.replace(storage_marker,storage[storage.index(start):storage.rindex('COMMIT;')])
fixture=fixture.replace(final_rollback,new_fixture+'\n'+final_rollback)

# Exercise exact PDF source builder and staged private helpers only; the
# hosted wrapper fingerprint preflight is not bypassed or certified here.
pdf=Path('supabase/release-procedures/gx_connected360_document_pdf_boundary_v1.sql').read_text()
source=Path('supabase/migrations/20261015143500_m44_immutable_evolution_pdf_ledger_v1.sql').read_text()
start='CREATE OR REPLACE FUNCTION public.iberfit_m44_private_issued_source_v1('
end='CREATE OR REPLACE FUNCTION public.iberfit_m44_prepare_evolution_report_issue_v1('
assert source.count(start)==source.count(end)==1
helper_start='CREATE FUNCTION private.gx_document_pdf_snapshot_current_v1('
helper_end='DO $patch$'
assert pdf.count(helper_start)==pdf.count(helper_end)==1
pdf_fixture=Path('qa/sql/connected360-document/pdf_boundary.sql').read_text()
pdf_marker=r'\ir pdf_boundary_generated.sql'
assert pdf_fixture.count(pdf_marker)==1
pdf_fixture=pdf_fixture.replace(pdf_marker,source[source.index(start):source.index(end)]+pdf[pdf.index(helper_start):pdf.index(helper_end)])
issuance=Path('supabase/release-procedures/gx_connected360_document_issuance_boundary_v1.sql').read_text()
start='CREATE FUNCTION private.gx_document_issuance_write_v1('
end='-- The original GX guards'
assert issuance.count(start)==issuance.count(end)==1
issue_fixture=Path('qa/sql/connected360-document/issuance_boundary.sql').read_text()
issue_fixture=issue_fixture.replace(r'\ir issuance_boundary_generated.sql',issuance[issuance.index(start):issuance.index(end)])
withdraw_marker="SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');\nSELECT gx_test.assert(private.gx_document_request_decide_v1"
assert pdf_fixture.count(withdraw_marker)==1
bootstrap=Path('supabase/release-procedures/gx_connected360_document_bootstrap_boundary_v1.sql').read_text()
start='CREATE FUNCTION private.gx_document_bootstrap_row_current_v1('
end='DO $patch$'
assert bootstrap.count(start)==bootstrap.count(end)==1
bootstrap_fixture=Path('qa/sql/connected360-document/bootstrap_boundary.sql').read_text().replace(r'\ir bootstrap_boundary_generated.sql',bootstrap[bootstrap.index(start):bootstrap.index(end)])
pdf_fixture=pdf_fixture.replace(withdraw_marker,issue_fixture+'\n'+bootstrap_fixture+'\n'+withdraw_marker)
pdf_fixture+='\n'+Path('qa/sql/connected360-document/issuance_boundary_after_withdraw.sql').read_text()
pdf_fixture+='\n'+Path('qa/sql/connected360-document/bootstrap_boundary_after_withdraw.sql').read_text()
fixture=fixture.replace(final_rollback,pdf_fixture+'\n'+final_rollback)

print(fixture.replace(marker,fence[fence.index(a):fence.index(b)]+read[read.index(c):read.index(d)]))
PY_READ
# Observe the lock, not a timing guess. Separate transactions and backends;
# the first session remains open until the second is proven to be waiting.
work=$(mktemp -d); holder_pid=; waiter_pid=;
cleanup(){
  if [[ -n "$holder_pid" ]]; then kill "$holder_pid" 2>/dev/null || true; fi
  if [[ -n "$waiter_pid" ]]; then kill "$waiter_pid" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
wait_until(){
  local sql=$1 result i
  for i in $(seq 1 30); do
    result=$(psql_synthetic -Atc "$sql")
    [[ "$result" == t ]] && return 0
    sleep 0.2
  done
  echo GX_DOCUMENT_LOCK_PROOF_TIMEOUT >&2
  cat "$work"/*.log >&2 || true
  return 1
}
run_race(){
  local provider=$1 first=$2 first_sql second_sql
  local owner="SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');"
  local coach="SELECT gx_test.actor('10000000-0000-4000-8000-000000000002');"
  local withdraw="$owner SELECT gx_test.assert((private.gx_document_request_decide_v1(request_id,1,gen_random_uuid(),'withdrawn',draft_sha,evidence_sha)->>'revision')='2','withdrawal') FROM gx_test.scenarios WHERE provider='$provider';"
  local publish_true="$coach SELECT gx_test.assert(private.gx_document_publication_lock_v1(report_id,client_id,body),'publication wins before withdrawal') FROM gx_test.scenarios WHERE provider='$provider';"
  local publish_false="$coach SELECT gx_test.assert(NOT private.gx_document_publication_lock_v1(report_id,client_id,body),'waiting publication denied after withdrawal') FROM gx_test.scenarios WHERE provider='$provider';"
  if [[ "$first" == withdrawal ]]; then first_sql=$withdraw; second_sql=$publish_false; else first_sql=$publish_true; second_sql=$withdraw; fi
  mkfifo "$work/input"
  exec 9<>"$work/input"
  psql_synthetic <"$work/input" >"$work/holder.log" 2>&1 & holder_pid=$!
  printf '%s\n' "BEGIN; SET LOCAL application_name='gx_doc_holder'; SET LOCAL statement_timeout='45s'; SET LOCAL idle_in_transaction_session_timeout='60s'; $first_sql" >&9
  wait_until "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='gx_doc_holder' AND state='idle in transaction')"
  (printf '%s\n' "BEGIN; SET LOCAL application_name='gx_doc_waiter'; SET LOCAL statement_timeout='45s'; $second_sql COMMIT;" | psql_synthetic) >"$work/waiter.log" 2>&1 & waiter_pid=$!
  wait_until "SELECT EXISTS(SELECT 1 FROM pg_stat_activity w JOIN pg_stat_activity h ON h.pid=ANY(pg_blocking_pids(w.pid)) WHERE w.application_name='gx_doc_waiter' AND h.application_name='gx_doc_holder')"
  printf '%s\n' 'COMMIT;' '\q' >&9
  exec 9>&-
  wait "$holder_pid" || { cat "$work/holder.log" >&2; return 1; }; holder_pid=
  wait "$waiter_pid" || { cat "$work/waiter.log" >&2; return 1; }; waiter_pid=
  rm "$work/input"
  echo "GX_DOCUMENT_RACE_OK provider=$provider first=$first"
}
run_race health_connect withdrawal
run_race apple_health publication
psql_synthetic <<'SQL'
BEGIN READ ONLY;
SELECT gx_test.assert(bool_and(NOT private.gx_document_publication_current_v1(report_id,client_id,body)),'both withdrawn reports denied') FROM gx_test.scenarios;
COMMIT;
SELECT gx_test.actor('10000000-0000-4000-8000-000000000001');
SELECT gx_test.assert(bool_and(private.gx_document_request_review_v1(request_id,false)->>'decision'='withdrawn'),'withdrawn receipts') FROM gx_test.scenarios;
SQL
# Rollback must refuse to erase nonempty history, not merely fail for any reason.
if psql_synthetic -f /repo/supabase/release-procedures/gx_connected360_document_consent_v1.rollback.sql >"$work/rollback.log" 2>&1; then
  echo GX_DOCUMENT_ROLLBACK_ERASED_HISTORY >&2; exit 1
fi
grep -q GX_DOCUMENT_CONSENT_ROLLBACK_REQUIRES_HISTORY_RETENTION "$work/rollback.log"
psql_synthetic -c "SELECT gx_test.assert((SELECT count(*) FROM private.gx_connected360_document_decision_v1)=4,'retained decisions');"
echo GX_DOCUMENT_ISOLATED_PG17_OK
