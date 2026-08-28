import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createM26Transport,
  resolveM26Runtime,
} from '../src/m26/supabase-transport.js';
import {
  renderAccessUi,
} from '../src/m26/app/access-ui.js';
import {
  privilegedMfaDecision,
} from '../src/m26/app/application.js';

const QA_URL='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const USER_ID='11111111-1111-4111-8111-111111111111';
const FACTOR_ID='22222222-2222-4222-8222-222222222222';
const CHALLENGE_ID='33333333-3333-4333-8333-333333333333';

function runtime(){
  return resolveM26Runtime(
    {
      enabled:true,
      qaOnly:true,
      projectRef:'gjztkdwfmunnzhtvxrsu',
      url:QA_URL,
      publishableKey:'sb_publishable_rc65c1_test_key',
    },
    {
      hostname:'m26-canary.iberfit.cl',
      protocol:'https:',
    },
  );
}

function jsonResponse(body,status=200){
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers:{'content-type':'application/json'},
    },
  );
}

test('RC65-C1 Client aal1 continúa; Coach/Admin aal1 quedan detrás de MFA',()=>{
  assert.deepEqual(
    privilegedMfaDecision(
      {mfaRequired:false,aal:'aal1'},
      [],
    ),
    {kind:'ready'},
  );

  assert.deepEqual(
    privilegedMfaDecision(
      {mfaRequired:true,aal:'aal2'},
      [{factorId:FACTOR_ID,factorType:'totp',status:'verified'}],
    ),
    {kind:'ready'},
  );

  assert.deepEqual(
    privilegedMfaDecision(
      {mfaRequired:true,aal:'aal1'},
      [],
    ),
    {kind:'enroll-required'},
  );

  assert.deepEqual(
    privilegedMfaDecision(
      {mfaRequired:true,aal:'aal1'},
      [{factorId:FACTOR_ID,factorType:'totp',status:'verified'}],
    ),
    {kind:'challenge',factorId:FACTOR_ID},
  );
});

test('RC65-C1 transporte usa assurance mínimo y GET user antes de MFA',async()=>{
  const calls=[];
  const previous=globalThis.fetch;
  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));
    calls.push({
      method:String(options.method||'GET').toUpperCase(),
      path:parsed.pathname,
      authorization:String(options.headers?.authorization||''),
      body:String(options.body||''),
    });

    if(parsed.pathname==='/rest/v1/rpc/iberfit_auth_assurance_context_v65c'){
      return jsonResponse({
        ok:true,
        privileged:true,
        privilegedRole:'coach',
        mfaRequired:true,
        aal:'aal1',
      });
    }

    if(parsed.pathname==='/auth/v1/user'){
      return jsonResponse({
        id:USER_ID,
        email:'qa.rc74.coach@iberfit.cl',
        factors:[
          {
            id:FACTOR_ID,
            factor_type:'totp',
            status:'verified',
            friendly_name:'IBERFIT',
          },
        ],
      });
    }

    throw new Error(`UNEXPECTED:${parsed.pathname}`);
  };

  try{
    const transport=createM26Transport(runtime());
    const assurance=await transport.authAssuranceContext('header.payload.signature');
    const user=await transport.authUser('header.payload.signature');

    assert.equal(assurance.mfaRequired,true);
    assert.equal(assurance.aal,'aal1');
    assert.equal(user.factors.length,1);
    assert.equal(user.factors[0].factorId,FACTOR_ID);

    assert.deepEqual(
      calls.map(({method,path})=>({method,path})),
      [
        {method:'POST',path:'/rest/v1/rpc/iberfit_auth_assurance_context_v65c'},
        {method:'GET',path:'/auth/v1/user'},
      ],
    );
    assert.ok(calls.every((item)=>item.authorization==='Bearer header.payload.signature'));
  }finally{
    globalThis.fetch=previous;
  }
});

