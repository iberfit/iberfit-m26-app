import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';

const source=readFileSync(new URL('../src/m26/rc39/route-render.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/m26/design/iberfit-premium-v3.css',import.meta.url),'utf8');
const cssB2=css.slice(css.indexOf('/* SIGNATURE B2 / Atelier Cliente'));
const fixture=(overrides={})=>({
  role:'client',kind:'sesion',serviceActive:true,
  rc39:{sessionProjections:[],role:'client'},appointments:[],upcoming:[],
  ...overrides,
});

test('B2 empty Client Sessions retains two honest recovery actions and no fake ready state',()=>{
  const html=renderRc39Route(fixture());
  assert.match(html,/data-client-session-state="empty"/u);
  assert.match(html,/data-client-session-empty/u);
  assert.match(html,/data-m26-area="planificacion"/u);
  assert.match(html,/data-m26-area="actividad"/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
  assert.doesNotMatch(html,/data-client-sessions-brief=/u);
});

test('B2 available published Client sessions expose explanatory brief without granting start',()=>{
  const item={id:'s1',visible:true,canClientStart:false,canClientExecute:false,
    ownership:'coach_led',visibility:'summary_only',modality:'presencial',
    title:'Supervisada',session:{id:'s1',title:'Supervisada',status:'publicado'},
  };
  const html=renderRc39Route(fixture({rc39:{sessionProjections:[item],role:'client'}}));
  assert.match(html,/data-client-session-state="published"/u);
  assert.match(html,/data-client-sessions-brief="published"/u);
  assert.match(html,/data-client-session-card-state="supervised"/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
  assert.match(html,/Esta sesión la dirige tu Coach/u);
});

test('B2 paused service never presents ready state even if projection is visible',()=>{
  const item={id:'s2',visible:true,canClientStart:true,canClientExecute:true,
    ownership:'client_autonomous',visibility:'full',modality:'guiada_en_app',
    title:'Guiada',session:{id:'s2',title:'Guiada',status:'publicado'},
  };
  const html=renderRc39Route(fixture({serviceActive:false,rc39:{sessionProjections:[item],role:'client'}}));
  assert.match(html,/data-client-session-state="paused"/u);
  assert.match(html,/data-client-sessions-brief="paused"/u);
  assert.doesNotMatch(html,/data-workflow-action="start-published-session"/u);
});

test('B2 hides all unpublished Client projections including the contextual rail',()=>{
  const item={id:'private',visible:false,title:'Privado',session:{id:'private'}};
  const html=renderRc39Route(fixture({rc39:{sessionProjections:[item],role:'client'}}));
  assert.match(html,/data-client-session-state="empty"/u);
  assert.doesNotMatch(html,/Privado/u);
  assert.doesNotMatch(html,/data-client-session-card-state=/u);
});

test('B2 Coach/Admin cannot receive Client status rail through same renderer',()=>{
  const item={id:'s1',visible:true,ownership:'coach_led',visibility:'summary_only',title:'Sesión',session:{id:'s1',title:'Sesión'}};
  for(const role of ['coach','admin']){
    const html=renderRc39Route(fixture({role,rc39:{sessionProjections:[item],role}}));
    assert.doesNotMatch(html,/data-client-sessions-brief=/u);
    assert.doesNotMatch(html,/data-client-session-card-state=/u);
  }
});

test('B2 Client Hoy retains one real primary action and does not add synthetic metrics',()=>{
  const html=renderHoyRoute({
    role:'client',serviceKind:'training',clients:[{id:'c',name:'Atleta'}],
    appointments:[],upcoming:[],operations:{},rc39:{sessionProjections:[]},
  });
  assert.equal((html.match(/class="m26-today-action is-primary"/gu)||[]).length,1);
  assert.doesNotMatch(html,/data-client-sessions-brief/u);
  assert.doesNotMatch(html,/m26-stat-grid/u);
});

test('B2 CSS covers five Client journey surfaces with role-scoped, accessible styling',()=>{
  assert.ok(cssB2.length>2000);
  for(const selector of ['m26-client-home-editorial-v3','m26-rc39-sessions',
    'm26-rc39-session-card','m26-session-live','m26-client-progress-stage']){
    assert.ok(cssB2.includes(selector),selector);
  }
  assert.match(cssB2,/min-height:44px/u);
  assert.match(cssB2,/:focus-visible/u);
  assert.match(cssB2,/max-width:390px/u);
  assert.match(cssB2,/prefers-reduced-motion:reduce/u);
  assert.match(cssB2,/forced-colors:active/u);
  assert.doesNotMatch(cssB2,/!important/u);
  assert.doesNotMatch(cssB2,/position:\\s*fixed|backdrop-filter|animation:\\s*infinite/u);
});

test('B2 presentation flags cannot authorize backend writes or session execution',()=>{
  const added=source.slice(source.indexOf('const clientState=!items.length'));
  assert.match(added,/data-client-session-state/u);
  assert.match(added,/data-client-sessions-brief/u);
  assert.match(source,/data-client-session-card-state/u);
  assert.doesNotMatch(cssB2,/data-workflow-action|data-session-action=/u);
});
