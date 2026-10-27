import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSessionDraft} from '../src/m26/workflows/session-builder.js';
import {renderSessionBuilder} from '../src/m26/workflows/session-ui.js';

const catalog={
  search:()=>[],
  list:()=>[],
  get:()=>null,
  has:()=>false,
};

test('Coach sees an explicit two-step draft discard that cannot affect published sessions',()=>{
  const draft=createSessionDraft({clientId:'client-discard',deliveryModality:'presencial'});
  const html=renderSessionBuilder({draft,catalog,role:'coach'});
  assert.match(html,/class="m26-draft-discard"/);
  assert.match(html,/Descartar borrador/);
  assert.match(html,/data-session-action="discard-draft"/);
  assert.match(html,/No modifica ninguna sesión publicada/);
});

test('discard is fail-closed: synchronized copy is removed before local recovery copy',()=>{
  const app=readFileSync('src/m26/app/application.js','utf8');
  const start=app.indexOf('async function discardCurrentSessionDraft()');
  const end=app.indexOf('async function restoreExecution(',start);
  assert.ok(start>=0&&end>start);
  const body=app.slice(start,end);
  assert.match(body,/M26_SESSION_DRAFT_DELETE_REQUIRES_CONNECTION/);
  const remote=body.indexOf('transport.deleteSessionDraft');
  const local=body.indexOf("draftRepository?.remove?.");
  const navigate=body.indexOf("store.navigate('sesion')");
  assert.ok(remote>=0&&local>remote,'remote delete must be confirmed first');
  assert.ok(navigate>local,'navigation only after remote and local deletion');
  assert.doesNotMatch(body,/clearSessionDraft\(clientId\)/);
});

test('controller does not persist the deleted draft again after a successful discard',()=>{
  const source=readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(source,/action==='discard-draft'/);
  assert.match(source,/M26_SESSION_DRAFT_DISCARD_UNAVAILABLE/);
  assert.match(source,/outcome\.ok&&action!=='discard-draft'/);
});

test('application wires the discard handler into the active session controller',()=>{
  const source=readFileSync('src/m26/app/application.js','utf8');
  assert.match(source,/discardDraft:discardCurrentSessionDraft/);
  assert.match(source,/M26_SESSION_DRAFT_LOCAL_DELETE_FAILED/);
});
