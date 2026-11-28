import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/release-procedures/connected360_v52_android_swimming_v1.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../supabase/release-procedures/connected360_v52_android_swimming_v1.rollback.sql',import.meta.url),'utf8');
test('Android swim writes are independently gated and old observations retain classification',()=>{
  assert.match(sql,/swimming_enabled boolean NOT NULL DEFAULT false/u);
  assert.match(sql,/where id=true for share/u);
  assert.match(sql,/v_sport='swimming' and v_swimming_enabled is true/u);
  assert.match(sql,/v_old_ex.sport='swimming' and v_sport='other'/u);
  assert.match(sql,/v_sport:='swimming'/u);
  assert.match(sql,/provider='health_connect'\s+and source_record_key=v_source for update/u);
  assert.match(sql,/'swimmingEnabled',COALESCE\(v_enabled AND v_swimming_enabled,false\)/u);
  assert.doesNotMatch(sql,/SET swimming_enabled\s*=\s*true|GRANT EXECUTE|CREATE TABLE/u);
});
test('rollback refuses classified Android rows and preserves original RPC baselines',()=>{
  assert.match(rollback,/provider='health_connect' AND sport='swimming'/u);
  assert.match(rollback,/M26_V52_ROLLBACK_REQUIRES_DATA_PRESERVATION/u);
  assert.match(rollback,/01e380756bb0bb584b95459e16bad689/u);
  assert.match(rollback,/0049ade9c829d330ba8db94381a35666/u);
  assert.doesNotMatch(rollback,/DELETE FROM|TRUNCATE |DROP TABLE/u);
});
