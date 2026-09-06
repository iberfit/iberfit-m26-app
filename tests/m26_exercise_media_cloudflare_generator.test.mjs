import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUDFLARE_IMAGE_MODEL,
  buildCloudflareImagePrompt,
  deterministicSeed,
  generateCloudflareExerciseImage,
} from '../scripts/exercise-media/generate-cloudflare.mjs';
import {
  buildQaQuestion,
  decideQa,
  parseQaAnswer,
  reviewCloudflareExerciseImage,
} from '../scripts/exercise-media/qa-cloudflare.mjs';

const exercise={
  id:'bw-squat',
  name_es:'Sentadilla con peso corporal',
  pattern:'dominante_rodilla',
  intent:'fuerza',
  equipment:'ninguno',
  difficulty:'principiante',
  primary_muscles:['cuadriceps','gluteos'],
  secondary_muscles:['isquiotibiales','gemelos','core'],
  instructions_es:['Pies estables.','Flexiona cadera y rodillas con control.','Mantén el tronco estable.'],
  cues:['Rodillas acompañan la línea de los pies.','Talones apoyados.'],
};

const ACCOUNT='1234567890abcdef1234567890abcdef';
const TOKEN='test_token_12345678901234567890';

test('seed es estable por exercise_id y cambia al cambiar identidad',()=>{
  assert.equal(deterministicSeed('bw-squat'),deterministicSeed('bw-squat'));
  assert.notEqual(deterministicSeed('bw-squat'),deterministicSeed('rdl'));
});

test('prompt fija biomecánica, limpieza y no inventa marca sin referencia',()=>{
  const prompt=buildCloudflareImagePrompt(exercise);
  assert.match(prompt,/Sentadilla con peso corporal/);
  assert.match(prompt,/dominante_rodilla/);
  assert.match(prompt,/Equipment: ninguno/);
  assert.match(prompt,/NO title/);
  assert.match(prompt,/NO captions/);
  assert.match(prompt,/leave the shirt plain black/);
  assert.match(prompt,/Do NOT invent a logo/);
  assert.match(prompt,/full body/);
});

test('prompt usa referencias de atleta e isotipo sin convertirlas en pose o wordmark',()=>{
  const prompt=buildCloudflareImagePrompt(exercise,{hasAthleteReference:true,hasLogoReference:true});
  assert.match(prompt,/input image 0 ONLY as the canonical IBERFIT male athlete/);
  assert.match(prompt,/do not copy the reference pose/i);
  assert.match(prompt,/Input image 1 is the exact official IBERFIT gold isotype/);
  assert.match(prompt,/Never generate the word IBERFIT/);
});

test('generador llama sólo al modelo permitido con 4:5 y mantiene QA fuera de generación',async()=>{
  const fake=Buffer.alloc(256,0);fake[0]=0xff;fake[1]=0xd8;
  let seen=null;
  const fetchImpl=async(url,options)=>{
    seen={url,options};
    assert.equal(options.body.get('width'),'768');
    assert.equal(options.body.get('height'),'960');
    assert.equal(options.body.get('seed'),String(deterministicSeed('bw-squat')));
    assert.match(String(options.body.get('prompt')),/Biomechanics are strict/);
    return new Response(JSON.stringify({success:true,result:{image:fake.toString('base64')}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await generateCloudflareExerciseImage({exercise,accountId:ACCOUNT,apiToken:TOKEN,fetchImpl});
  assert.equal(result.exerciseId,'bw-squat');
  assert.equal(result.model,CLOUDFLARE_IMAGE_MODEL);
  assert.equal(result.mime,'image/jpeg');
  assert.equal(result.width/result.height,0.8);
  assert.match(seen.url,/flux-2-klein-4b$/);
  assert.equal(seen.options.headers.authorization,`Bearer ${TOKEN}`);
});

test('QA sólo aprueba un informe completamente positivo y de alta confianza',()=>{
  const report=parseQaAnswer(JSON.stringify({
    exercise_match:true,equipment_match:true,biomechanics:'pass',anatomy_integrity:true,
    critical_body_visible:true,clean_no_text:true,branding_safe:true,visual_quality:'pass',confidence:0.97,issues:[],
  }));
  const decision=decideQa(report);
  assert.equal(decision.pass,true);
  assert.equal(decision.biomechanicsStatus,'approved');
  assert.equal(decision.visualStatus,'approved');
  assert.equal(decision.publishable,false);
});

test('QA bloquea técnica incierta aunque el resto sea visualmente correcto',()=>{
  const report=parseQaAnswer(JSON.stringify({
    exercise_match:true,equipment_match:true,biomechanics:'uncertain',anatomy_integrity:true,
    critical_body_visible:true,clean_no_text:true,branding_safe:true,visual_quality:'pass',confidence:0.99,issues:['No se confirma la trayectoria de rodilla.'],
  }));
  const decision=decideQa(report);
  assert.equal(decision.pass,false);
  assert.equal(decision.decision,'blocked');
  assert.ok(decision.blocking.includes('biomechanics'));
  assert.equal(decision.biomechanicsStatus,'pending');
});

test('QA bloquea texto/logo inventado y baja confianza',()=>{
  const report=parseQaAnswer('```json\n{"exercise_match":true,"equipment_match":true,"biomechanics":"pass","anatomy_integrity":true,"critical_body_visible":true,"clean_no_text":false,"branding_safe":false,"visual_quality":"pass","confidence":0.8,"issues":["wordmark"]}\n```');
  const decision=decideQa(report);
  assert.deepEqual(decision.blocking.filter((x)=>['clean_no_text','branding_safe','confidence'].includes(x)),['clean_no_text','branding_safe','confidence']);
});

test('revisor Cloudflare usa imagen inline y devuelve decisión fail-closed',async()=>{
  const bytes=Buffer.alloc(256,1);
  let requestBody=null;
  const fetchImpl=async(_url,options)=>{
    requestBody=JSON.parse(options.body);
    return new Response(JSON.stringify({success:true,result:{answer:JSON.stringify({
      exercise_match:true,equipment_match:true,biomechanics:'pass',anatomy_integrity:true,
      critical_body_visible:true,clean_no_text:true,branding_safe:true,visual_quality:'pass',confidence:0.95,issues:[],
    })}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await reviewCloudflareExerciseImage({exercise,imageBytes:bytes,mime:'image/jpeg',accountId:ACCOUNT,apiToken:TOKEN,fetchImpl});
  assert.equal(result.decision.pass,true);
  assert.equal(requestBody.task,'query');
  assert.match(requestBody.image,/^data:image\/jpeg;base64,/);
  assert.match(requestBody.question,/strict senior strength-and-conditioning biomechanics reviewer/);
  assert.equal(requestBody.reasoning,false);
});

test('pregunta QA contiene identidad canónica y reglas críticas',()=>{
  const question=buildQaQuestion(exercise);
  assert.match(question,/bw-squat/);
  assert.match(question,/Sentadilla con peso corporal/);
  assert.match(question,/no title\/captions\/arrows\/panels\/footer/i);
  assert.match(question,/Do not approve merely because it looks attractive/);
});
