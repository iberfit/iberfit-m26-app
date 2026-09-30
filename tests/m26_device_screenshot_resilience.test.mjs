import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureEvidenceScreenshot,isTransientScreenshotError} from '../qa/device-experience/reliable-screenshot.mjs';

const DEVICE_SPECS=[
  new URL('../qa/device-experience/device-experience.spec.mjs',import.meta.url),
  new URL('../qa/device-experience/progress-decision-runtime.spec.mjs',import.meta.url),
  new URL('../qa/device-experience/role-guided-onboarding.spec.mjs',import.meta.url),
];

const transientError=()=>new Error('page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot');

test('device evidence screenshot retry is bounded to the known Chromium capture failure',async()=>{
  let captures=0;
  let waits=0;
  let settles=0;
  const page={
    async screenshot(){
      captures+=1;
      if(captures===1)throw transientError();
      return Buffer.from('ok');
    },
    async waitForTimeout(){waits+=1;},
    async evaluate(){settles+=1;},
  };

  const result=await captureEvidenceScreenshot(page,{path:'evidence.png'});
  assert.equal(result.toString(),'ok');
  assert.equal(captures,2);
  assert.equal(waits,1);
  assert.equal(settles,1);
  assert.equal(isTransientScreenshotError(transientError()),true);
});

test('device evidence screenshot does not retry unrelated failures',async()=>{
  let captures=0;
  const failure=new Error('page.screenshot: EACCES: permission denied');
  const page={
    async screenshot(){captures+=1;throw failure;},
    async waitForTimeout(){throw new Error('must not wait');},
  };

  await assert.rejects(()=>captureEvidenceScreenshot(page,{path:'evidence.png'}),(error)=>error===failure);
  assert.equal(captures,1);
  assert.equal(isTransientScreenshotError(failure),false);
});

test('device evidence screenshot fails after the bounded retry is exhausted',async()=>{
  let captures=0;
  const page={
    async screenshot(){captures+=1;throw transientError();},
    async waitForTimeout(){},
    async evaluate(){},
  };

  await assert.rejects(()=>captureEvidenceScreenshot(page,{path:'evidence.png'}),/Unable to capture screenshot/u);
  assert.equal(captures,2);
});

test('all Device Experience specs use the resilient evidence capture contract',async()=>{
  for(const path of DEVICE_SPECS){
    const source=await readFile(path,'utf8');
    assert.match(source,/captureEvidenceScreenshot/u,`${path.pathname} must use captureEvidenceScreenshot`);
    assert.doesNotMatch(source,/\bpage\.screenshot\s*\(/u,`${path.pathname} must not bypass resilient capture`);
  }
});
