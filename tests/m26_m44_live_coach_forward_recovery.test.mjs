import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync('scripts/ops/m44_isolated_backend_cutover_drill.sh','utf8');
test('M44 handles restored already-upgraded Coach state with rollback then re-install',()=>{
 assert.match(script,/coach_guard_installed=/u);
 assert.match(script,/if \[\[ "\$coach_guard_installed" == 1 \]\]; then/u);
 const present=script.indexOf('if [[ "$coach_guard_installed" == 1 ]]; then');
 const rollback=script.indexOf('apply COACH_ROLLBACK ',present);
 const reinstall=script.indexOf('apply COACH_REINSTALL ',present);
 const verify=script.indexOf('M44_ISOLATED_COACH_FORWARD_RECOVERY_VERIFIED_ONLY',present);
 assert.ok(present>=0&&rollback>present&&reinstall>rollback&&verify>reinstall);
 assert.match(script,/M44_ISOLATED_COACH_ROLLBACK_REHEARSAL_VERIFIED_ONLY/u);
 assert.match(script,/COACH_PREINSTALLED_SOURCE/u);
 assert.match(script,/COACH_PREINSTALL_SOURCE/u);
 assert.match(script,/COACH_REINSTALLED/u);
 assert.match(script,/COACH_SOURCE_CHANGED/u);
 for(const fingerprint of [
  'c6ce72f2333fbc369b66792b735dc8ef',
  'c8bbd63ace0634a4b1ad5f444fdd0d98',
  '168dc6bd262169a58a6d9ff12558078d',
  '66743cf255b81523a4733b63d1c98fc0'
 ])assert.ok(script.includes(fingerprint),fingerprint);
});
test('M44 Coach proof preserves Auth/user data and refuses execution against PROD',()=>{
 assert.match(script,/M44_REAL_PROD_BACKEND_SQL_INSTALL_AND_ROLLBACK_ISOLATED_ONLY/u);
 assert.match(script,/M44_HOSTED_AUTH_VAULT_EDGE_RUNTIME_NOT_CERTIFIED/u);
 assert.doesNotMatch(script,/delete\s+from\s+auth\.users|truncate\s+(?:auth|public)\./iu);
 assert.match(script,/M44_SQL_DRILL_ENABLED/u);
 assert.match(script,/\[\[ "\$before" == "\$after" \]\]/u);
});
