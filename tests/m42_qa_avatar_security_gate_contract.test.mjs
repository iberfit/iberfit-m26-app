import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=new URL('../',import.meta.url);
const script=readFileSync(new URL('scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs',r),'utf8');
const flow=readFileSync(new URL('.github/workflows/qa-real-write-cert.yml',r),'utf8');
const avatar=readFileSync(new URL('src/m26/profile/client-avatar.js',r),'utf8');
test('M42 real Storage QA is private, auth-scoped, QA-pinned, cleanup-safe',()=>{
 for(const literal of ['M42_AVATAR_QA_PRODUCTION_FORBIDDEN','M42_AVATAR_QA_EGRESS_DENIED',
  'COACH_ASSIGNED','OWNER_UPLOAD_PRIVATE_WEBP','OTHER_CLIENT_CANNOT_READ','COACH_CANNOT_UPLOAD',
  'NO_PUBLIC_FALLBACK','OWNER_DELETE','DELETE_REMOTE_CONFIRMED','cleanupConfirmed'])
  assert.ok(script.includes(literal),literal);
 assert.match(script,/M26_QA_CLIENT_B_PASSWORD/);
 assert.doesNotMatch(script,/pjhmrhejsoofmouedavw|app\.iberfit\.cl/);
 assert.match(flow,/m42-avatar-private-real-qa:/);
 assert.match(flow,/run_qa_m42_avatar_private_gate\.mjs/);
 assert.match(flow,/!github\.event\.pull_request\.draft/);
});
test('M42 photo async UI invalidated by role switch and remote confirmation',()=>{
 assert.match(avatar,/function unchangedScope\(/);
 assert.match(avatar,/if\(!unchangedScope\(scopeAtStart,generationAtStart\)\)return;/);
 assert.match(avatar,/const verified=await load\(id,\{force:true\}\)/);
 assert.match(avatar,/Foto guardada, pero no se pudo recuperar su vista/);
});
