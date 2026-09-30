import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  hasMeaningfulBootstrapValue,
  inspectClientBootstrap,
} from '../scripts/remote-gates/readonly-gate-bootstrap-privacy.mjs';

test('contenedores privados vacíos no constituyen exposición',()=>{
  const result=inspectClientBootstrap({
    user:{clientId:'CLIENT-A'},
    data:{
      privateNotes:[],
      intelligenceRuns:[],
      coachAvailability:[],
      audit:null,
      raw:{},
      secret:'',
    },
  },'CLIENT-A');

  assert.equal(result.ok,true);
  assert.deepEqual(result.forbiddenKeys,[]);
  assert.deepEqual(result.foreignClientIds,[]);
  assert.deepEqual(result.clientIds,['CLIENT-A']);
});

test('contenido privado no vacío falla cerrado',()=>{
  const result=inspectClientBootstrap({
    user:{clientId:'CLIENT-A'},
    data:{
      privateNotes:[{id:'NOTE-1'}],
      intelligenceRuns:[{id:'AI-1'}],
      coachAvailability:{monday:['09:00']},
    },
  },'CLIENT-A');

  assert.equal(result.ok,false);
  assert.deepEqual(result.forbiddenKeys,[
    'data.coachAvailability',
    'data.intelligenceRuns',
    'data.privateNotes',
  ]);
});

test('un clientId extranjero falla incluso sin claves privadas',()=>{
  const result=inspectClientBootstrap({
    user:{clientId:'CLIENT-A'},
    data:{
      clients:[
        {id:'CLIENT-A',clientId:'CLIENT-A'},
        {id:'CLIENT-B',client_id:'CLIENT-B'},
      ],
    },
  },'CLIENT-A');

  assert.equal(result.ok,false);
  assert.deepEqual(result.foreignClientIds,['CLIENT-B']);
});

test('secretos escalares y objetos raw con contenido se detectan',()=>{
  const result=inspectClientBootstrap({
    user:{clientId:'CLIENT-A'},
    data:{
      accessToken:'token-presente',
      raw:{source:'internal'},
      password:false,
    },
  },'CLIENT-A');

  assert.equal(result.ok,false);
  assert.deepEqual(result.forbiddenKeys,[
    'data.accessToken',
    'data.password',
    'data.raw',
  ]);
});

test('la detección de valor significativo distingue ausencia de exposición',()=>{
  assert.equal(hasMeaningfulBootstrapValue(null),false);
  assert.equal(hasMeaningfulBootstrapValue(undefined),false);
  assert.equal(hasMeaningfulBootstrapValue('   '),false);
  assert.equal(hasMeaningfulBootstrapValue([]),false);
  assert.equal(hasMeaningfulBootstrapValue({}),false);
  assert.equal(hasMeaningfulBootstrapValue(false),true);
  assert.equal(hasMeaningfulBootstrapValue(0),true);
  assert.equal(hasMeaningfulBootstrapValue(['x']),true);
});

function challengeBootstrap(body,entityType='challenge'){
  return {user:{clientId:'CLIENT-A'},data:{m26Entities:[{entityType,clientId:'CLIENT-A',body}]}};
}

test('prohibición canónica de salud raw en Retos no representa exposición',()=>{
  const result=inspectClientBootstrap(challengeBootstrap({clientId:'CLIENT-A',rawHealthDataAllowed:false}),'CLIENT-A');
  assert.equal(result.ok,true);
  assert.deepEqual(result.forbiddenKeys,[]);
});

test('la excepción de Retos sólo permite el booleano false en su ruta canónica',()=>{
  for(const value of [true,'false',0,{allowed:false}]){
    const result=inspectClientBootstrap(challengeBootstrap({rawHealthDataAllowed:value}),'CLIENT-A');
    assert.equal(result.ok,false,JSON.stringify(value));
    assert.deepEqual(result.forbiddenKeys,['data.m26Entities.0.body.rawHealthDataAllowed']);
  }
  for(const bootstrap of [
    challengeBootstrap({rawHealthDataAllowed:false},'habit'),
    challengeBootstrap({nested:{rawHealthDataAllowed:false}}),
    {data:{rawHealthDataAllowed:false}},
    {data:{m26Entities:{record:{entityType:'challenge',body:{rawHealthDataAllowed:false}}}}},
  ])assert.equal(inspectClientBootstrap(bootstrap,'CLIENT-A').ok,false);
});

test('la prohibición de salud no oculta secretos, raw ni clientes extranjeros',()=>{
  const result=inspectClientBootstrap(challengeBootstrap({
    rawHealthDataAllowed:false,raw:{heartRate:100},password:false,clientId:'CLIENT-B',
  }),'CLIENT-A');
  assert.equal(result.ok,false);
  assert.deepEqual(result.forbiddenKeys,['data.m26Entities.0.body.password','data.m26Entities.0.body.raw']);
  assert.deepEqual(result.foreignClientIds,['CLIENT-B']);
});

test('el gate usa el helper comprobable y conserva el contrato de solo lectura',async()=>{
  const gate=await readFile(
    'scripts/remote-gates/run_authenticated_readonly_gate.mjs',
    'utf8',
  );

  assert.match(
    gate,
    /import \{ inspectClientBootstrap \} from '\.\/readonly-gate-bootstrap-privacy\.mjs';/,
  );
  assert.doesNotMatch(gate,/function inspectClientBootstrap\(/);
  assert.match(gate,/private\.\?notes\?/);
  assert.match(gate,/mutationsPerformed:false/);
  assert.doesNotMatch(gate,/method:'(?:PUT|PATCH|DELETE)'/);
});
