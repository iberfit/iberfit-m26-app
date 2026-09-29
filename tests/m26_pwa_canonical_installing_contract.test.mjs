import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const appPath=new URL('../public/m26/app.js',import.meta.url);

test('canonical app PWA update path adopts an already installing worker',async()=>{
  const source=await readFile(appPath,'utf8');
  assert.match(
    source,
    /registration\.addEventListener\?\.\('updatefound',armInstalling\);\s*armInstalling\(\);\s*activateWaitingWorkerAtColdStart\(registration\);/u,
  );
});
