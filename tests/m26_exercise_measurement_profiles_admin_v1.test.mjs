import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createExerciseCatalog,mergeExerciseCatalogRecords} from '../src/m26/exercises/catalog.js';
import {exerciseMeasurementProfile} from '../src/m26/exercises/measurement-profiles.js';
import {renderLibraryExerciseCard} from '../src/m26/library/exercise-media-ui.js';
import {createSessionDraft,addCatalogExercise,validateSessionDraft} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet} from '../src/m26/workflows/session-execution.js';
import {createReusableSessionDraft} from '../src/m26/productivity/session-reuse.js';

const base=[
 {id:'IBF-CARRERA-SUAVE',name_es:'Carrera suave',pattern:'locomoción',equipment:'sin equipo',units:['repeticiones','kg','segundos'],revision:2},
 {id:'IBF-PLANCHA-FRONTAL-ANTEBRAZOS',name_es:'Plancha frontal antebrazos',pattern:'anti-extensión',equipment:'sin equipo',units:['repeticiones','kg'],revision:2},
 {id:'IBF-SENTADILLA-BARRA',name_es:'Sentadilla con barra',pattern:'sentadilla',equipment:'barra',units:['repeticiones','kg'],revision:1},
];
test('public profile overrides take precedence without overwriting catalog identity or prior units',()=>{
 const original=createExerciseCatalog(base);
 const merged=mergeExerciseCatalogRecords(original,[],{measurementProfiles:[
   {exercise_id:'IBF-CARRERA-SUAVE',profile:'intervals',revision:3},
   {exercise_id:'IBF-PLANCHA-FRONTAL-ANTEBRAZOS',profile:'strength',revision:8},
 ]});
 assert.equal(original.get('IBF-CARRERA-SUAVE').measurement_profile,null);
 assert.equal(exerciseMeasurementProfile(merged.get('IBF-CARRERA-SUAVE')).kind,'intervals');
 assert.equal(exerciseMeasurementProfile(merged.get('IBF-PLANCHA-FRONTAL-ANTEBRAZOS')).kind,'strength');
 assert.equal(merged.get('IBF-CARRERA-SUAVE').measurementProfileRevision,3);
 assert.equal(merged.get('IBF-CARRERA-SUAVE').revision,2);
 assert.deepEqual(merged.get('IBF-CARRERA-SUAVE').units,['repeticiones','kg','segundos']);
});
test('empty profile row restores automatic classification without erasing audit revision',()=>{
 const merged=mergeExerciseCatalogRecords(base,[],{measurementProfiles:[{exercise_id:'IBF-CARRERA-SUAVE',profile:null,revision:6}]});
 assert.equal(merged.get('IBF-CARRERA-SUAVE').measurement_profile,null);
 assert.equal(merged.get('IBF-CARRERA-SUAVE').measurementProfileRevision,6);
 assert.equal(exerciseMeasurementProfile(merged.get('IBF-CARRERA-SUAVE')).kind,'endurance');
});
test('malformed, unknown or spoofed profile records are ignored',()=>{
 const merged=mergeExerciseCatalogRecords(base,[],{measurementProfiles:[
   {exercise_id:'IBF-CARRERA-SUAVE',profile:'admin',revision:10},
   {exercise_id:'IBF-PLANCHA-FRONTAL-ANTEBRAZOS',profile:'intervals',revision:-2},
   {exercise_id:'DOES-NOT-EXIST',profile:'strength',revision:5},
 ]});
 assert.equal(exerciseMeasurementProfile(merged.get('IBF-CARRERA-SUAVE')).kind,'endurance');
 assert.equal(exerciseMeasurementProfile(merged.get('IBF-PLANCHA-FRONTAL-ANTEBRAZOS')).kind,'isometric');
});
test('Coach and Client see relevant measurement instructions but cannot edit profiles',()=>{
 const catalog=createExerciseCatalog(base);
 const runner=catalog.get('IBF-CARRERA-SUAVE');
 const client=renderLibraryExerciseCard(runner,null,{role:'client'});
 const coach=renderLibraryExerciseCard(runner,null,{role:'coach'});
 assert.match(client,/Distancia · duración · intensidad/);
 assert.match(coach,/Distancia · duración · intensidad/);
 assert.doesNotMatch(client,/data-exercise-measurement-form/);
 assert.doesNotMatch(coach,/data-exercise-measurement-form/);
 assert.doesNotMatch(coach,/data-exercise-rename-form/);
});
test('Admin can select profile with separate optimistic revision and can revert to automatic',()=>{
 const catalog=mergeExerciseCatalogRecords(base,[],{measurementProfiles:[{exercise_id:'IBF-CARRERA-SUAVE',profile:'intervals',revision:7}]});
 const admin=renderLibraryExerciseCard(catalog.get('IBF-CARRERA-SUAVE'),null,{role:'admin'});
 assert.match(admin,/data-exercise-measurement-form/);
 assert.match(admin,/data-expected-revision="7"/);
 assert.match(admin,/name="measurementProfile"/);
 assert.match(admin,/value="intervals" selected/);
 assert.match(admin,/value=""/);
 assert.match(admin,/data-exercise-rename-form/);
 assert.match(admin,/data-expected-revision="2"/);
});
test('explicit metric profile actually changes the planning validation contract',()=>{
 const catalog=mergeExerciseCatalogRecords(base,[],{measurementProfiles:[{exercise_id:'IBF-CARRERA-SUAVE',profile:'strength',revision:1}]});
 const d=createSessionDraft({clientId:'client-1'});
 addCatalogExercise(d,'IBF-CARRERA-SUAVE',catalog);
 assert.equal(d.blocks[0].reps,'8–12');
 assert.equal(validateSessionDraft(d,catalog).ok,true);
});
test('migration protects updates with role verification, revision lock, audit and least privilege',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/20261008164000_exercise_measurement_profiles_admin_v1.sql',import.meta.url),'utf8');
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/iberfit_application_context_v14/);
 assert.match(sql,/membershipStatus/);
 assert.match(sql,/roles/);
 assert.match(sql,/for update/i);
 assert.match(sql,/REVISION_CONFLICT/);
 assert.match(sql,/exercise_measurement_profile_audit/);
 assert.match(sql,/revoke all on table public\.exercise_measurement_profiles/i);
 assert.match(sql,/grant execute on function public\.iberfit_admin_set_exercise_measurement_profile_v1\(text,text,bigint\) to authenticated/i);
 assert.doesNotMatch(sql,/grant (?:all|insert|update|delete) on table public\.exercise_measurement_profiles to (?:anon|authenticated)/i);
});

