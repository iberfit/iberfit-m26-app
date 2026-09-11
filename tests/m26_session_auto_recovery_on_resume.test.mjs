import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {recoverExecutionAfterAuthentication} from '../src/m26/app/application.js';

test('automatic recovery resumes an interrupted execution after authentication',async()=>{
  let calls=0;
  const restored=await recoverExecutionAfterAuthentication({
    restoreExecution:async()=>{calls+=1;return true;},
    pendingIriExternalReportIntent:false,
  });
  assert.equal(restored,true);
  assert.equal(calls,1);
});

test('explicit external report intent takes precedence over automatic session recovery',async()=>{
  let calls=0;
  const restored=await recoverExecutionAfterAuthentication({
    restoreExecution:async()=>{calls+=1;return true;},
    pendingIriExternalReportIntent:{status:'valid',assessmentId:'iri-1'},
  });
  assert.equal(restored,false);
  assert.equal(calls,0);
});

test('automatic recovery is fail-soft and reports storage/recovery errors without blocking entry',async()=>{
  const diagnostics=[];
  const restored=await recoverExecutionAfterAuthentication({
    restoreExecution:async()=>{throw new Error('LOCAL_RECOVERY_UNAVAILABLE');},
    reportDiagnostic:(code,error)=>diagnostics.push({code,message:error.message}),
  });
  assert.equal(restored,false);
  assert.deepEqual(diagnostics,[{
    code:'session-recovery-auto-restore',
    message:'LOCAL_RECOVERY_UNAVAILABLE',
  }]);
});

test('diagnostic failures cannot turn recovery failure into an authentication blocker',async()=>{
  const restored=await recoverExecutionAfterAuthentication({
    restoreExecution:async()=>{throw new Error('RECOVERY_READ_FAILED');},
    reportDiagnostic:()=>{throw new Error('DIAGNOSTIC_FAILED');},
  });
  assert.equal(restored,false);
});

test('a blocked local recovery store cannot hold authenticated entry indefinitely',async()=>{
  const diagnostics=[];
  const started=Date.now();
  const restored=await recoverExecutionAfterAuthentication({
    restoreExecution:()=>new Promise(()=>{}),
    timeoutMs:20,
    reportDiagnostic:(code,error)=>diagnostics.push({code,message:error.message}),
  });
  assert.equal(restored,false);
  assert.ok(Date.now()-started<500,'post-login recovery must fail open promptly');
  assert.deepEqual(diagnostics,[{
    code:'session-recovery-auto-restore',
    message:'M26_SESSION_RECOVERY_TIMEOUT',
  }]);
});

test('authenticated setup restores before first final render and only consumes deep-link when not restored',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const setupStart=source.indexOf('async function setupAuthenticated()');
  const setupEnd=source.indexOf('function guardSessionNavigation',setupStart);
  assert.ok(setupStart>=0&&setupEnd>setupStart);
  const setup=source.slice(setupStart,setupEnd);

  const restore=setup.indexOf('const executionRestored=await restoreExecutionAfterAuthentication();');
  const render=setup.indexOf('render();',restore);
  const external=setup.indexOf('if(!executionRestored)await consumePendingIriExternalReportIntent();',render);
  assert.ok(restore>=0&&render>restore&&external>render);
  assert.ok(setup.includes("if(executionRestored)qaStage('rc64-session-auto-recovered');"));
});

test('existing manual start recovery remains available as a second continuity path',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf('async function onStartSession(event)');
  assert.ok(start>=0);
  const block=source.slice(start,start+3500);
  assert.ok(block.includes('recoveryCoordinator?.latest?.({clientId})'));
  assert.ok(block.includes('Sesión recuperada desde este dispositivo.'));
  assert.ok(block.includes("store.navigate('sesion')"));
});
