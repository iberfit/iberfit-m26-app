import test from 'node:test';
import assert from 'node:assert/strict';
import {createRc39Transport} from '../src/m26/rc39/transport.js';

const runtime=Object.freeze({
  url:'https://gjztkdwfmunnzhtvxrsu.supabase.co',
  publishableKey:'publishable-test',
  version:'26.0.0-canary',
  timeoutMs:2_000,
});

function response(body,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{get:()=> 'application/json'},
    json:async()=>body,
    text:async()=>JSON.stringify(body),
  };
}

test('appointment change list degrades fail-soft on a transient network failure while roles stay available',async()=>{
  const fetchImpl=async(url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/iberfit_authorized_application_roles_v13'))return response({roles:['client']});
    if(path.endsWith('/iberfit_appointment_change_requests_v13'))throw new TypeError('Failed to fetch');
    throw new Error('UNEXPECTED_URL:'+path);
  };
  const transport=createRc39Transport({runtime,fetchImpl});
  const out=await transport.extensions('jwt-test');
  assert.equal(out.rolesAvailable,true);
  assert.deepEqual(out.authorizedRoles,['client']);
  assert.equal(out.changeRequestsAvailable,false);
  assert.deepEqual(out.changeRequests,[]);
});

test('appointment change list timeout degrades fail-soft instead of breaking authenticated startup',async()=>{
  const fetchImpl=async(url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/iberfit_authorized_application_roles_v13'))return response({roles:['client']});
    if(path.endsWith('/iberfit_appointment_change_requests_v13')){
      const error=new Error('aborted');
      error.name='AbortError';
      throw error;
    }
    throw new Error('UNEXPECTED_URL:'+path);
  };
  const transport=createRc39Transport({runtime,fetchImpl});
  const out=await transport.extensions('jwt-test');
  assert.equal(out.rolesAvailable,true);
  assert.equal(out.changeRequestsAvailable,false);
});

test('authorized-role read remains fail-closed on transient network failure',async()=>{
  const fetchImpl=async(url)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/iberfit_authorized_application_roles_v13'))throw new TypeError('Failed to fetch');
    if(path.endsWith('/iberfit_appointment_change_requests_v13'))return response({requests:[]});
    throw new Error('UNEXPECTED_URL:'+path);
  };
  const transport=createRc39Transport({runtime,fetchImpl});
  await assert.rejects(()=>transport.extensions('jwt-test'),/Failed to fetch/u);
});
