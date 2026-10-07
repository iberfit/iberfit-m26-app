import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const render=fs.readFileSync('src/m26/modules/route-render.js','utf8');
const vm=fs.readFileSync('src/m26/modules/route-view-model.js','utf8');
const engagement=fs.readFileSync('src/m26/engagement/engagement-controller.js','utf8');
const css=fs.readFileSync('src/m26/design/premium-ux.css','utf8');

test('Progreso profesional integra decisión explicable sin mutar entrenamiento',()=>{
  assert.match(vm,/const professional=\['admin','coach'\]\.includes\(role\)/u);
  assert.match(vm,/buildNextSessionPreparation/u);
  assert.match(vm,/buildIberfitDecisionBrief\(\{summary,alerts\}\)/u);
  const start=render.indexOf('function progressDecisionTrackingSuggestion');
  const end=render.indexOf('export function renderProgressRoute',start);
  assert.ok(start>=0&&end>start);
  const bridge=render.slice(start,end);
  assert.match(bridge,/data-progress-coach-decision/u);
  assert.match(bridge,/data-m26-area="sesion"/u);
  assert.match(bridge,/data-m26-area="planificacion"/u);
  assert.match(bridge,/data-m26-area="expediente"/u);
  assert.doesNotMatch(bridge,/data-workflow-action|dispatchSessionAction|commandBus|publishSession|updateSession/u);
});

test('Action Outcome se reutiliza en Progreso con prefill seguro y selectivo',()=>{
  assert.match(render,/data-action-outcome-host/u);
  assert.match(render,/data-action-outcome-mode="workspace"/u);
  assert.match(render,/\['pain','wellbeing','wellbeing-shift'\]/u);
  assert.match(render,/escapeHtml\(tracking\.signal\)/u);
  assert.match(engagement,/allowedSuggestedSources=new Set\(\['checkin','adherence','session','progress','coach_observation','other'\]\)/u);
  assert.match(engagement,/if\(suggestedSignal\)signal\.input\.value=suggestedSignal/u);
  const prefill=engagement.slice(engagement.indexOf('const suggestedSignal'),engagement.indexOf("const decision=createTextarea",engagement.indexOf('const suggestedSignal')));
  assert.doesNotMatch(prefill,/innerHTML|open=true|submit/u);
});

test('superficie de decisión mantiene targets táctiles y traducciones',()=>{
  assert.match(css,/\.m26-progress-decision-actions button\{min-height:44px\}/u);
  assert.equal(iberfitSurfaceTranslate('Decisión del Coach',{language:'en'}),'Coach decision');
  assert.equal(iberfitSurfaceTranslate('Preparar próxima sesión',{language:'fr'}),'Préparer la prochaine séance');
  assert.equal(iberfitSurfaceTranslate('Revisar planificación',{language:'pt'}),'Rever planeamento');
});
