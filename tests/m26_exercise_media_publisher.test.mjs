import test from 'node:test';
import assert from 'node:assert/strict';
import { publishExerciseMediaPlan } from '../scripts/exercise-media/publish.mjs';

const qa='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const prod='https://pjhmrhejsoofmouedavw.supabase.co';
const testToken='test-admin-session-token-placeholder';

function media(id){return {schema:'iberfit.exercise.visual.v1',style:'iberfit-premium-movement-pair-v1',revision:1,bucket:'iberfit-exercise-media',movement:{kind:'movement',path:`${id}/movement.webp`,mime:'image/webp'},start:{kind:'start',path:`${id}/start.webp`,mime:'image/webp'},end:{kind:'end',path:`${id}/end.webp`,mime:'image/webp'},published:true,clientVisible:true,coachVisible:true,qa:{biomechanics:'approved',visual:'approved'}};}
function plan(id='IBF-SQUAT'){return {schema:'iberfit.exercise.media.autowire.v3',publication:{mechanism:'supabase_rpc',rpc:'iberfit_finalize_exercise_media_v1',resulting_media_status:'aprobado',runtime_manifest_rpc:'iberfit_exercise_media_manifest_v1',app_link:'automatic'},finalizations:[{exercise_id:id,rpc:'iberfit_finalize_exercise_media_v1',args:{p_exercise_id:id,p_manifest:media(id)}}]};}

test('publisher es dry-run por defecto y no hace red',async()=>{let calls=0;const result=await publishExerciseMediaPlan(plan(),{fetchImpl:async()=>{calls+=1;throw new Error('NO_NETWORK');}});assert.deepEqual(result,{ok:true,applied:false,target:'qa',count:1});assert.equal(calls,0);});

test('publisher rechaza origen cruzado QA/PROD',async()=>{await assert.rejects(()=>publishExerciseMediaPlan(plan(),{target:'qa',origin:prod,apply:true,publishableKey:'pk',accessToken:testToken}),/IBERFIT_MEDIA_TARGET_ORIGIN_MISMATCH:qa/);});

test('publisher bloquea producción sin aprobación separada',async()=>{await assert.rejects(()=>publishExerciseMediaPlan(plan(),{target:'prod',origin:prod,apply:true,publishableKey:'pk',accessToken:testToken}),/IBERFIT_MEDIA_PRODUCTION_NOT_APPROVED/);});

test('publisher verifica assets y finaliza por RPC para que la biblioteca los vea',async()=>{const calls=[];const fetchImpl=async(url,options={})=>{calls.push({url,options});if(options.method==='GET')return new Response('',{status:206});return new Response(JSON.stringify({ok:true,exerciseId:'IBF-SQUAT',mediaStatus:'aprobado'}),{status:200,headers:{'content-type':'application/json'}});};const result=await publishExerciseMediaPlan(plan(),{target:'qa',origin:qa,publishableKey:'pk',accessToken:testToken,apply:true,fetchImpl});assert.equal(result.applied,true);assert.equal(result.count,1);assert.equal(calls.filter((call)=>call.options.method==='GET').length,3);const rpc=calls.find((call)=>call.options.method==='POST');assert.equal(rpc.url,`${qa}/rest/v1/rpc/iberfit_finalize_exercise_media_v1`);assert.equal(JSON.parse(rpc.options.body).p_exercise_id,'IBF-SQUAT');});

test('publisher falla antes de finalizar si falta un asset',async()=>{let posts=0;const fetchImpl=async(_url,options={})=>{if(options.method==='POST')posts+=1;return new Response('',{status:404});};await assert.rejects(()=>publishExerciseMediaPlan(plan(),{target:'qa',origin:qa,publishableKey:'pk',accessToken:testToken,apply:true,fetchImpl}),/IBERFIT_MEDIA_ASSET_NOT_FOUND/);assert.equal(posts,0);});

test('publisher rechaza plan que intente saltarse el runtime bridge',async()=>{const bad=plan();bad.publication.app_link='manual';await assert.rejects(()=>publishExerciseMediaPlan(bad),/IBERFIT_MEDIA_PLAN_RUNTIME_LINK_INVALID/);});
