import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUDFLARE_IMAGE_MODEL,
  DEFAULT_SMOKE_EXERCISE_ID,
  buildCloudflareImagePrompt,
  deterministicSeed,
  generateCloudflareExerciseImage,
  referenceDimensions,
} from '../scripts/exercise-media/generate-cloudflare.mjs';
import {
  buildQaQuestion,
  decideQa,
  parseQaAnswer,
  reviewCloudflareExerciseImage,
} from '../scripts/exercise-media/qa-cloudflare.mjs';
import {handleRequest as handleAiProxyRequest} from '../scripts/exercise-media/worker-ai-proxy.mjs';

const exercise={
  id:'IBF-SENTADILLA-TEST',
  name_es:'Sentadilla con peso corporal',
  pattern:'dominante_rodilla',
  intent:'fuerza',
  equipment:'sin equipo',
  difficulty:'principiante',
  primary_muscles:['cuadriceps','gluteos'],
  secondary_muscles:['isquiotibiales','gemelos','core'],
  instructions_es:['Pies estables.','Flexiona cadera y rodillas con control.','Mantén el tronco estable.'],
  cues:['Rodillas acompañan la línea de los pies.','Talones apoyados.'],
};

const ACCOUNT='1234567890abcdef1234567890abcdef';
const TOKEN='test_token_12345678901234567890';

function positiveQa(overrides={}){
  return {
    exercise_match:true,
    equipment_match:true,
    movement_pair:true,
    same_athlete_identity:true,
    phase_progression:true,
    biomechanics:'pass',
    anatomy_integrity:true,
    critical_body_visible:true,
    clean_no_text:true,
    branding_safe:true,
    visual_quality:'pass',
    confidence:0.97,
    issues:[],
    ...overrides,
  };
}

function fakeJpeg(){
  const bytes=Buffer.alloc(96,0x11);
  bytes[0]=0xff;bytes[1]=0xd8;bytes[2]=0xff;bytes[3]=0xe0;
  return bytes;
}

function fakePng(){
  const bytes=Buffer.alloc(96,0x22);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes,0);
  return bytes;
}

test('smoke usa un exercise_id canónico real por defecto',()=>{
  assert.equal(DEFAULT_SMOKE_EXERCISE_ID,'IBF-ABDUCCION-DE-CADERA-LATERAL');
});

test('seed es estable por exercise_id y cambia al cambiar identidad',()=>{
  assert.equal(deterministicSeed(exercise.id),deterministicSeed(exercise.id));
  assert.notEqual(deterministicSeed(exercise.id),deterministicSeed('IBF-RDL-TEST'));
});

test('prompt fija biomecánica, limpieza y par inicio-final sin inventar marca',()=>{
  const prompt=buildCloudflareImagePrompt(exercise);
  assert.match(prompt,/Sentadilla con peso corporal/);
  assert.match(prompt,/dominante_rodilla/);
  assert.match(prompt,/Equipment: sin equipo/);
  assert.match(prompt,/start\/end movement pair/i);
  assert.match(prompt,/exactly TWO full-body depictions/i);
  assert.match(prompt,/SAME athlete/i);
  assert.match(prompt,/NO title/);
  assert.match(prompt,/NO captions/);
  assert.match(prompt,/leave both shirts plain black/);
  assert.match(prompt,/Do NOT invent a logo/);
});

test('prompt usa referencias de atleta e isotipo sin convertirlas en pose o wordmark',()=>{
  const prompt=buildCloudflareImagePrompt(exercise,{hasAthleteReference:true,hasLogoReference:true});
  assert.match(prompt,/input image 0 ONLY as the canonical IBERFIT male athlete/i);
  assert.match(prompt,/do not copy the reference pose/i);
  assert.match(prompt,/Input image 1 is the exact official IBERFIT gold isotype/);
  assert.match(prompt,/never generate the word IBERFIT/i);
  assert.match(prompt,/left chest/i);
});

test('validador de referencias acepta PNG dentro del límite y bloquea dimensiones excesivas',()=>{
  const png=Buffer.alloc(32,0);
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png,0);
  png.writeUInt32BE(173,16);
  png.writeUInt32BE(192,20);
  assert.deepEqual(referenceDimensions(png,'image/png'),{width:173,height:192});
  png.writeUInt32BE(513,16);
  assert.throws(()=>referenceDimensions(png,'image/png'),/REFERENCE_DIMENSIONS_TOO_LARGE/);
});

