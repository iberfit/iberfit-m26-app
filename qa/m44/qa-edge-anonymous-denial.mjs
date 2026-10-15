// LIVE QA read-only security smoke: no credentials, no personal identifiers,
// no production requests, no database writes and no mutations permitted.
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const ENDPOINT=ORIGIN+'/functions/v1/iberfit-evolution-report-emission-v1';
const QA_APP='https://m26-canary.iberfit.cl';
const ATTACKER='https://untrusted-origin.invalid';
const report=randomUUID();
const cases=[
  {label:'anonymous read forbidden',action:'latest',origin:QA_APP},
  {label:'anonymous write forbidden',action:'issue',origin:QA_APP},
  {label:'anonymous history forbidden',action:'history',origin:QA_APP},
  {label:'anonymous document opening forbidden',action:'open',origin:ATTACKER},
];
let completed=0;
for(const scenario of cases){
 const body=scenario.action==='open'
  ?{action:scenario.action,issuanceId:randomUUID()}
  :{action:scenario.action,reportId:report};
 const response=await fetch(ENDPOINT,{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(12_000),
  headers:{Origin:scenario.origin,'Content-Type':'application/json'},
  body:JSON.stringify(body),
 });
 assert.ok([400,401,403].includes(response.status),
  scenario.label+' expected authentication denial; received '+response.status);
 const bodyText=(await response.text()).slice(0,500);
 assert.ok(!/artifactSha256|sourceSnapshot|signedUrl|sourceSha256/.test(bodyText),
  scenario.label+' returned private document metadata');
 completed++;
}
console.log(JSON.stringify({ok:true,environment:'IBERFIT QA only',
 transport:'real hosted Edge HTTPS',anonymousDenials:completed,
 mutationRequestsExecuted:0,productionAccess:false}));
