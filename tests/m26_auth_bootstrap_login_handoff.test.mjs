import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preserveLoginInputsDuringMount} from '../src/m26/app/application.js';

function createField(doc,value=''){
  return {value,selectionStart:0,selectionEnd:0,
    focus(){doc.activeElement=this;},
    setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}};
}
function createHandoff({oldEmail='user@example.test',oldPassword='synthetic-only-pass',
  newEmail='',newPassword='',busy=false,focus='password',replace=true}={}){
  const doc={activeElement:null};
  const makeForm=(email,password,cardBusy)=>({
    fields:{email,password},
    querySelector(query){return query==='input[name="email"]'?email:query==='input[name="password"]'?password:null;},
    closest(query){return query==='.m26-auth-card'?{getAttribute(name){
      return name==='aria-busy'?(cardBusy?'true':'false'):null;
    }}:null;},
  });
  const old=makeForm(createField(doc,oldEmail),createField(doc,oldPassword),busy);
  const next=makeForm(createField(doc,newEmail),createField(doc,newPassword),false);
  if(focus)doc.activeElement=old.fields[focus];
  let current=old,renders=0;
  const root={ownerDocument:doc,querySelector(query){
    return query==='[data-auth-form="login"]'?current:null;
  }};
  const render=()=>{renders++;if(replace)current=next;};
  return {root,render,doc,old,next,get renders(){return renders;}};
}

test('bootstrap/full-app handoff preserves unsent fields, focus and password selection',()=>{
  const x=createHandoff();
  x.old.fields.password.selectionStart=5;
  x.old.fields.password.selectionEnd=8;
  assert.equal(preserveLoginInputsDuringMount(x.root,x.render),true);
  assert.equal(x.renders,1);
  assert.equal(x.next.fields.email.value,'user@example.test');
  assert.equal(x.next.fields.password.value,'synthetic-only-pass');
  assert.equal(x.doc.activeElement,x.next.fields.password);
  assert.deepEqual([x.next.fields.password.selectionStart,x.next.fields.password.selectionEnd],[5,8]);
});

test('handoff never recopies an in-flight login: full mount must not duplicate auth submission',()=>{
  const x=createHandoff({busy:true});
  assert.equal(preserveLoginInputsDuringMount(x.root,x.render),false);
  assert.equal(x.renders,1);
  assert.equal(x.next.fields.email.value,'');
  assert.equal(x.next.fields.password.value,'');
  assert.equal(x.doc.activeElement,x.old.fields.password);
});

test('handoff is one-shot: unchanged DOM, absent replacement or existing autofill are preserved',()=>{
  const stable=createHandoff({replace:false});
  assert.equal(preserveLoginInputsDuringMount(stable.root,stable.render),false);
  const next=createHandoff({newEmail:'new-autofilled@example.test',newPassword:'already-entered'});
  assert.equal(preserveLoginInputsDuringMount(next.root,next.render),true);
  assert.equal(next.next.fields.email.value,'new-autofilled@example.test');
  assert.equal(next.next.fields.password.value,'already-entered');
});

test('initial-mount handoff never persists or transmits credentials and later renders are unchanged',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const begin=source.indexOf('export function preserveLoginInputsDuringMount(');
  const end=source.indexOf('  function authMessage(',begin);
  assert.ok(begin>=0&&end>begin);
  const helper=source.slice(begin,end);
  assert.doesNotMatch(helper,/localStorage|sessionStorage|fetch\(|console\.|dispatchEvent|setTimeout/u);
  assert.match(source,/preserveLoginInputsDuringMount\(root,\(\)=>authMessage\(\)\)/u);
  assert.equal(source.match(/preserveLoginInputsDuringMount\(root,\(\)=>authMessage\(\)\)/gu)?.length,1);
});
