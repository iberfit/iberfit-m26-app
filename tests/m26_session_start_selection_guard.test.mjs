import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureCoachPublishedSessionStartActions,
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

function coachPublishedFixture(entityId='SESSION-A'){
  const explicit=[];
  const documentLike={
    createElement(tag){
      const attributes=new Map();
      return {
        tag,
        children:[],
        className:'',
        type:'',
        textContent:'',
        setAttribute(name,value){attributes.set(name,String(value));},
        getAttribute(name){return attributes.get(name)??null;},
        append(child){this.children.push(child);},
      };
    },
  };
  const card={
    ownerDocument:documentLike,
    querySelectorAll(selector){
      return selector.includes('start-published-session')?explicit:[];
    },
    append(host){
      const button=host.children?.find((item)=>item.getAttribute?.('data-workflow-action')==='start-published-session');
      if(button)explicit.push(button);
    },
  };
  const manage={
    insertAdjacentElement(position,host){
      assert.equal(position,'beforebegin');
      card.append(host);
    },
  };
  const control={
    dataset:{workflowAction:'manage-publication',entityId},
    ownerDocument:documentLike,
    getAttribute(name){
      if(name==='data-workflow-action')return 'manage-publication';
      if(name==='data-publication-entity')return 'session';
      if(name==='data-publication-action')return 'withdraw';
      if(name==='data-entity-id')return entityId;
      return null;
    },
    closest(selector){
      if(selector==='[data-publication-card]')return card;
      if(selector==='.m26-publication-actions')return manage;
      return null;
    },
  };
  const scope={
    ownerDocument:documentLike,
    querySelectorAll(selector){
      if(selector.includes('manage-publication'))return [control];
      if(selector.includes('start-published-session'))return explicit;
      return [];
    },
  };
  return {scope,explicit};
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

test('coach published session gets one exact explicit start action',()=>{
  const fixture=coachPublishedFixture('SESSION-A');
  assert.equal(ensureCoachPublishedSessionStartActions(fixture.scope),1);
  assert.equal(fixture.explicit.length,1);
  assert.equal(fixture.explicit[0].getAttribute('data-workflow-action'),'start-published-session');
  assert.equal(fixture.explicit[0].getAttribute('data-entity-id'),'SESSION-A');
  assert.equal(fixture.explicit[0].textContent,'Iniciar esta sesión');
  assert.equal(ensureCoachPublishedSessionStartActions(fixture.scope),0);
  assert.equal(fixture.explicit.length,1);
});