test('RC65-C1 enrolamiento TOTP + challenge/verify actualizan sesión',async()=>{
  const calls=[];
  const previous=globalThis.fetch;

  globalThis.fetch=async(url,options={})=>{
    const parsed=new URL(String(url));
    const method=String(options.method||'GET').toUpperCase();
    calls.push({
      method,
      path:parsed.pathname,
      body:String(options.body||''),
    });

    if(parsed.pathname==='/auth/v1/factors'&&method==='POST'){
      return jsonResponse({
        id:FACTOR_ID,
        type:'totp',
        totp:{
          qr_code:'<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          secret:'ABCDEFGHIJKLMNOP',
          uri:'otpauth://totp/IBERFIT:test?secret=ABCDEFGHIJKLMNOP&issuer=IBERFIT',
        },
      });
    }

    if(parsed.pathname===`/auth/v1/factors/${FACTOR_ID}/challenge`&&method==='POST'){
      return jsonResponse({id:CHALLENGE_ID,type:'totp'});
    }

    if(parsed.pathname===`/auth/v1/factors/${FACTOR_ID}/verify`&&method==='POST'){
      return jsonResponse({
        access_token:'header.aal2.signature',
        refresh_token:'refresh-token-rc65c1',
        expires_at:1_800_000_000,
        user:{
          id:USER_ID,
          email:'qa.rc74.coach@iberfit.cl',
        },
      });
    }

    throw new Error(`UNEXPECTED:${method}:${parsed.pathname}`);
  };

  try{
    const transport=createM26Transport(runtime());
    const enrollment=await transport.enrollTotp('header.aal1.signature');
    assert.equal(enrollment.factorId,FACTOR_ID);
    assert.equal(enrollment.secret,'ABCDEFGHIJKLMNOP');
    assert.match(enrollment.uri,/^otpauth:\/\/totp\//u);

    const next=await transport.verifyMfa(
      'header.aal1.signature',
      {factorId:FACTOR_ID,code:'123456'},
    );

    assert.equal(next.token,'header.aal2.signature');
    assert.equal(next.refreshToken,'refresh-token-rc65c1');
    assert.equal(next.user.id,USER_ID);

    assert.deepEqual(
      calls.map(({method,path})=>({method,path})),
      [
        {method:'POST',path:'/auth/v1/factors'},
        {method:'POST',path:`/auth/v1/factors/${FACTOR_ID}/challenge`},
        {method:'POST',path:`/auth/v1/factors/${FACTOR_ID}/verify`},
      ],
    );

    const enrollBody=JSON.parse(calls[0].body);
    assert.equal(enrollBody.factor_type,'totp');
    assert.equal(enrollBody.friendly_name,'IBERFIT Authenticator');

    const verifyBody=JSON.parse(calls[2].body);
    assert.deepEqual(
      verifyBody,
      {challenge_id:CHALLENGE_ID,code:'123456'},
    );
  }finally{
    globalThis.fetch=previous;
  }
});

test('RC65-C1 rechaza IDs de factor y códigos no canónicos antes de red',async()=>{
  let calls=0;
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>{calls+=1;throw new Error('NETWORK_SHOULD_NOT_RUN');};

  try{
    const transport=createM26Transport(runtime());

    await assert.rejects(
      ()=>transport.verifyMfa(
        'header.aal1.signature',
        {factorId:'../../otro',code:'123456'},
      ),
      /M26_MFA_FACTOR_ID_INVALID/u,
    );

    await assert.rejects(
      ()=>transport.verifyMfa(
        'header.aal1.signature',
        {factorId:FACTOR_ID,code:'12A456'},
      ),
      /M26_MFA_CODE_INVALID/u,
    );

    assert.equal(calls,0);
  }finally{
    globalThis.fetch=previous;
  }
});

test('RC65-C1 UI diferencia enrolamiento y challenge sin bootstrap privilegiado',()=>{
  const required=renderAccessUi({
    mode:'mfa-required',
    mfa:{privilegedRole:'coach'},
  });
  assert.match(required,/Verificación en dos pasos obligatoria/u);
  assert.match(required,/Configurar verificación/u);
  assert.match(required,/data-auth-action="mfa-start-enrollment"/u);

  const enroll=renderAccessUi({
    mode:'mfa-enroll-totp',
    mfa:{
      privilegedRole:'coach',
      secret:'ABCDEFGHIJKLMNOP',
      qrCode:'<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    },
  });
  assert.match(enroll,/Configura tu verificación en dos pasos/u);
  assert.match(enroll,/Código de 6 dígitos/u);
  assert.match(enroll,/data-auth-form="mfa-verify"/u);
  assert.match(enroll,/data:image\/svg\+xml/u);

  const challenge=renderAccessUi({
    mode:'mfa-challenge',
    mfa:{factorId:FACTOR_ID,privilegedRole:'admin'},
  });
  assert.match(challenge,/Confirma tu segundo factor/u);
  assert.match(challenge,/data-auth-form="mfa-verify"/u);
});

test('RC65-C1 migración no expone assurance a anon/public',()=>{
  const sql=fs.readFileSync(
    'supabase/migrations/20260828143000_rc65c1_auth_assurance_context.sql',
    'utf8',
  );

  assert.match(sql,/security definer/u);
  assert.match(sql,/set search_path=''/u);
  assert.match(sql,/revoke all on function public\.iberfit_auth_assurance_context_v65c\(\) from public;/u);
  assert.match(sql,/revoke all on function public\.iberfit_auth_assurance_context_v65c\(\) from anon;/u);
  assert.match(sql,/grant execute on function public\.iberfit_auth_assurance_context_v65c\(\) to authenticated;/u);
  assert.doesNotMatch(sql,/assignedClientIds|clientProfiles|email/u);
});

test('RC65-C1 smoke remoto sigue read-only y exige MFA gate del Coach',()=>{
  const smoke=fs.readFileSync('qa/rc64/authenticated-smoke.spec.mjs','utf8');

  assert.match(smoke,/iberfit_auth_assurance_context_v65c/u);
  assert.match(smoke,/url\.pathname==='\/auth\/v1\/user'/u);
  assert.match(smoke,/RC65_C1_COACH_MFA_GATE_PASS/u);
  assert.match(smoke,/mfaRequired:true/u);

  assert.doesNotMatch(
    smoke,
    /url\.pathname\.startsWith\('\/auth\/v1\/factors'\)/u,
  );
});
