import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createSessionDraft,
  sessionDraftDefaultsFromState,
} from '../src/m26/workflows/session-builder.js';

const clientId='11111111-1111-4111-8111-111111111111';

test('new Coach session inherits duration from the current training cycle',()=>{
  const state={collections:{
    trainingCycles:[{
      id:'cycle-1',
      clientId,
      body:{clientId,sessionDurationMinutes:75},
    }],
    clientProfiles:[{
      clientId,
      sessionDurationMinutes:60,
    }],
  }};
  const seed=sessionDraftDefaultsFromState(state,clientId);
  const draft=createSessionDraft(seed);

  assert.equal(seed.source,'cycle');
  assert.equal(seed.durationMinutes,75);
  assert.equal(draft.durationMinutes,75);
  assert.equal(draft.clientId,clientId);
  assert.deepEqual(draft.blocks,[]);
});

test('profile duration is used when the cycle does not define one',()=>{
  const state={collections:{
    trainingCycles:[{id:'cycle-1',clientId,body:{clientId,name:'Base'}}],
    clientProfiles:[{clientId,sessionDurationMinutes:65}],
  }};
  const seed=sessionDraftDefaultsFromState(state,clientId);
  assert.equal(seed.source,'profile');
  assert.equal(seed.durationMinutes,65);
});

test('new session keeps the safe 50 minute default when no duration is confirmed',()=>{
  const state={collections:{trainingCycles:[],clientProfiles:[]}};
  const seed=sessionDraftDefaultsFromState(state,clientId);
  assert.equal(seed.source,'default');
  assert.equal(seed.durationMinutes,50);
});

test('application only applies planning defaults to a genuinely new draft',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf('async function onOpenBuilder(event)');
  const end=source.indexOf('async function onStartSession(event)',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);

  assert.match(block,/sourceSession\?createReusableSessionDraft/u);
  assert.match(block,/saved\?\.value\?\.clientId===clientId\?saved\.value/u);
  assert.match(
    block,
    /createSessionDraft\(sessionDraftDefaultsFromState\(state,clientId\)\)/u,
  );
});
