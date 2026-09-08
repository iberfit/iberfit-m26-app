import test from 'node:test';
import assert from 'node:assert/strict';
import {
  publishedSessionStartIds,
  sessionStartRequiresExplicitSelection,
} from '../src/m26/experience/session-haptics.js';

function node({action='start-published-session',entityId=''}={}){
  return {
    dataset:{workflowAction:action,entityId},
    getAttribute(name){
      if(name==='data-workflow-action')return action;
      if(name==='data-entity-id')return entityId;
      return null;
    },
  };
}

function root(ids=[]){
  return {
    querySelectorAll(){return ids.map((entityId)=>node({entityId}));},
  };
}

test('generic session CTA requires explicit selection when several published sessions are visible',()=>{
  const scope=root(['SESSION-A','SESSION-B']);
  const generic=node();
  assert.deepEqual([...publishedSessionStartIds(scope)],['SESSION-A','SESSION-B']);
  assert.equal(sessionStartRequiresExplicitSelection(scope,generic),true);
});

test('generic session CTA remains valid when there is exactly one published session',()=>{
  assert.equal(sessionStartRequiresExplicitSelection(root(['SESSION-A']),node()),false);
});

test('explicit session CTA is never blocked and duplicate renderings do not create false ambiguity',()=>{
  assert.deepEqual([...publishedSessionStartIds(root(['SESSION-A','SESSION-A']))],['SESSION-A']);
  assert.equal(sessionStartRequiresExplicitSelection(root(['SESSION-A','SESSION-B']),node({entityId:'SESSION-B'})),false);
});
