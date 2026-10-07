import test from 'node:test';
import assert from 'node:assert/strict';
import {__nextSessionPreparationInternals} from '../src/m26/intelligence/next-session-prep.js';

const {wellbeingShift,reviewReasons,WELLBEING_SHIFT_THRESHOLD}=__nextSessionPreparationInternals;
const now=new Date('2026-10-07T12:00:00Z');
const mk=(day,values)=>({clientId:'c1',recordedAt:`2026-10-${String(day).padStart(2,'0')}T09:00:00Z`,...values});

const adverse={collections:{checkins:[
  mk(7,{energy:4,sleep:4,stress:8,pain:0,fatigue:8,motivation:4}),
  mk(6,{energy:4,sleep:5,stress:8,pain:0,fatigue:7,motivation:4}),
  mk(5,{energy:7,sleep:7,stress:5,pain:0,fatigue:4,motivation:7}),
  mk(4,{energy:7,sleep:8,stress:5,pain:0,fatigue:4,motivation:7}),
]}};
const stable={collections:{checkins:[
  mk(7,{energy:6,sleep:6,stress:6,pain:0,fatigue:6,motivation:6}),
  mk(6,{energy:6,sleep:6,stress:6,pain:0,fatigue:6,motivation:6}),
  mk(5,{energy:7,sleep:7,stress:5,pain:0,fatigue:5,motivation:7}),
  mk(4,{energy:7,sleep:7,stress:5,pain:0,fatigue:5,motivation:7}),
]}};

test('comparación de bienestar usa 2 recientes vs 2 previos y conserva evidencia',()=>{
  const result=wellbeingShift(adverse,'c1',{now});
  assert.equal(WELLBEING_SHIFT_THRESHOLD,2);
  assert.equal(result.available,true);
  assert.equal(result.checkins,4);
  assert.equal(result.compared,5);
  assert.equal(result.signals.find((item)=>item.key==='energy')?.delta,-3);
  assert.equal(result.signals.find((item)=>item.key==='fatigue')?.delta,3.5);
  assert.equal(result.signals.some((item)=>item.key==='pain'),false);
});

test('variaciones pequeñas no crean una señal de revisión',()=>{
  const result=wellbeingShift(stable,'c1',{now});
  assert.equal(result.available,true);
  assert.deepEqual(result.signals,[]);
});

test('menos de cuatro check-ins no permiten inferir tendencia',()=>{
  const result=wellbeingShift({collections:{checkins:adverse.collections.checkins.slice(0,3)}},'c1',{now});
  assert.equal(result.available,false);
  assert.equal(result.reason,'insufficient_checkins');
  assert.deepEqual(result.signals,[]);
});

test('reviewReasons limita bienestar a las dos señales más marcadas',()=>{
  const trend=wellbeingShift(adverse,'c1',{now});
  const reasons=reviewReasons({
    progress:{latestCheckin:{pain:0},unconfirmedExecutions:0,dataQuality:'media'},
    outcomes:{openCount:0,overdueCount:0},
    feedback:{pain:false},
    session:{status:'published'},
    wellbeingTrend:trend,
  }).filter((item)=>item.kind==='wellbeing-shift');
  assert.equal(reasons.length,2);
  assert.equal(reasons[0].label,trend.signals[0].label);
  assert.equal(reasons[1].label,trend.signals[1].label);
});
