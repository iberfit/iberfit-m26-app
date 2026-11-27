import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceSignal,observedLoadKg} from '../src/m26/domain/evidence-signal.js';

const now=new Date('2026-11-27T15:00:00Z');
const signal={id:'signal-1',subjectId:'client-1',kind:'strength',sourceType:'sessionExecutions',sourceIds:['execution-1'],periodStart:'2026-11-20',periodEnd:'2026-11-27',value:0,unit:'kg',method:'Registro directo',provenance:'Ejecución confirmada',sampleSize:1,quality:'medida',confidence:'limitada',interpretationBoundary:'No acredita mejora',decisionUse:'Revisar',methodologyVersion:'v1'};

test('rechaza una unidad explícita desconocida incluso si el campo declara kg',()=>{
  for(const key of ['loadUnit','load_unit','weightUnit','weight_unit','unit']){
    for(const unit of ['stone','g','lb','reps','unknown',' ',false,0,{},['kg']]){
      assert.equal(observedLoadKg({loadKg:40,[key]:unit}),null,`${key}: ${JSON.stringify(unit)}`);
      assert.equal(observedLoadKg({load:'40 kg',[key]:unit}),null,`${key}: ${JSON.stringify(unit)}`);
    }
  }
});
test('preserva cargas explícitas en kg, cero y alias compatibles',()=>{
  for(const unit of ['kg',' KG ','kgs','kilogram','kilograms','kilogramo','kilogramos']){
    assert.equal(observedLoadKg({loadKg:40,loadUnit:unit}),40);
    assert.equal(observedLoadKg({load:'0',weightUnit:unit}),0);
  }
  assert.equal(observedLoadKg({loadKg:0}),0);
  assert.equal(observedLoadKg({load:'40,00 kg'}),40);
  assert.equal(observedLoadKg({loadKg:40,weightKg:40,loadUnit:'kg',weight_unit:'kilogramos'}),40);
  assert.equal(observedLoadKg({load:40}),null);
  assert.equal(observedLoadKg({loadKg:40,weightKg:50}),null);
  assert.equal(observedLoadKg({loadKg:40,skipped:true}),null);
});
test('no admite huecos ni valores inválidos en referencias de evidencia',()=>{
  for(const sourceIds of [new Array(1),['execution-1',,],['execution-1',undefined],['execution-1',null],['execution-1','execution-1'],[]]){
    assert.equal(createEvidenceSignal({...signal,sourceIds},{now}),null);
  }
});
test('conserva referencias válidas, inmutabilidad y valor cero',()=>{
  const sourceIds=['execution-1','execution-2'];
  const result=createEvidenceSignal({...signal,sourceIds},{now});
  assert.ok(result);assert.equal(result.value,0);assert.ok(Object.isFrozen(result.sourceIds));
  sourceIds.push('execution-3');assert.deepEqual(result.sourceIds,['execution-1','execution-2']);
});
