import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sameConnected360CoachScope} from '../src/m26/wearables/v49-coach-activity-contract.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('QA Apple Coach read is separately scoped, explicit and assurance-bound',()=>{
 const app=read('src/m26/app/application.js'),ui=read('src/m26/wearables/controller.js');
 assert.match(app,/connected360AppleCertificationHarness=false/u);
 assert.match(app,/connected360AppleCandidate:connected360AppleCertificationHarness===true/u);
 assert.match(app,/ensurePrivilegedActionAssurance\(\{transport,token,userId:scope.actorId[\s\S]*?connected360AppleCandidateCoachExerciseDays\(token,scope.clientId,\{signal\}\);check\(\)/u);
 assert.match(ui,/abort\?\.abort\(\);abort=null/u);
 assert.match(ui,/readCoachActivity\(scope,stillCurrent,\{signal:abort.signal\}\)/u);
 const scope={actorId:'coach',clientId:'11111111-1111-4111-8111-111111111111',lease:{},area:'sesion',provider:'apple_health'};
 assert.equal(sameConnected360CoachScope(scope,{...scope}),true);
 assert.equal(sameConnected360CoachScope(scope,{...scope,provider:'health_connect'}),false);
});
test('new Apple consent copy translates as complete sentences',()=>{
 for(const phrase of ["Puedes compartir los días y tipos de deporte de Apple Salud de los últimos 7 días con el entrenador que elijas. No incluye frecuencia cardíaca, distancia, rutas ni informes. Retirar el permiso no borra tu historial.","Confirma que quieres compartir los datos de Apple Salud con este entrenador.","Confirma que quieres retirar el permiso de Apple Salud sin borrar tu historial.","Compartir actividad de Apple Salud · QA"])for(const language of ['en','fr','pt'])assert.notEqual(iberfitSurfaceTranslate(phrase,{language}),phrase);
});

test('professional longitudinal path rechecks assurance and scope and never calls owner history',()=>{
 const app=read('src/m26/app/application.js'),ui=read('src/m26/wearables/controller.js');
 const readScope=app.slice(app.indexOf('async function readCoachActivity('),app.indexOf('function professionalFollowupScope()'));
 assert.match(readScope,/scope\.area!=='expediente'\|\|scope\.provider!=='apple_health'/u);
 assert.match(readScope,/ensurePrivilegedActionAssurance[\s\S]*?connected360AppleCandidateCoachTrends\(token,scope.clientId,trendDays,\{signal\}\);check\(\)/u);
 assert.doesNotMatch(readScope,/connected360AppleCandidateOwnerTrends/u);
 assert.match(ui,/trendPanel\?\.clear\(\)/u);
 assert.match(ui,/readProfessional:\(days,live,\{signal\}\)=>readCoachActivity\(scope,live,\{signal,trendDays:days\}\)/u);
});
