import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {derivedUuid} from '../scripts/remote-gates/qa_u60_real_dated_journey.mjs';
const text=readFileSync(new URL('../scripts/remote-gates/qa_u73_recover_original_workout.mjs',import.meta.url),'utf8');
test('U73 targets exactly prior run and original deterministic execution',()=>{
 assert.match(text,/SOURCE_RUN='41948759556'/);
 assert.match(text,/derivedUuid\(SOURCE_RUN,'first-execution'\)/);
 assert.match(derivedUuid('41948759556','first-execution'),/^[a-f0-9-]{36}$/);
 assert.match(text,/d\.executionBody\?\.status==='en_curso'/);
 assert.match(text,/Number\(d\.executionBody\?\.revision\)===1/);
});
test('U73 only progresses+completes original owner and cannot create bookings or dates',()=>{
 assert.match(text,/OCURRENCIA_GUARDAR_PROGRESO/);
 assert.match(text,/OCURRENCIA_COMPLETAR/);
 assert.doesNotMatch(text,/CITA_CREAR|OCURRENCIAS_CREAR_LOTE|CITA_CANCELAR|CITA_REPROGRAMAR|DELETE FROM/);
 assert.doesNotMatch(text,/pjhmrhejsoofmouedavw|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(text,/first\.appointmentId&&next\.appointmentId/);
});
test('U73 requires exact first-attempt proof and SHA before appending progress',()=>{
 for(const source of ['GITHUB_RUN_ATTEMPT','currentHead(ctx)','previous.sourceRun===SOURCE_RUN',
   'previous.sourceSha===proof.sourceSha','previous.fingerprint===proof.fingerprint',
   "old","age<7200000",'READ_ONLY']){if(source==='old'||source==='READ_ONLY')continue;assert.ok(text.includes(source),source);}
 assert.match(text,/status='RECOVERY_STARTED'/);
});
