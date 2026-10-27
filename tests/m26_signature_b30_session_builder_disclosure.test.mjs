import test from 'node:test';
import assert from 'node:assert/strict';
import {captureSessionBuilderDisclosureState,restoreSessionBuilderDisclosureState} from '../src/m26/workflows/session-controller.js';

const fakeDetails=(key,open=false)=>({open,getAttribute:(name)=>name==='data-session-disclosure-key'?key:null});
const fixture=(entries,present=true)=>{
  const panel={querySelectorAll:()=>entries};
  return {querySelector:()=>present?panel:null};
};

test('B30: advanced prescription remains open after same-draft rerender',()=>{
  const before=fixture([fakeDetails('block:abc',true),fakeDetails('group:abc:ex2',true),fakeDetails('templates',false)]);
  const snapshot=captureSessionBuilderDisclosureState(before,'draft-1');
  const b=fakeDetails('block:abc'),g=fakeDetails('group:abc:ex2'),t=fakeDetails('templates');
  assert.equal(restoreSessionBuilderDisclosureState(fixture([b,g,t]),snapshot,'draft-1'),2);
  assert.equal(b.open,true);assert.equal(g.open,true);assert.equal(t.open,false);
});
test('B30: disclosure state never crosses distinct clients or drafts',()=>{
  const snapshot=captureSessionBuilderDisclosureState(fixture([fakeDetails('block:abc',true)]),'draft-A');
  const other=fakeDetails('block:abc');
  assert.equal(restoreSessionBuilderDisclosureState(fixture([other]),snapshot,'draft-B'),0);
  assert.equal(other.open,false);
});
test('B30: working Client/player route does not capture Coach builder state',()=>{
  assert.equal(captureSessionBuilderDisclosureState(fixture([],false),'draft-A'),null);
  assert.equal(restoreSessionBuilderDisclosureState(fixture([],false),{draftId:'draft-A',open:['block:abc']},'draft-A'),0);
});
test('B30: rejects invalid disclosure keys and never stores user-entered values',()=>{
  const root=fixture([fakeDetails('<script>',true),fakeDetails('block:a',true),fakeDetails('block:a',true)]);
  const snapshot=captureSessionBuilderDisclosureState(root,'draft-A');
  assert.deepEqual(snapshot.open,['block:a']);
  assert.deepEqual(Object.keys(snapshot),['draftId','open']);
});
test('B30: no persistence and bounded memory across a large session',()=>{
  const root=fixture(Array.from({length:600},(_,i)=>fakeDetails('block:ex-'+i,true)));
  const snap=captureSessionBuilderDisclosureState(root,'draft-1');
  assert.ok(snap.open.length<=120);
  assert.ok(Object.isFrozen(snap)&&Object.isFrozen(snap.open));
});

