import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installClientOnboardingInvitationTransport,
  __clientOnboardingInvitationTransportInternals as internals,
} from '../src/m26/workflows/client-onboarding-invitation-transport.js';

test('only exact client-create RPCs on canonical Supabase origins are rerouted',()=>{
  const qa=new Request('https://gjztkdwfmunnzhtvxrsu.supabase.co/rest/v1/rpc/iberfit_create_client_draft_v12',{method:'POST'});
  const prod=new Request('https://pjhmrhejsoofmouedavw.supabase.co/rest/v1/rpc/iberfit_create_client_draft_v12',{method:'POST'});
  const bootstrap=new Request('https://gjztkdwfmunnzhtvxrsu.supabase.co/rest/v1/rpc/iberfit_bootstrap_v26',{method:'POST'});
  const foreign=new Request('https://example.com/rest/v1/rpc/iberfit_create_client_draft_v12',{method:'POST'});
  assert.equal(internals.targetFor(qa),'https://gjztkdwfmunnzhtvxrsu.supabase.co/functions/v1/iberfit-client-onboarding-v1');
  assert.equal(internals.targetFor(prod),'https://pjhmrhejsoofmouedavw.supabase.co/functions/v1/iberfit-client-onboarding-v1');
  assert.equal(internals.targetFor(bootstrap),null);
  assert.equal(internals.targetFor(foreign),null);
});

test('reroute unwraps p_payload and preserves bearer headers without exposing server credentials',async()=>{
  const calls=[];
  const scope={
    fetch:async(input,init)=>{calls.push({input:String(input),init});return new Response(JSON.stringify({ok:true,visible:true,client_id:'11111111-1111-4111-8111-111111111111',invitation:{status:'sent'}}),{status:200,headers:{'content-type':'application/json'}});},
  };
  assert.equal(installClientOnboardingInvitationTransport(scope),true);
  await scope.fetch('https://gjztkdwfmunnzhtvxrsu.supabase.co/rest/v1/rpc/iberfit_create_client_draft_v12',{
    method:'POST',headers:{authorization:'Bearer test-token',apikey:'public-key','content-type':'application/json'},body:JSON.stringify({p_payload:{email:'qa.rc99.invite@iberfit.cl',name:'Synthetic'}}),
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0].input,'https://gjztkdwfmunnzhtvxrsu.supabase.co/functions/v1/iberfit-client-onboarding-v1');
  assert.equal(JSON.parse(calls[0].init.body).email,'qa.rc99.invite@iberfit.cl');
  const headers=new Headers(calls[0].init.headers);
  assert.equal(headers.get('authorization'),'Bearer test-token');
  assert.equal(headers.get('apikey'),'public-key');
  assert.equal(headers.get('service-role'),null);
});

test('UI wording distinguishes sent, linked account, error and pending',()=>{
  assert.equal(internals.invitationUi('sent').kind,'success');
  assert.match(internals.invitationUi('sent').text,/enviada/u);
  assert.match(internals.invitationUi('linked_existing').text,/existente vinculada/u);
  assert.equal(internals.invitationUi('error').kind,'error');
  assert.match(internals.invitationUi('error').text,/pendiente de reintento/u);
  assert.equal(internals.invitationUi('pending').kind,'pending');
});
