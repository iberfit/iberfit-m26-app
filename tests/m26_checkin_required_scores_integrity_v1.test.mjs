import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCheckinDraft,validateCheckinDraft} from '../src/m26/engagement/activity-drafts.js';

const base=()=>({
  energy:6,sleep:7,stress:3,pain:0,
  recordedAt:'2026-10-06T12:00:00.000Z',
});

test('empty required energy/sleep/stress/pain is missing, not fabricated zero',()=>{
  for(const key of ['energy','sleep','stress','pain']){
    for(const empty of ['', '   ', null, undefined]){
      const data={...base(),[key]:empty};
      const result=validateCheckinDraft(data);
      assert.equal(result.ok,false,`${key} must not accept ${JSON.stringify(empty)}`);
      assert.equal(result.value[key],null);
      assert.ok(result.errors.includes(`${key.toUpperCase()}_REQUIRED`));
    }
  }
  const allBlank=validateCheckinDraft({
    energy:'',sleep:'  ',stress:null,pain:undefined,
    recordedAt:'2026-10-06T12:00:00.000Z',
  });
  assert.equal(allBlank.ok,false);
  assert.deepEqual(allBlank.errors,[
    'ENERGY_REQUIRED','SLEEP_REQUIRED','STRESS_REQUIRED','PAIN_REQUIRED',
  ]);
});

test('numeric zero is legitimate, including a zero typed into a form',()=>{
  for(const zero of [0,'0',' 0 ']){
    const draft=validateCheckinDraft({
      energy:zero,sleep:zero,stress:zero,pain:zero,fatigue:zero,motivation:zero,
      recordedAt:'2026-10-06T12:00:00.000Z',
    });
    assert.equal(draft.ok,true);
    for(const key of ['energy','sleep','stress','pain','fatigue','motivation']){
      assert.equal(draft.value[key],0);
    }
  }
});

test('booleans, arrays and objects cannot be coerced into scores',()=>{
  for(const invalid of [false,true,[],[5],{}, {value:7}]){
    const value=normalizeCheckinDraft({...base(),energy:invalid,fatigue:invalid});
    assert.equal(value.energy,null);
    if(Object.hasOwn(value,'fatigue'))assert.equal(value.fatigue,null);
    assert.equal(validateCheckinDraft({...base(),energy:invalid}).ok,false);
  }
});

test('valid score boundaries and decimals retain existing behavior',()=>{
  const valid=validateCheckinDraft({
    ...base(),energy:'10',sleep:'0',stress:5.5,pain:0,
    fatigue:10,motivation:0,
  });
  assert.equal(valid.ok,true);
  assert.equal(valid.value.energy,10);
  assert.equal(valid.value.sleep,0);
  assert.equal(valid.value.stress,5.5);
  assert.equal(valid.value.pain,0);
  for(const invalid of ['-1','10.1','Infinity','not-a-number']){
    const result=validateCheckinDraft({...base(),pain:invalid});
    assert.equal(result.ok,false);
    assert.ok(result.errors.includes('PAIN_REQUIRED'));
  }
});