import {captureSessionBuilderFocus,restoreSessionBuilderFocus} from '../src/m26/workflows/session-controller.js';
function fieldNode(kind,field,{blockId='',exerciseId='',selection=3}={}){
  const attr='data-session-'+kind;
  const attrs={[attr]:field,'data-block-id':blockId,'data-exercise-id':exerciseId};
  return {
    attrs,selectionStart:selection,selectionEnd:selection,selected:false,
    getAttribute:(key)=>Object.hasOwn(attrs,key)?attrs[key]:null,
    focus(){this.selected=true;},
    setSelectionRange(start,end){this.recovered=[start,end];},
  };
}
function formRoot(elements,focused=null){
 const panel={querySelectorAll:()=>elements,contains:(node)=>elements.includes(node)};
 return {querySelector:()=>panel,ownerDocument:{activeElement:focused}};
}
test('B30: restores exact exercise cursor after same draft rerender',()=>{
 const prior=fieldNode('block-field','reps',{blockId:'block-1',selection:4});
 const snapshot=captureSessionBuilderFocus(formRoot([prior],prior),'draft-1');
 const next=fieldNode('block-field','reps',{blockId:'block-1',selection:0});
 assert.equal(restoreSessionBuilderFocus(formRoot([next]),snapshot,'draft-1'),true);
 assert.equal(next.selected,true);
 assert.deepEqual(next.recovered,[4,4]);
});
test('B30: never steals intentional focus or leaks across drafts',()=>{
 const before=fieldNode('block-field','reps',{blockId:'block-1'});
 const snap=captureSessionBuilderFocus(formRoot([before],before),'draft-1');
 const after=fieldNode('block-field','reps',{blockId:'block-1'});
 assert.equal(restoreSessionBuilderFocus(formRoot([after]),snap,'draft-2'),false);
 assert.equal(restoreSessionBuilderFocus(formRoot([after],after),snap,'draft-1'),false);
 assert.equal(after.selected,false);
});
test('B30: never moves focus to another exercise with identical field name',()=>{
 const before=fieldNode('block-field','reps',{blockId:'group-1',exerciseId:'ex-1'});
 const snap=captureSessionBuilderFocus(formRoot([before],before),'draft-1');
 const after=fieldNode('block-field','reps',{blockId:'group-1',exerciseId:'ex-2'});
 assert.equal(restoreSessionBuilderFocus(formRoot([after]),snap,'draft-1'),false);
 assert.equal(after.selected,false);
});
test('B30: preserves search caret without saving entered text',()=>{
 const previous=fieldNode('search','',{selection:7});
 const snap=captureSessionBuilderFocus(formRoot([previous],previous),'draft-1');
 assert.ok(!Object.keys(snap).includes('value'));
 const current=fieldNode('search','',{selection:0});
 assert.equal(restoreSessionBuilderFocus(formRoot([current]),snap,'draft-1'),true);
 assert.deepEqual(current.recovered,[7,7]);
});

import {isCoachDraftSaveShortcut} from '../src/m26/workflows/session-controller.js';
test('B30 Ctrl or Cmd S uses the guarded draft-save button without bypassing publication',()=>{
 const button={disabled:false,getAttribute:()=>null};
 const root={querySelector:(s)=>s.includes('workbench')?{}:button};
 const target={closest:()=>({})};
 const context={actor:{role:'coach'},draft:{id:'d-1'}};
 assert.equal(isCoachDraftSaveShortcut({key:'s',ctrlKey:true,target},context,root),true);
 assert.equal(isCoachDraftSaveShortcut({key:'s',metaKey:true,target},context,root),true);
 assert.equal(isCoachDraftSaveShortcut({key:'s',ctrlKey:true,target},{actor:{role:'client'},draft:{id:'d-1'}},root),false);
 assert.equal(isCoachDraftSaveShortcut({key:'s',ctrlKey:true,repeat:true,target},context,root),false);
 assert.equal(isCoachDraftSaveShortcut({key:'s',ctrlKey:true,altKey:true,target},context,root),false);
});
test('B30 shortcut respects missing and disabled buttons',()=>{
 const context={actor:{role:'coach'},draft:{id:'d-1'}},event={key:'s',ctrlKey:true};
 assert.equal(isCoachDraftSaveShortcut(event,context,{querySelector:s=>s.includes('workbench')?{}:null}),false);
 assert.equal(isCoachDraftSaveShortcut(event,context,{querySelector:s=>s.includes('workbench')?{}:{disabled:true,getAttribute:()=>null}}),false);
});

test('B30: keyboard shortcut never captures other overlays or already-consumed keys',()=>{
 const context={actor:{role:'coach'},draft:{id:'d'}};
 const root={querySelector:()=>({disabled:false,getAttribute:()=>null})};
 assert.equal(isCoachDraftSaveShortcut({key:'s',ctrlKey:true,target:{closest:()=>null}},context,root),false);
 assert.equal(isCoachDraftSaveShortcut({key:'s',ctrlKey:true,defaultPrevented:true,target:{closest:()=>({})}},context,root),false);
});
