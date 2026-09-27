import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  bodySawPlanIssue,
  bodySawVisualGuard,
  isBodySawExercise,
} from '../scripts/exercise-media/auto-factory-body-saw-guard.mjs';

const EXERCISE={
  id:'IBF-BODY-SAW',
  name_es:'Body Saw',
  pattern:'anti-extensión + estabilidad',
  equipment:'deslizadores',
};

const CANONICAL_START='En plancha prona, el cuerpo permanece rígido y alineado. Los antebrazos y codos están apoyados y plantados en el suelo, mientras ambos pies descansan sobre deslizadores.';
const CANONICAL_FINAL='En plancha prona, antebrazos y codos permanecen fijos y plantados en el suelo. El cuerpo rígido y alineado se desplaza hacia atrás como una sola unidad respecto a los codos, los hombros cambian de posición y los pies sobre los deslizadores se deslizan con el cuerpo; las rodillas permanecen extendidas.';

test('Body Saw is classified narrowly without catching other slider exercises',()=>{
  assert.equal(isBodySawExercise(EXERCISE),true);
  assert.equal(isBodySawExercise({id:'IBF-CURL-FEMORAL-DESLIZADORES',name_es:'Curl femoral con deslizadores',pattern:'flexión de rodilla',equipment:'deslizadores'}),false);
  assert.equal(isBodySawExercise({id:'IBF-MOUNTAIN-CLIMBER-SLIDER',name_es:'Mountain climber con sliders',pattern:'core',equipment:'deslizadores'}),false);
});

test('supine heel-slide plan from the failed live run is rejected before image generation',()=>{
  const issue=bodySawPlanIssue({
    start:'Tumbado boca arriba en decúbito supino, con los brazos al lado del cuerpo y ambos talones apoyados sobre deslizadores; las rodillas empiezan extendidas.',
    final:'Desde decúbito supino, flexiona las rodillas llevando los talones sobre los deslizadores hacia los glúteos mientras la pelvis permanece estable.',
  });
  assert.equal(issue,'PLAN_MOVEMENT_IDENTITY_INVALID:start:body-saw-prone-forearm-plank');
});

test('canonical prone forearm-plank Body Saw passes',()=>{
  assert.equal(bodySawPlanIssue({start:CANONICAL_START,final:CANONICAL_FINAL}),null);
});

test('Body Saw rejects knee-tuck mechanics even when support and sliders look plausible',()=>{
  const final='En plancha prona, los antebrazos y codos permanecen fijos y plantados en el suelo. El cuerpo rígido y alineado se desplaza hacia atrás mientras los pies siguen sobre deslizadores y se deslizan, pero luego flexiona las rodillas hacia el pecho para completar la fase.';
  assert.equal(bodySawPlanIssue({start:CANONICAL_START,final}),'PLAN_MOVEMENT_IDENTITY_INVALID:final:body-saw-prone-forearm-plank');
});

test('Body Saw hard lock tells the planner the defining support and phase relation',()=>{
  const guard=bodySawVisualGuard(EXERCISE);
  assert.match(guard,/BODY SAW HARD MOVEMENT LOCK/);
  assert.match(guard,/prone forearm-plank Body Saw/i);
  assert.match(guard,/forearms\/elbows planted on the floor/i);
  assert.match(guard,/feet\/toes on sliders/i);
  assert.match(guard,/translates as one unit forward\/back relative to the elbows/i);
  assert.match(guard,/Do NOT depict lying supine/i);
});

test('planner wires Body Saw into the same single bounded repair loop',async()=>{
  const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');
  assert.match(planner,/auto-factory-body-saw-guard\.mjs/);
  assert.match(planner,/const bodySaw=isBodySawExercise\(exercise\)/);
  assert.match(planner,/bodySaw\?bodySawGuard:''/);
  assert.match(planner,/if\(bodySaw\)\{const issue=bodySawPlanIssue\(plan\);if\(issue\)issues\.push\(issue\);\}/);
  assert.match(planner,/const finalBodySawIssue=bodySaw\?bodySawPlanIssue\(plan\):null/);
  const repairGate=planner.match(/const maxRepair=Math\.max\(cable\?MAX_CABLE_PLAN_REPAIR_ATTEMPTS:0,([^?]+)\?MAX_MOVEMENT_PLAN_REPAIR_ATTEMPTS:0\)/u);
  assert.ok(repairGate,'movement repair gate must remain wired into maxRepair');
  assert.ok(repairGate[1].split('||').includes('bodySaw'),'bodySaw must participate in the bounded movement repair gate');
  assert.match(planner,/MAX_MOVEMENT_PLAN_REPAIR_ATTEMPTS=1/);
  assert.doesNotMatch(planner,/MAX_MOVEMENT_PLAN_REPAIR_ATTEMPTS=[2-9]/);
});
