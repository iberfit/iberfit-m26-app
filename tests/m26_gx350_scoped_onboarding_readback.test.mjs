import test from 'node:test';
import assert from 'node:assert/strict';
import {readTemplate,renderScopedReadback,readDeferredIriTemplate,renderDeferredIri} from '../scripts/ops/gx350_onboarding_readback.mjs';
const template=readTemplate();
test('scoped readback preserves assurance, role scope, and all three readback predicates',()=>{
  const body=template.split('$gx_to$')[1];
  assert.ok(body);
  assert.match(body,/perform public\.iberfit_require_privileged_assurance_v65d\(\)/);
  assert.match(body,/iberfit_current_role_v26\(\) in \('admin','coach'\)/);
  assert.match(body,/iberfit_can_access_client_v26\(v_candidate\)/);
  for(const predicate of [/p\.client_id=v_candidate/,/i\.client_id=v_candidate/,/into v_visible/,/into v_profile_visible/,/into v_iri_available/])assert.match(body,predicate);
  assert.doesNotMatch(body,/iberfit_bootstrap_v26\(|\bGRANT\b|statement_timeout/i);
  assert.match(template,/before_metadata is distinct from after_metadata/);
  assert.match(template,/833239e847db56f90de23c6b407e1384/);
  assert.match(template,/5eca7c696f69e01a25d1d56f053974ce/);
});
test('one pinned template renders two inverse transaction directions and an uncommitted dry run',()=>{
  const install=renderScopedReadback(template);
  const rollback=renderScopedReadback(template,{mode:'rollback'});
  assert.match(install,/direction constant text:='install'/);
  assert.match(rollback,/direction constant text:='rollback'/);
  assert.equal(install.replace("direction constant text:='install'","direction constant text:='rollback'"),rollback);
  for(const sql of [install,rollback]){
    assert.match(sql,/^BEGIN;\n/);
    assert.match(sql,/COMMIT;\n$/);
    assert.doesNotMatch(sql,/__GX350_READBACK_DIRECTION__/);
  }
  assert.match(renderScopedReadback(template,{dryRun:true}),/ROLLBACK;\n$/);
});
test('tampering and invalid direction fail closed before any SQL is emitted',()=>{
  assert.throws(()=>renderScopedReadback(template+'\n'),/HASH_MISMATCH/);
  assert.throws(()=>renderScopedReadback(template,{mode:'unsafe'}),/RENDER_INVALID/);
  assert.throws(()=>renderScopedReadback(template,{dryRun:'false'}),/RENDER_INVALID/);
});

test('deferred IRI cleanup receives only the precise new-client identifier, fails closed, and preserves old receipts',()=>{
  const source=readDeferredIriTemplate();
  const install=renderDeferredIri(source);
  const undo=renderDeferredIri(source,{mode:'rollback'});
  assert.match(source,/v_created->>'reused'='false'/);
  assert.match(source,/v_created->>'iri_id'/);
  assert.match(source,/GX350_DEFERRED_IRI_CLEANUP_UNCONFIRMED/);
  assert.match(source,/not v_had_iri/);
  assert.match(source,/GX350_IRI_INTERNAL_ACL_DRIFT/);
  assert.match(source,/prior_meta IS DISTINCT FROM revised_meta/);
  assert.equal(install.replace("direction constant text:='install'","direction constant text:='rollback'"),undo);
  assert.throws(()=>renderDeferredIri(source+'\n'),/HASH_MISMATCH/);
});
