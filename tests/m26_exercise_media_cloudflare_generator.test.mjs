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
  CLOUDFLARE_QA_MODEL,
  buildQaQuestion,
  buildQwenQaBody,
  decideQa,
  parseQaAnswer,
  reviewCloudflareExerciseImage,
} from '../scripts/exercise-media/qa-cloudflare.mjs';
import {handleRequest as handleAiProxyRequest} from '../scripts/exercise-media/worker-ai-proxy.mjs';

const exercise={id:'IBF-SENTADILLA-TEST',name_es:'Sentadilla con peso corporal',pattern:'dominante_rodilla',intent:'fuerza',equipment:'sin equipo',difficulty:'principiante',primary_muscles:['cuadriceps','gluteos'],secondary_muscles:['isquiotibiales','gemelos','core'],instructions_es:['Pies estables.','Flexiona cadera y rodillas con control.','Mantén el tronco estable.'],cues:['Rodillas acompañan la línea de los pies.','Talones apoyados.']};
const hipAbduction={id:'IBF-ABDUCCION-DE-CADERA-LATERAL',name_es:'Abducción lateral de cadera',pattern:'activación glúteo',intent:'fuerza',equipment:'sin equipo',difficulty:'inicial',primary_muscles:['movilidad'],secondary_muscles:[],instructions_es:['Realiza el movimiento sin dolor','Respira de forma continua','Evita forzar el rango'],cues:['Realiza el movimiento sin dolor','Respira de forma continua','Evita forzar el rango']};
const ACCOUNT='1234567890abcdef1234567890abcdef';
const TOKEN='test_token_12345678901234567890';

function positiveQa(overrides={}){return{exercise_match:true,equipment_match:true,movement_pair:true,same_athlete_identity:true,phase_progression:true,biomechanics:'pass',anatomy_integrity:true,critical_body_visible:true,clean_no_text:true,branding_safe:true,visual_quality:'pass',confidence:0.97,issues:[],...overrides};}
function fakeJpeg(){const bytes=Buffer.alloc(96,0x11);bytes[0]=0xff;bytes[1]=0xd8;bytes[2]=0xff;bytes[3]=0xe0;return bytes;}
function fakePng(){const bytes=Buffer.alloc(96,0x22);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes,0);return bytes;}

test('smoke usa un exercise_id canónico real por defecto',()=>{assert.equal(DEFAULT_SMOKE_EXERCISE_ID,'IBF-ABDUCCION-DE-CADERA-LATERAL');});
test('seed es estable por exercise_id y cambia al cambiar identidad',()=>{assert.equal(deterministicSeed(exercise.id),deterministicSeed(exercise.id));assert.notEqual(deterministicSeed(exercise.id),deterministicSeed('IBF-RDL-TEST'));});

test('prompt fija biomecánica, limpieza y par inicio-final sin inventar marca',()=>{const prompt=buildCloudflareImagePrompt(exercise);assert.match(prompt,/Sentadilla con peso corporal/);assert.match(prompt,/dominante_rodilla/);assert.match(prompt,/Equipment: sin equipo/);assert.match(prompt,/start\/end movement pair/i);assert.match(prompt,/exactly TWO full-body depictions/i);assert.match(prompt,/SAME athlete/i);assert.match(prompt,/NO title/);assert.match(prompt,/NO captions/);assert.match(prompt,/shirts completely plain black/i);assert.match(prompt,/Do NOT invent a logo/);});

test('prompt usa referencia del atleta sólo para identidad e isotipo oficial controlado',()=>{const prompt=buildCloudflareImagePrompt(exercise,{hasAthleteReference:true,hasLogoReference:true});assert.match(prompt,/input image 0 ONLY as the canonical IBERFIT male athlete FACE\/IDENTITY reference/i);assert.match(prompt,/Do NOT infer or copy any pose/i);assert.match(prompt,/Input image 1 is the exact official IBERFIT gold isotype/);assert.match(prompt,/EXACTLY ONE tiny official isotype/i);assert.match(prompt,/NO sleeve marks/i);assert.match(prompt,/NO wordmark/i);});