test('generador llama sólo al modelo permitido con 4:5 y mantiene QA fuera de generación',async()=>{
  const fake=Buffer.alloc(256,0);fake[0]=0xff;fake[1]=0xd8;
  let seen=null;
  const fetchImpl=async(url,options)=>{
    seen={url,options};
    assert.equal(options.body.get('width'),'768');
    assert.equal(options.body.get('height'),'960');
    assert.equal(options.body.get('seed'),String(deterministicSeed(exercise.id)));
    assert.match(String(options.body.get('prompt')),/Both movement phases must be biomechanically correct/);
    return new Response(JSON.stringify({success:true,result:{image:fake.toString('base64')}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await generateCloudflareExerciseImage({exercise,accountId:ACCOUNT,apiToken:TOKEN,fetchImpl});
  assert.equal(result.exerciseId,exercise.id);
  assert.equal(result.model,CLOUDFLARE_IMAGE_MODEL);
  assert.equal(result.mime,'image/jpeg');
  assert.equal(result.width/result.height,0.8);
  assert.match(seen.url,/flux-2-klein-4b$/);
  assert.equal(seen.options.headers.authorization,`Bearer ${TOKEN}`);
});

test('proxy Pages reconstruye multipart y entrega referencias binarias intactas a FLUX',async()=>{
  const form=new FormData();
  form.append('prompt','movement pair test');
  form.append('width','768');
  form.append('height','960');
  form.append('seed','123');
  form.append('input_image_0',new Blob([fakeJpeg()],{type:'image/jpeg'}),'athlete.jpg');
  form.append('input_image_1',new Blob([fakePng()],{type:'image/png'}),'isotype.png');

  let inspected=false;
  const env={
    SMOKE_TOKEN:TOKEN,
    AI:{
      async run(model,input){
        assert.equal(model,CLOUDFLARE_IMAGE_MODEL);
        assert.match(input.multipart.contentType,/^multipart\/form-data; boundary=/i);
        const rebuilt=await new Response(input.multipart.body,{headers:{'content-type':input.multipart.contentType}}).formData();
        assert.equal(rebuilt.get('prompt'),'movement pair test');
        assert.equal(rebuilt.get('width'),'768');
        const athlete=rebuilt.get('input_image_0');
        const isotype=rebuilt.get('input_image_1');
        assert.equal(athlete.type,'image/jpeg');
        assert.equal(isotype.type,'image/png');
        const athleteBytes=Buffer.from(await athlete.arrayBuffer());
        const isotypeBytes=Buffer.from(await isotype.arrayBuffer());
        assert.deepEqual([...athleteBytes.subarray(0,4)],[0xff,0xd8,0xff,0xe0]);
        assert.deepEqual([...isotypeBytes.subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
        inspected=true;
        return {image:'A'.repeat(64)};
      },
    },
  };
  const request=new Request('https://smoke.example/generate',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`},body:form});
  const response=await handleAiProxyRequest(request,env);
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.ok,true);
  assert.equal(payload.references,2);
  assert.equal(inspected,true);
});

test('proxy Pages rechaza una referencia cuyo MIME no coincide con su firma binaria',async()=>{
  const form=new FormData();
  form.append('prompt','bad reference test');
  form.append('input_image_0',new Blob([fakePng()],{type:'image/jpeg'}),'bad.jpg');
  const request=new Request('https://smoke.example/generate',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`},body:form});
  const response=await handleAiProxyRequest(request,{SMOKE_TOKEN:TOKEN,AI:{run:async()=>{throw new Error('should not run');}}});
  const payload=await response.json();
  assert.equal(response.status,502);
  assert.equal(payload.error,'AI_BINDING_FAILED');
  assert.match(payload.detail,/REFERENCE_MAGIC_INVALID/);
});

test('QA sólo aprueba un informe completamente positivo y de alta confianza',()=>{
  const report=parseQaAnswer(JSON.stringify(positiveQa()));
  const decision=decideQa(report);
  assert.equal(decision.pass,true);
  assert.equal(decision.biomechanicsStatus,'approved');
  assert.equal(decision.visualStatus,'approved');
  assert.equal(decision.publishable,false);
});

test('QA bloquea si falta el par de movimiento o cambia la identidad del atleta',()=>{
  const report=parseQaAnswer(JSON.stringify(positiveQa({movement_pair:false,same_athlete_identity:false,issues:['Solo aparece una fase.']})));
  const decision=decideQa(report);
  assert.equal(decision.pass,false);
  assert.ok(decision.blocking.includes('movement_pair'));
  assert.ok(decision.blocking.includes('same_athlete_identity'));
});

test('QA bloquea técnica incierta aunque el resto sea visualmente correcto',()=>{
  const report=parseQaAnswer(JSON.stringify(positiveQa({biomechanics:'uncertain',confidence:0.99,issues:['No se confirma la trayectoria de rodilla.']})));
  const decision=decideQa(report);
  assert.equal(decision.pass,false);
  assert.equal(decision.decision,'blocked');
  assert.ok(decision.blocking.includes('biomechanics'));
  assert.equal(decision.biomechanicsStatus,'pending');
});

test('QA bloquea texto/logo inventado y baja confianza',()=>{
  const report=parseQaAnswer(`\`\`\`json\n${JSON.stringify(positiveQa({clean_no_text:false,branding_safe:false,confidence:0.8,issues:['wordmark']}))}\n\`\`\``);
  const decision=decideQa(report);
  assert.deepEqual(decision.blocking.filter((x)=>['clean_no_text','branding_safe','confidence'].includes(x)),['clean_no_text','branding_safe','confidence']);
});

test('revisor Cloudflare usa imagen inline y devuelve decisión fail-closed',async()=>{
  const bytes=Buffer.alloc(256,1);
  let requestBody=null;
  const fetchImpl=async(_url,options)=>{
    requestBody=JSON.parse(options.body);
    return new Response(JSON.stringify({success:true,result:{answer:JSON.stringify(positiveQa({confidence:0.95}))}}),{status:200,headers:{'content-type':'application/json'}});
  };
  const result=await reviewCloudflareExerciseImage({exercise,imageBytes:bytes,mime:'image/jpeg',accountId:ACCOUNT,apiToken:TOKEN,fetchImpl});
  assert.equal(result.decision.pass,true);
  assert.equal(requestBody.task,'query');
  assert.match(requestBody.image,/^data:image\/jpeg;base64,/);
  assert.match(requestBody.question,/strict senior strength-and-conditioning biomechanics reviewer/);
  assert.equal(requestBody.reasoning,false);
  assert.equal(requestBody.temperature,0);
});

test('pregunta QA contiene identidad canónica y reglas críticas del movimiento pair',()=>{
  const question=buildQaQuestion(exercise);
  assert.match(question,/IBF-SENTADILLA-TEST/);
  assert.match(question,/Sentadilla con peso corporal/);
  assert.match(question,/exactly two depictions of the SAME adult male athlete/i);
  assert.match(question,/start\/end movement pair/i);
  assert.match(question,/Do not approve merely because the image looks attractive/);
});
