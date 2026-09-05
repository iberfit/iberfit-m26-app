import test from 'node:test';
import assert from 'node:assert/strict';
import {buildExerciseVisualBrief,buildExerciseMediaManifest,validateExerciseMediaManifest,IBERFIT_EXERCISE_VISUAL} from '../src/m26/exercises/catalog.js';

const exercise={id:'squat.bodyweight',name_es:'Sentadilla con peso corporal',pattern:'sentadilla',equipment:'sin material',primary_muscles:['cuádriceps','glúteos'],secondary_muscles:['core'],cues:['rodillas siguen la línea de los pies']};

test('visual brief fija la estética IBERFIT aprobada sin rótulos de posición',()=>{
  const brief=buildExerciseVisualBrief(exercise);
  assert.equal(brief.composition.showStartAndEndTogether,true);
  assert.equal(brief.composition.labelsOnImage,false);
  assert.equal(brief.composition.titleOnImage,false);
  assert.equal(brief.athlete.noInventedLogos,true);
  assert.match(brief.athlete.branding,/one_small_real_iberfit_isotype/);
  assert.equal(brief.muscles.primary[0],'cuádriceps');
});

test('manifest exige imagen de movimiento, QA y publicación explícita',()=>{
  const manifest=buildExerciseMediaManifest(exercise,{movement:{path:'squat.bodyweight/movement.webp',width:1400,height:900,mime:'image/webp'}},{biomechanicsStatus:'approved',visualStatus:'approved',published:true,clientVisible:true,coachVisible:true,generatedAt:'2026-09-05T22:00:00.000Z'});
  assert.equal(manifest.bucket,IBERFIT_EXERCISE_VISUAL.bucket);
  assert.equal(manifest.movement.kind,'movement');
  assert.deepEqual(validateExerciseMediaManifest(exercise,manifest),{ok:true,errors:[]});
});

test('manifest fail-closed si QA o publicación no están aprobadas',()=>{
  const manifest=buildExerciseMediaManifest(exercise,{movement:{path:'squat.bodyweight/movement.webp'}},{generatedAt:'2026-09-05T22:00:00.000Z'});
  const result=validateExerciseMediaManifest(exercise,manifest);
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('qa.biomechanics'));
  assert.ok(result.errors.includes('qa.visual'));
  assert.ok(result.errors.includes('published'));
});