test('piloto de abducción prohíbe flexión frontal y asistencia manual',()=>{const prompt=buildCloudflareImagePrompt(hipAbduction,{hasAthleteReference:true,hasLogoReference:true});assert.match(prompt,/STANDING BODYWEIGHT HIP ABDUCTION/);assert.match(prompt,/STRAIGHT leg moves SIDEWAYS from the HIP/i);assert.match(prompt,/NO front leg raise/);assert.match(prompt,/NO high knee/);assert.match(prompt,/NO grabbing, holding or touching the moving/i);assert.match(prompt,/NEVER contact the moving leg/i);assert.match(prompt,/NO anatomy inset/);});

test('validador de referencias acepta PNG dentro del límite y bloquea dimensiones excesivas',()=>{const png=Buffer.alloc(32,0);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(png,0);png.writeUInt32BE(173,16);png.writeUInt32BE(192,20);assert.deepEqual(referenceDimensions(png,'image/png'),{width:173,height:192});png.writeUInt32BE(513,16);assert.throws(()=>referenceDimensions(png,'image/png'),/REFERENCE_DIMENSIONS_TOO_LARGE/);});

test('generador llama sólo al modelo permitido con 4:5 y mantiene QA fuera de generación',async()=>{const fake=Buffer.alloc(256,0);fake[0]=0xff;fake[1]=0xd8;let seen=null;const fetchImpl=async(url,options)=>{seen={url,options};assert.equal(options.body.get('width'),'768');assert.equal(options.body.get('height'),'960');assert.equal(options.body.get('seed'),String(deterministicSeed(exercise.id)));return new Response(JSON.stringify({success:true,result:{image:fake.toString('base64')}}),{status:200,headers:{'content-type':'application/json'}});};const result=await generateCloudflareExerciseImage({exercise,accountId:ACCOUNT,apiToken:TOKEN,fetchImpl});assert.equal(result.model,CLOUDFLARE_IMAGE_MODEL);assert.equal(result.mime,'image/jpeg');assert.match(seen.url,/flux-2-klein-4b$/);});

test('proxy Pages reconstruye multipart y entrega referencias binarias intactas a FLUX',async()=>{const form=new FormData();form.append('prompt','movement pair test');form.append('width','768');form.append('height','960');form.append('seed','123');form.append('input_image_0',new Blob([fakeJpeg()],{type:'image/jpeg'}),'athlete.jpg');form.append('input_image_1',new Blob([fakePng()],{type:'image/png'}),'isotype.png');let inspected=false;const env={SMOKE_TOKEN:TOKEN,AI:{async run(model,input){assert.equal(model,CLOUDFLARE_IMAGE_MODEL);const rebuilt=await new Response(input.multipart.body,{headers:{'content-type':input.multipart.contentType}}).formData();assert.equal(rebuilt.get('prompt'),'movement pair test');assert.equal(rebuilt.get('input_image_0').type,'image/jpeg');assert.equal(rebuilt.get('input_image_1').type,'image/png');inspected=true;return{image:'A'.repeat(64)};}}};const response=await handleAiProxyRequest(new Request('https://smoke.example/generate',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`},body:form}),env);const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.references,2);assert.equal(inspected,true);});

test('proxy Pages rechaza MIME que no coincide con firma binaria',async()=>{const form=new FormData();form.append('prompt','bad reference test');form.append('input_image_0',new Blob([fakePng()],{type:'image/jpeg'}),'bad.jpg');const response=await handleAiProxyRequest(new Request('https://smoke.example/generate',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`},body:form}),{SMOKE_TOKEN:TOKEN,AI:{run:async()=>{throw new Error('should not run');}}});const payload=await response.json();assert.equal(response.status,502);assert.match(payload.detail,/REFERENCE_MAGIC_INVALID/);});

