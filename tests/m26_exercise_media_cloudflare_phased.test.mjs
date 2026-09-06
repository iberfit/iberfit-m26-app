import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_WIDTH,
  PHASE_HEIGHT,
  SUPPORTED_PHASED_EXERCISE_ID,
  buildPhasePrompt,
  generateCloudflareExercisePhase,
  phaseSeed,
} from '../scripts/exercise-media/generate-cloudflare-phased.mjs';

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
  assert.match(prompt,/FACE\/IDENTITY reference/i);
  assert.match(prompt,/START PHASE ONLY/i);
  assert.match(prompt,/stand tall on BOTH feet/i);
  assert.match(prompt,/Do not raise either leg/i);
  assert.match(prompt,/shirt must be completely PLAIN BLACK/i);
  assert.match(prompt,/NO logo/i);
  assert.match(prompt,/No title, captions, arrows, labels, panels, anatomy inset/i);
});

test('fase final usa pose guide y exige abducción hacia image-left',()=>{
  const prompt=buildPhasePrompt(exercise,'end',{hasAthleteReference:true,hasPoseReference:true});
  assert.match(prompt,/GEOMETRIC POSE GUIDE ONLY/i);
  assert.match(prompt,/pose guide has priority/i);
  assert.match(prompt,/RIGHT leg stays STRAIGHT and moves unmistakably SIDEWAYS/i);
  assert.match(prompt,/appears on the IMAGE LEFT/i);
  assert.match(prompt,/HORIZONTALLY OUT TO THE IMAGE LEFT/i);
  assert.match(prompt,/both knees remain low and nearly level vertically/i);
  assert.match(prompt,/NO forward leg raise/i);
  assert.match(prompt,/NO high knee/i);
  assert.match(prompt,/NO hip-flexion pose/i);
  assert.match(prompt,/NO hand contact with the moving leg/i);
  assert.match(prompt,/torso stays vertical/i);
  assert.match(prompt,/pelvis stays level/i);
});

test('inicio y final comparten la misma seed canónica v3',()=>{
  assert.equal(phaseSeed(exercise.id),phaseSeed(exercise.id));
  assert.ok(Number.isInteger(phaseSeed(exercise.id)));
});

test('fase inicial usa sólo identidad y bloquea pose guide',async()=>{
  const athleteReference={bytes:fakeJpeg(),mime:'image/jpeg',name:'identity.jpg'};
  let body=null;
  const fetchImpl=async(url,options)=>{
    assert.equal(url,'https://smoke.example/generate');
    body=options.body;
    assert.equal(body.get('width'),String(PHASE_WIDTH));
    assert.equal(body.get('height'),String(PHASE_HEIGHT));
    assert.equal(body.get('seed'),String(phaseSeed(exercise.id)));
    assert.ok(body.get('input_image_0'));
    assert.equal(body.get('input_image_1'),null);
    assert.match(String(body.get('prompt')),/START PHASE ONLY/i);
    return new Response(JSON.stringify({ok:true,result:{image:fakeJpeg().toString('base64')}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await generateCloudflareExercisePhase({exercise,phase:'start',athleteReference,proxyUrl:PROXY,proxyToken:TOKEN,fetchImpl});
  assert.equal(result.phase,'start');
  assert.equal(result.mime,'image/jpeg');
  assert.ok(body instanceof FormData);
  await assert.rejects(()=>generateCloudflareExercisePhase({exercise,phase:'start',athleteReference,poseReference:{bytes:fakePng(),mime:'image/png',name:'pose.png'},proxyUrl:PROXY,proxyToken:TOKEN,fetchImpl}),/START_POSE_REFERENCE_NOT_ALLOWED/);
});

test('fase final envía identidad como input0 y mapa de pose como input1',async()=>{
  const athleteReference={bytes:fakeJpeg(),mime:'image/jpeg',name:'identity.jpg'};
  const poseReference={bytes:fakePng(),mime:'image/png',name:'pose.png'};
  let body=null;
  const fetchImpl=async(_url,options)=>{
    body=options.body;
    assert.ok(body.get('input_image_0'));
    assert.ok(body.get('input_image_1'));
    assert.match(String(body.get('prompt')),/GEOMETRIC POSE GUIDE ONLY/i);
    assert.match(String(body.get('prompt')),/IMAGE LEFT/i);
    return new Response(JSON.stringify({ok:true,result:{image:fakeJpeg().toString('base64')}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await generateCloudflareExercisePhase({exercise,phase:'end',athleteReference,poseReference,proxyUrl:PROXY,proxyToken:TOKEN,fetchImpl});
  assert.equal(result.phase,'end');
  assert.equal(result.width,PHASE_WIDTH);
  assert.equal(result.height,PHASE_HEIGHT);
  assert.ok(body instanceof FormData);
});

test('generador por fases bloquea ejercicios aún no contratados',()=>{
  assert.throws(()=>buildPhasePrompt({...exercise,id:'IBF-OTRO'},'start'),/EXERCISE_NOT_SUPPORTED/);
});
