import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const edge=fs.readFileSync('supabase/functions/iberfit-webauthn-v1/index.ts','utf8').replace(/\r\n?/gu,'\n');
const migration=fs.readFileSync('supabase/migrations/20260908103000_webauthn_multihost_rp_binding_v1.sql','utf8').replace(/\r\n?/gu,'\n');

const canonicalRps=[
  'm26-canary.iberfit.cl',
  'app.iberfit.cl',
  'coach.iberfit.cl',
];
const canonicalOrigins=canonicalRps.map((rpId)=>`https://${rpId}`);

test('existing WebAuthn credentials are migrated to the historical Canary RP and rp_id becomes mandatory',()=>{
  assert.match(migration,/add column if not exists rp_id text/u);
  assert.match(migration,/set rp_id = 'm26-canary\.iberfit\.cl'\s*where rp_id is null/u);
  assert.match(migration,/alter column rp_id set not null/u);
  for(const rpId of canonicalRps)assert.ok(migration.includes(`'${rpId}'`),`missing RP allowlist entry ${rpId}`);
  assert.match(migration,/user_rp_active_idx[\s\S]*?\(user_id, rp_id\)[\s\S]*?where revoked_at is null/u);
});

test('challenge persistence permits only canonical IBERFIT origins',()=>{
  assert.match(migration,/iberfit_webauthn_challenges_v1_origin_check/u);
  for(const origin of canonicalOrigins)assert.ok(migration.includes(`'${origin}'`),`missing challenge origin ${origin}`);
  assert.doesNotMatch(migration,/origin\s+like\s+['"]%/iu);
});

test('edge reads, creates, verifies and updates credentials inside the current RP only',()=>{
  const rpFilters=edge.match(/\.eq\('rp_id',rpID\)/gu)||[];
  assert.ok(rpFilters.length>=4,`expected at least four RP filters, found ${rpFilters.length}`);
  assert.match(edge,/insert\(\{user_id:user\.id,rp_id:rpID,credential_id:/u);
  assert.match(edge,/expectedOrigin:origin,expectedRPID:rpID/u);
  assert.doesNotMatch(edge,/rp_id\s*:\s*['"]m26-canary\.iberfit\.cl['"]/u);
});

test('privileged assurance is derived from request Origin and must match the credential RP',()=>{
  assert.match(migration,/current_setting\('request\.headers',true\)/u);
  assert.match(migration,/v_origin:=lower\(trim\(coalesce\(v_request_headers->>'origin',''\)\)\)/u);
  assert.match(migration,/c\.rp_id=v_rp_id/u);
  assert.match(migration,/and v_rp_id is not null/u);
  assert.match(migration,/'rpId',v_rp_id/u);
  assert.match(migration,/Unknown or absent origins fail closed/u);
});