test('QA sólo aprueba informe completamente positivo y de alta confianza',()=>{const report=parseQaAnswer(JSON.stringify(positiveQa()));const decision=decideQa(report);assert.equal(decision.pass,true);assert.equal(decision.publishable,false);});
test('QA bloquea si falta movement pair o cambia identidad',()=>{const report=parseQaAnswer(JSON.stringify(positiveQa({movement_pair:false,same_athlete_identity:false})));const decision=decideQa(report);assert.equal(decision.pass,false);assert.ok(decision.blocking.includes('movement_pair'));assert.ok(decision.blocking.includes('same_athlete_identity'));});
test('QA bloquea técnica incierta',()=>{const report=parseQaAnswer(JSON.stringify(positiveQa({biomechanics:'uncertain',confidence:0.99})));const decision=decideQa(report);assert.equal(decision.pass,false);assert.ok(decision.blocking.includes('biomechanics'));});
test('QA bloquea branding/texto inventado y baja confianza',()=>{const report=parseQaAnswer(`\`\`\`json\n${JSON.stringify(positiveQa({clean_no_text:false,branding_safe:false,confidence:0.8}))}\n\`\`\``);const decision=decideQa(report);assert.ok(decision.blocking.includes('clean_no_text'));assert.ok(decision.blocking.includes('branding_safe'));assert.ok(decision.blocking.includes('confidence'));});

test('Qwen QA usa messages multimodales, JSON mode e imagen data URI',()=>{const bytes=Buffer.alloc(256,1);const body=buildQwenQaBody({exercise,imageBytes:bytes,mime:'image/jpeg'});assert.equal(body.stream,false);assert.equal(body.temperature,0);assert.equal(body.response_format.type,'json_object');assert.equal(body.reasoning_effort,'medium');assert.equal(body.messages[0].role,'system');assert.equal(body.messages[1].role,'user');const imagePart=body.messages[1].content.find((x)=>x.type==='image_url');const textPart=body.messages[1].content.find((x)=>x.type==='text');assert.match(imagePart.image_url.url,/^data:image\/jpeg;base64,/);assert.match(textPart.text,/strict senior strength-and-conditioning biomechanics reviewer/i);});

test('revisor Cloudflare parsea respuesta chat-completion de Qwen y devuelve decisión',async()=>{const bytes=Buffer.alloc(256,1);let requestBody=null;const fetchImpl=async(_url,options)=>{requestBody=JSON.parse(options.body);return new Response(JSON.stringify({success:true,result:{choices:[{message:{content:JSON.stringify(positiveQa({confidence:0.96}))}}]}}),{status:200,headers:{'content-type':'application/json'}});};const result=await reviewCloudflareExerciseImage({exercise,imageBytes:bytes,mime:'image/jpeg',accountId:ACCOUNT,apiToken:TOKEN,fetchImpl});assert.equal(result.decision.pass,true);assert.equal(requestBody.stream,false);assert.equal(requestBody.response_format.type,'json_object');assert.equal(requestBody.messages[1].content[0].type,'image_url');});

test('proxy QA llama al modelo Qwen configurado',async()=>{let seen=null;const env={SMOKE_TOKEN:TOKEN,AI:{async run(model,body){seen={model,body};return{choices:[{message:{content:'{}'}}]};}}};const response=await handleAiProxyRequest(new Request('https://smoke.example/qa',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`,'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'test'}],stream:false})}),env);const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.model,CLOUDFLARE_QA_MODEL);assert.equal(seen.model,CLOUDFLARE_QA_MODEL);});

test('QA de abducción exige pie móvil suspendido y tolera isotipo oficial no textual',()=>{const question=buildQaQuestion(hipAbduction);assert.match(question,/STANDING BODYWEIGHT HIP ABDUCTION/i);assert.match(question,/exactly ONE support foot on the floor/i);assert.match(question,/moving shoe must be visibly off the floor/i);assert.match(question,/wider two-foot stance, toe tap, forward raise/i);assert.match(question,/tiny non-text gold IBERFIT isotype/i);assert.match(question,/Do not claim cropping when both complete bodies and shoes are plainly visible/i);});

test('pregunta QA mantiene reglas generales de identidad y evidencia visual',()=>{const question=buildQaQuestion(exercise);assert.match(question,/IBF-SENTADILLA-TEST/);assert.match(question,/exactly two depictions of the SAME adult male athlete/i);assert.match(question,/Do not approve because the photograph is attractive/i);assert.match(question,/Do not reject for imagined defects/i);});