test('Admin-selected profile is snapshotted across planning, execution and templates even if library changes',()=>{
 const strengthOverride=mergeExerciseCatalogRecords(base,[],{measurementProfiles:[{exercise_id:'IBF-CARRERA-SUAVE',profile:'strength',revision:4}]});
 const draft=createSessionDraft({clientId:'client-1'});
 addCatalogExercise(draft,'IBF-CARRERA-SUAVE',strengthOverride);
 assert.equal(draft.blocks[0].measurementProfile,'strength');
 assert.equal(draft.blocks[0].reps,'8–12');
 const execution=createExecution({session:draft,clientId:'client-1'});
 assert.equal(execution.queue[0].prescription.measurementProfile,'strength');
 startExecution(execution);
 recordSet(execution,draft,{reps:10,rpe:6,load:'20 kg'});
 assert.equal(Object.values(execution.results)[0].reps,10);
 const copied=createReusableSessionDraft(draft,{clientId:'client-2'});
 assert.equal(copied.blocks[0].measurementProfile,'strength');
 const revisedCatalog=mergeExerciseCatalogRecords(base,[],{measurementProfiles:[{exercise_id:'IBF-CARRERA-SUAVE',profile:'endurance',revision:5}]});
 assert.equal(validateSessionDraft(draft,revisedCatalog).ok,true);
 assert.equal(copied.blocks[0].reps,'8–12');
});
test('Isometric override on an ordinarily dynamic movement survives actual duration recording',()=>{
 const catalog=mergeExerciseCatalogRecords(base,[],{measurementProfiles:[{exercise_id:'IBF-CARRERA-SUAVE',profile:'isometric',revision:2}]});
 const draft=createSessionDraft({clientId:'client-1'});
 addCatalogExercise(draft,'IBF-CARRERA-SUAVE',catalog);
 assert.equal(draft.blocks[0].measurementProfile,'isometric');
 assert.equal(draft.blocks[0].reps,'30 s');
 const execution=createExecution({session:draft,clientId:'client-1'});
 startExecution(execution);
 recordSet(execution,draft,{seconds:30,rpe:5});
 assert.equal(Object.values(execution.results)[0].seconds,30);
 assert.equal(Object.values(execution.results)[0].distanceKm,undefined);
});
