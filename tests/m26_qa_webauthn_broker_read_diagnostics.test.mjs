import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const brokerFile=new URL('../supabase/functions/iberfit-qa-webauthn-cert-broker/index.ts',import.meta.url);
const coach={name:'coach',userId:'synthetic-coach',email:'coach@example.invalid',profileRole:'coach'};
const admin={name:'admin',userId:'synthetic-admin',email:'admin@example.invalid',profileRole:'client'};

// Execute only the real broker's pure fixture-validation function, with synthetic
// data and a fail-closed mock. No Supabase network, OIDC token or fixture mutation.
async function loadValidation(){
  const source=await readFile(brokerFile,'utf8');
  const start=source.indexOf('async function validateTarget(');
  const end=source.indexOf('async function setAdminRole(',start);
  assert.ok(start>=0&&end>start,'Broker validation boundaries must exist');
  const body=source.slice(start,end)
    .replace('db:any,target:{name:string;userId:string;email:string;profileRole:string}','db,target')
    .replace('(row:any)=>','(row)=>');
  assert.match(body,/^async function validateTarget\(db,target\)/u);
  assert.doesNotMatch(body,/\bDeno\b|\bfetch\s*\(/u);
  return runInNewContext(`${body}\nvalidateTarget`,{
    Map,
    ORG_ID:'00000000-0000-4000-8000-000000000140',
    fail(code,status=400){const error=new Error(code);error.status=status;throw error;},
  });
}

function fakeDb(target,changes={}){
  const responses={
    auth:{data:{user:{email:target.email}},error:null},
    user_profiles:{data:{role:target.profileRole},error:null},
    iberfit_organization_memberships:{data:{status:'active'},error:null},
    iberfit_coach_client_assignments:{count:0,error:null},
    user_application_roles:{data:[{role:'client',active:true},{role:'admin',active:false}],error:null},
    ...changes,
  };
  const from=(table)=>{
    if(!Object.hasOwn(responses,table))throw new Error('Unexpected fixture table '+table);
    const chain={
      select(){return this;},eq(){return this;},
      in(){return Promise.resolve(responses[table]);},
      maybeSingle(){return Promise.resolve(responses[table]);},
      then(resolve,reject){return Promise.resolve(responses[table]).then(resolve,reject);},
      update(){throw new Error('No fixture mutation is allowed');},
      delete(){throw new Error('No fixture mutation is allowed');},
    };
    return chain;
  };
  return {auth:{admin:{getUserById:async()=>responses.auth}},from};
}

test('valid Coach and Admin synthetic fixture reads remain accepted',async()=>{
  const validate=await loadValidation();
  await assert.doesNotReject(validate(fakeDb(coach),coach));
  await assert.doesNotReject(validate(fakeDb(admin),admin));
});

const cases=[
  ['Auth admin transport failure',coach,{auth:{data:null,error:{message:'upstream unavailable'}}},'IBERFIT_QA_CERT_TARGET_AUTH_READ_FAILED',502],
  ['PGRST303 profile claims failure',coach,{user_profiles:{data:null,error:{code:'PGRST303'}}},'IBERFIT_QA_CERT_TARGET_PROFILE_READ_FAILED',502],
  ['genuine Coach role mismatch',coach,{user_profiles:{data:{role:'client'},error:null}},'IBERFIT_QA_CERT_TARGET_ROLE_INVALID',409],
  ['missing Coach profile',coach,{user_profiles:{data:null,error:null}},'IBERFIT_QA_CERT_TARGET_ROLE_INVALID',409],
  ['membership read failure',coach,{iberfit_organization_memberships:{data:null,error:{code:'PGRST303'}}},'IBERFIT_QA_CERT_TARGET_MEMBERSHIP_READ_FAILED',502],
  ['inactive membership',coach,{iberfit_organization_memberships:{data:{status:'inactive'},error:null}},'IBERFIT_QA_CERT_TARGET_MEMBERSHIP_INVALID',409],
  ['assignments read failure',coach,{iberfit_coach_client_assignments:{count:null,error:{code:'PGRST303'}}},'IBERFIT_QA_CERT_TARGET_ASSIGNMENTS_READ_FAILED',502],
  ['existing Coach assignment',coach,{iberfit_coach_client_assignments:{count:1,error:null}},'IBERFIT_QA_CERT_TARGET_ASSIGNMENTS_PRESENT',409],
  ['Admin roles read failure',admin,{user_application_roles:{data:null,error:{code:'PGRST303'}}},'IBERFIT_QA_CERT_TARGET_APPLICATION_ROLES_READ_FAILED',502],
  ['Admin required role missing',admin,{user_application_roles:{data:[{role:'client',active:true}],error:null}},'IBERFIT_QA_CERT_TARGET_APPLICATION_ROLES_INVALID',409],
  ['identity mismatch',coach,{auth:{data:{user:{email:'other@example.invalid'}},error:null}},'IBERFIT_QA_CERT_TARGET_INVALID',409],
];

for(const [name,target,changes,expectedCode,expectedStatus] of cases){
  test(name+' preserves fail-closed classification',async()=>{
    const validate=await loadValidation();
    await assert.rejects(validate(fakeDb(target,changes),target),(error)=>{
      assert.equal(error.message,expectedCode);
      assert.equal(error.status,expectedStatus);
      return true;
    });
  });
}

test('the QA broker never confuses reads with role changes or expands trust',async()=>{
  const source=await readFile(brokerFile,'utf8');
  assert.match(source,/projectRef\(supabaseUrl\)!==QA_REF/u);
  assert.match(source,/await authenticate\(req,body\)/u);
  assert.match(source,/await validateTarget\(db,body\.target\)/u);
  assert.match(source,/payload\.workflow_ref!==body\.target\.workflowRef/u);
  assert.doesNotMatch(source,/pjhmrhejsoofmouedavw/u);
  assert.doesNotMatch(source,/if\(profileError\|\|/u);
  assert.doesNotMatch(source,/if\(membershipError\|\|/u);
  assert.doesNotMatch(source,/if\(assignmentError\|\|/u);
});
