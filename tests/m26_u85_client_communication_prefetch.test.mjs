import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canPrefetchClientCommunication} from '../src/m26/app/client-communication-prefetch.js';

test('U85 parallel optional communication is permitted only for independently verified single-role Clients',()=>{
  assert.equal(canPrefetchClientCommunication(['client']),true);
  assert.equal(canPrefetchClientCommunication(['client'],'client'),true);
  for(const roles of [[],['coach'],['admin'],['client','coach'],['client','admin'],['client','client'],['authenticated'],null]){
    assert.equal(canPrefetchClientCommunication(roles),false);
  }
  assert.equal(canPrefetchClientCommunication(['client'],'coach'),false);
  assert.equal(canPrefetchClientCommunication(['client'],'admin'),false);
});

test('U85 never pre-renders unverified state, never starts an extra role request and preserves old path for Coach and Admin',()=>{
  const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  const begin=source.indexOf('const extensionsPending=');
  const prefetch=source.indexOf('const clientCommunicationPending=',begin);
  const primary=source.indexOf('const [snapshot,installed,extensions,contextExtension,backendV43,wearableV44]',prefetch);
  const secondary=source.indexOf('const [adminExtension,communicationExtension,v47Daily]',primary);
  const commit=source.indexOf('store.hydrate(enriched)',secondary);
  assert.ok(begin>0&&prefetch>begin&&primary>prefetch&&secondary>primary&&commit>secondary);
  assert.match(source.slice(prefetch,primary),/verifiedContext.roles.length\?verifiedContext.roles:earlyExtensions.authorizedRoles/u);
  assert.match(source.slice(prefetch,primary),/canPrefetchClientCommunication\(verifiedRoles,preferredEarlyRole\)/u);
  assert.match(source.slice(prefetch,primary),/requireOwner\(\)/u);
  assert.match(source.slice(secondary,commit),/if\(activeRole==='client'\)/u);
  assert.match(source.slice(secondary,commit),/communicationTransport.bootstrapOptional\(currentToken\(\),\{application:activeRole\}\)/u);
  assert.match(source.slice(secondary,commit),/requireOwner\(\)/u);
});
