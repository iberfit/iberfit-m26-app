import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COACH_PLANNING_VISIBLE_SESSIONS,COACH_PLANNING_ARCHIVE_GROUP,
  renderCoachPlanningSessionsProgressive} from '../src/m26/modules/route-render.js';
const session=i=>({
  id:'qa-session-'+i,title:'Entrenamiento '+i,status:'publicado',
  publication:{status:'published',statusLabel:'Publicada',actions:[{action:'publish',label:'Publicar'}]},
  clientContent:{title:'Entrenamiento '+i,summary:'Prescripción revisable'},
});
test('Coach planning keeps 231 sessions and all management actions in native disclosures',()=>{
  const items=Array.from({length:231},(_,i)=>session(i+1));
  const html=renderCoachPlanningSessionsProgressive(items);
  assert.equal(COACH_PLANNING_VISIBLE_SESSIONS,6);
  assert.equal(COACH_PLANNING_ARCHIVE_GROUP,18);
  assert.equal((html.match(/data-publication-card(?:>| )/gu)||[]).length,231);
  assert.equal((html.match(/data-workflow-action="manage-publication"/gu)||[]).length,231);
  assert.match(html,/Consultar otras 225 sesiones/u);
  assert.match(html,/Entrenamiento 231/u);
  assert.equal((html.match(/data-coach-planning-batch/g)||[]).length,13);
  assert.ok(html.indexOf('Entrenamiento 6')<html.indexOf('data-coach-planning-archive'));
  assert.ok(html.indexOf('Entrenamiento 7')>html.indexOf('data-coach-planning-archive'));
  assert.equal(items[0].title,'Entrenamiento 1','Original session order retained');
});
test('Short lists remain direct and fully functional',()=>{
  const html=renderCoachPlanningSessionsProgressive([session(1),session(2)]);
  assert.doesNotMatch(html,/data-coach-planning-archive/u);
  assert.equal((html.match(/data-publication-card(?:>| )/gu)||[]).length,2);
});
test('Coach only: Client and Admin planning remain unchanged, IRI unaffected',()=>{
  const source=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(source,/coachPlanning:vm.role==='coach'/u);
  assert.match(source,/if\(coachPlanning&&!clientView&&\['session','planning'\]\.includes\(entity\)\)/u);
  assert.match(source,/renderPeriodizationBoard\(vm.periodization/u);
  assert.match(source,/iriPlanningContextPanel\(seed\)/u);
});
test('Native disclosure retains focus and mobile/reduced-motion accessibility',()=>{
  const css=readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-coach-planning-archive>summary:focus-visible/u);
  // Regression: author-level display:grid overrode the user-agent details
  // closed-visibility rule and created a 117,764px Coach planning page.
  assert.match(css,/\.m26-coach-planning-archive:not\(\[open\]\)>\.m26-coach-planning-archive-groups,[\s\S]*?display:none/u);
  assert.match(css,/\.m26-coach-planning-batch:not\(\[open\]\)>\.m26-stack\{\s*display:none/u);
  assert.match(css,/@media\(max-width:690px\)/u);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/u);
  assert.match(css,/@media\(forced-colors:active\)/u);
});

test('Skip to content is visually hidden until focused, with a keyboard escape path',()=>{
  const css=readFileSync(new URL('../src/m26/shell/shell.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-skip-link:not\(:focus\)\{[^}]*clip-path:inset\(50%\)/u);
  assert.match(css,/\.m26-skip-link\{[^}]*min-block-size:44px;min-inline-size:44px/u);
  assert.match(css,/\.m26-skip-link:not\(:focus\)\{[^}]*pointer-events:none/u);
  assert.doesNotMatch(css,/\.m26-skip-link:not\(:focus\)\{[^}]*inline-size:1px/u);
  assert.match(css,/\.m26-skip-link:focus\{[^}]*clip-path:none/u);
  assert.match(css,/\.m26-skip-link:focus\{[^}]*outline:3px/u);
  const shell=readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
  assert.match(shell,/class="m26-skip-link" href="#m26-main"/u);
});

test('Coach cycles also receive progressive archival disclosure without losing plans or actions',()=>{
  const cycles=Array.from({length:231},(_,i)=>({
    ...session(i+1),id:'cycle-'+(i+1),title:'Ciclo '+(i+1),
  }));
  const html=renderCoachPlanningSessionsProgressive(cycles,'planning');
  assert.match(html,/data-coach-planning-entity="planning"/u);
  assert.match(html,/Consultar otros 225 ciclos/u);
  assert.match(html,/Ciclos 7–24/u);
  assert.match(html,/Ciclo 231/u);
  assert.equal((html.match(/data-publication-card(?:>| )/gu)||[]).length,231);
  assert.equal((html.match(/data-workflow-action="manage-publication"/gu)||[]).length,231);
  assert.equal((html.match(/data-coach-planning-batch/g)||[]).length,13);
  const source=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(source,/publicationList\(vm\.cycles,'planning',[^\n]*coachPlanning:vm\.role==='coach'/u);
  assert.throws(()=>renderCoachPlanningSessionsProgressive(cycles,'unknown'),/COACH_PLANNING_ENTITY_INVALID/u);
});
test('Five-device authenticated QA must check both Coach histories and bound real scroll height',()=>{
 const src=readFileSync(new URL('../qa/coach-webauthn-recurring/coach-webauthn-recurring.spec.mjs',import.meta.url),'utf8');
 assert.match(src,/\.toEqual\(\['planning','session'\]\)/u);
 assert.match(src,/document\.scrollingElement\?\.scrollHeight/u);
 assert.match(src,/toBeLessThan\(24_000\)/u);
 assert.match(src,/coachPlanningPageHeight/u);
});
