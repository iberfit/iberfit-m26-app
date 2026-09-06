import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUDFLARE_END_PHASE_MODEL,
  PHASE_WIDTH,
  PHASE_HEIGHT,
  SUPPORTED_PHASED_EXERCISE_ID,
  buildPhasePrompt,
  generateCloudflareExercisePhase,
  phaseSeed,
} from '../scripts/exercise-media/generate-cloudflare-phased.mjs';
import {CLOUDFLARE_IMAGE_MODEL} from '../scripts/exercise-media/generate-cloudflare.mjs';
import {handleRequest as handleAiProxyRequest} from '../scripts/exercise-media/worker-ai-proxy.mjs';

const exercise={
  id:SUPPORTED_PHASED_EXERCISE_ID,
  name_es:'Abducción lateral de cadera',
  equipment:'sin equipo',
};
const TOKEN='test_token_12345678901234567890';
const PROXY='https://smoke.example';

function fakeJpeg(){
  const bytes=Buffer.alloc(256,0x33);
  bytes[0]=0xff;bytes[1]=0xd8;bytes[2]=0xff;bytes[3]=0xe0;
  return bytes;
}
function fakePng(){
  const bytes=Buffer.alloc(256,0x44);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes,0);
  return bytes;
}

test('fase inicial exige postura neutra y una sola persona',()=>{
  const prompt=buildPhasePrompt(exercise,'start',{hasAthleteReference:true});
  assert.match(prompt,/EXACTLY ONE adult male athlete/i);
  assert.match(prompt,/Input image 0 is ONLY the canonical IBERFIT male FACE\/IDENTITY reference/i);
  assert.match(prompt,/START PHASE ONLY/i);
  assert.match(prompt,/stand tall on BOTH feet/i);
  assert.match(prompt,/Do not raise either leg/i);
  assert.match(prompt,/shirt must be completely PLAIN BLACK/i);
  assert.match(prompt,/NO logo/i);
});

test('fase final prioriza pose guide como input0 y mueve la pierna a image-left',()=>{
  const prompt=buildPhasePrompt(exercise,'end',{hasAthleteReference:true,hasPoseReference:true});
  assert.match(prompt,/Input image 0 is the PRIMARY GEOMETRIC POSE GUIDE/i);
  assert.match(prompt,/Input image 1 is ONLY the canonical IBERFIT male FACE\/IDENTITY reference/i);
  assert.match(prompt,/pose guide has PRIORITY/i);
  assert.match(prompt,/RIGHT leg stays STRAIGHT and moves unmistakably SIDEWAYS/i);
  assert.match(prompt,/IMAGE LEFT/i);
  assert.match(prompt,/Only the LEFT support shoe touches the floor/i);
  assert.match(prompt,/RIGHT moving shoe is visibly OFF THE FLOOR/i);
  assert.match(prompt,/NO both-feet-on-floor end position/i);
  assert.match(prompt,/NO high knee/i);
});

test('inicio y final comparten la misma seed canónica v4',()=>{
  assert.equal(phaseSeed(exercise.id),phaseSeed(exercise.id));
  assert.ok(Number.isInteger(phaseSeed(exercise.id)));
});

