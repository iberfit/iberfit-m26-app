import test from 'node:test';
import assert from 'node:assert/strict';
import {reportResultCollection,verifiedSportCoordinates} from '../src/m26/workflows/report-result-coordinates.js';
const blocks=[{id:'warm',type:'exercise',exerciseId:'run',sets:2},{id:'main',type:'exercise',exerciseId:'run',sets:1}];
const snapshot={blocks};
const row=(extra={})=>({exerciseId:'run',setNumber:1,distanceKm:1,seconds:300,...extra});
const verify=results=>verifiedSportCoordinates({results},snapshot);
test('two blocks retain their own set even with the same exercise and number',()=>{
  const rows=verify([row({blockId:'warm'}),row({blockId:'main',distanceKm:3})]);
  assert.deepEqual(rows.map(x=>[x.blockId,x.row.distanceKm]),[['warm',1],['main',3]]);
});
test('actual scoped storage keys identify repeated exercises without guessing',()=>{
  const rows=verify({'warm:run:1':row(),'main:run:1':row({distanceKm:3})});
  assert.deepEqual(rows.map(x=>x.blockId),['warm','main']);
  assert.equal(verify([row()]).length,0);
  assert.equal(verify([row({setNumber:2})])[0].blockId,'warm');
});
test('duplicates, contradictory aliases and skipped coordinates cannot certify work',()=>{
  const rows=verify([row({blockId:'warm'}),row({blockId:'warm'}),row({blockId:'main'})]);
  assert.deepEqual(rows.map(x=>x.blockId),['main']);
  assert.equal(verify([row({blockId:'warm',block_id:'main'}),row({blockId:'main'})]).length,0);
  assert.equal(verify([row({blockId:'warm',set_number:2})]).length,0);
  assert.equal(verifiedSportCoordinates({results:[row({blockId:'warm'})],skippedSets:[row({blockId:'warm'})]},snapshot).length,0);
});
test('unknown block and invalid series never create evidence; explicit extra series remain',()=>{
  for(const bad of [row({blockId:'missing'}),row({blockId:'warm',setNumber:0}),row({blockId:'warm',setNumber:1.5}),row({blockId:'warm',setNumber:'1'})])assert.equal(verify([bad]).length,0);
  assert.equal(verify([row({blockId:'warm',setNumber:3})])[0].setNumber,3);
});
test('recognized storage coordinates never override conflicting row identity',()=>{
  assert.equal(verify({'main:run:1':row({blockId:'warm'})}).length,0);
  assert.equal(verify({'main:run:2':row({blockId:'main'})}).length,0);
});
test('legacy result aliases are read consistently; contradictory aliases fail closed',()=>{
  const results=[row({blockId:'warm'})];
  assert.equal(verifiedSportCoordinates({set_results:results},snapshot).length,1);
  assert.equal(verifiedSportCoordinates({results,body:{results:[row({blockId:'main'})]}},snapshot).length,0);
  assert.equal(reportResultCollection({results,body:{setResults:results}}).conflict,false);
  assert.equal(reportResultCollection({results:false}).conflict,true);
});