test('fase inicial usa 4B e identidad como input0',async()=>{
  const athleteReference={bytes:fakeJpeg(),mime:'image/jpeg',name:'identity.jpg'};
  let body=null;
  const fetchImpl=async(url,options)=>{
    assert.equal(url,'https://smoke.example/generate');
    body=options.body;
    assert.equal(body.get('model'),CLOUDFLARE_IMAGE_MODEL);
    assert.equal(body.get('width'),String(PHASE_WIDTH));
    assert.equal(body.get('height'),String(PHASE_HEIGHT));
    assert.ok(body.get('input_image_0'));
    assert.equal(body.get('input_image_1'),null);
    return new Response(JSON.stringify({ok:true,model:CLOUDFLARE_IMAGE_MODEL,fallback:false,result:{image:fakeJpeg().toString('base64')}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await generateCloudflareExercisePhase({exercise,phase:'start',athleteReference,proxyUrl:PROXY,proxyToken:TOKEN,fetchImpl});
  assert.equal(result.requestedModel,CLOUDFLARE_IMAGE_MODEL);
  assert.equal(result.model,CLOUDFLARE_IMAGE_MODEL);
  assert.equal(result.fallback,false);
  assert.ok(body instanceof FormData);
});

test('fase final solicita 9B y ordena pose input0, identidad input1',async()=>{
  const athleteReference={bytes:fakeJpeg(),mime:'image/jpeg',name:'identity.jpg'};
  const poseReference={bytes:fakePng(),mime:'image/png',name:'pose.png'};
  let body=null;
  const fetchImpl=async(_url,options)=>{
    body=options.body;
    assert.equal(body.get('model'),CLOUDFLARE_END_PHASE_MODEL);
    const pose=body.get('input_image_0');
    const identity=body.get('input_image_1');
    assert.equal(pose.type,'image/png');
    assert.equal(identity.type,'image/jpeg');
    return new Response(JSON.stringify({ok:true,model:CLOUDFLARE_END_PHASE_MODEL,fallback:false,result:{image:fakeJpeg().toString('base64')}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await generateCloudflareExercisePhase({exercise,phase:'end',athleteReference,poseReference,proxyUrl:PROXY,proxyToken:TOKEN,fetchImpl});
  assert.equal(result.requestedModel,CLOUDFLARE_END_PHASE_MODEL);
  assert.equal(result.model,CLOUDFLARE_END_PHASE_MODEL);
  assert.equal(result.fallback,false);
  assert.ok(body instanceof FormData);
});

test('proxy permite seleccionar sólo 4B/9B y no reenvía model dentro del multipart de FLUX',async()=>{
  const form=new FormData();
  form.append('model',CLOUDFLARE_END_PHASE_MODEL);
  form.append('prompt','pose guided end phase');
  form.append('width','512');
  form.append('height','1280');
  form.append('seed','9');
  form.append('input_image_0',new Blob([fakePng()],{type:'image/png'}),'pose.png');
  form.append('input_image_1',new Blob([fakeJpeg()],{type:'image/jpeg'}),'identity.jpg');
  let seen=false;
  const env={SMOKE_TOKEN:TOKEN,AI:{async run(model,input){
    assert.equal(model,CLOUDFLARE_END_PHASE_MODEL);
    const rebuilt=await new Response(input.multipart.body,{headers:{'content-type':input.multipart.contentType}}).formData();
    assert.equal(rebuilt.get('model'),null);
    assert.equal(rebuilt.get('prompt'),'pose guided end phase');
    assert.equal(rebuilt.get('input_image_0').type,'image/png');
    assert.equal(rebuilt.get('input_image_1').type,'image/jpeg');
    seen=true;
    return {image:fakeJpeg().toString('base64')};
  }}};
  const response=await handleAiProxyRequest(new Request('https://smoke.example/generate',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`},body:form}),env);
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.model,CLOUDFLARE_END_PHASE_MODEL);
  assert.equal(payload.fallback,false);
  assert.equal(seen,true);
});

test('proxy bloquea selector de modelo arbitrario',async()=>{
  const form=new FormData();
  form.append('model','@cf/not-allowed/model');
  form.append('prompt','bad model');
  const response=await handleAiProxyRequest(new Request('https://smoke.example/generate',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`},body:form}),{SMOKE_TOKEN:TOKEN,AI:{run:async()=>{throw new Error('must not run');}}});
  const payload=await response.json();
  assert.equal(response.status,502);
  assert.equal(payload.error,'AI_BINDING_FAILED');
  assert.match(payload.detail,/MODEL_NOT_ALLOWED/);
});

test('generador por fases bloquea ejercicios aún no contratados',()=>{
  assert.throws(()=>buildPhasePrompt({...exercise,id:'IBF-OTRO'},'start'),/EXERCISE_NOT_SUPPORTED/);
});
