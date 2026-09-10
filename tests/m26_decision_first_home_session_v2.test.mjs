import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderHoyRoute} from '../src/m26/modules/route-render-base.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

function coachVm(){
  return {
    role:'coach',
    appointments:[],
    proposals:[],
    upcoming:[],
    clients:[{
      id:'client-a',
      name:'Cliente A',
      modality:'Presencial',
      status:'Activo',
      accessKnown:true,
      access:'Activo',
      profile:{primaryObjective:'Fuerza',weeklyFrequency:2},
      experience:{stage:'active',stageLabel:'Seguimiento activo',priority:5},
      nextAction:{label:'Revisar seguimiento',area:'expediente',reason:'Seguimiento preparado'},
      nextAppointment:null,
      iri:null,
    }],
    coachCockpit:{
      totalClients:1,
      attentionCount:1,
      criticalCount:0,
      warningCount:1,
      processCount:0,
      infoCount:0,
      riskFocus:{
        clientId:'client-a',
        clientName:'Cliente A',
        signalLabel:'Revisar',
        reason:'Feedback reciente',
        detail:'Hay contexto nuevo',
      },
      items:[{
        clientId:'client-a',
        clientName:'Cliente A',
        stageLabel:'Seguimiento activo',
        kind:'warning',
        signalLabel:'Revisar',
        reason:'Feedback reciente',
        detail:'Hay contexto nuevo',
        guidance:'Abrir el expediente antes de decidir.',
        attentionWhy:'Existe feedback reciente que requiere criterio del Coach.',
        actionType:'feedback-review',
        actionTypeLabel:'Revisar feedback',
      }],
    },
    operations:{pending:0,conflicts:0,rejected:0},
  };
}

test('Coach Today renders one real Action Center with explainable priority metadata',()=>{
  const html=renderHoyRoute(coachVm());
  assert.equal((html.match(/data-m26-coach-action-center/g)||[]).length,1);
  assert.ok(html.includes('id="m26-coach-action-center-title"'));
  assert.ok(html.includes('data-action-type="feedback-review"'));
  assert.ok(html.includes('Existe feedback reciente que requiere criterio del Coach.'));
  assert.ok(html.includes('Revisar feedback'));
  assert.ok(html.includes('data-m26-select-client="client-a"'));
});

test('Today hierarchy is decision-first while retaining every existing major surface',()=>{
  const html=renderHoyRoute(coachVm());
  const hero=html.indexOf('data-today-hero');
  const decision=html.indexOf('data-today-decision-grid');
  const actionCenter=html.indexOf('data-m26-coach-action-center');
  const dailyLoop=html.indexOf('m26-today-loop');
  const stats=html.indexOf('m26-today-stats');
  assert.ok(hero>=0&&decision>hero&&actionCenter>decision&&dailyLoop>actionCenter&&stats>dailyLoop);
  assert.ok(html.includes('m26-today-agenda'));
  assert.ok(html.includes('data-today-next-action'));
  assert.ok(html.includes('data-m26-area="agenda"'));
  assert.ok(html.includes('data-m26-area="clientes"'));
  assert.ok(html.includes('data-m26-area="verificacion"'));
});

test('guided tour targets the concrete Coach Action Center before its safe Today fallback',()=>{
  const guided=read('src/m26/onboarding/guided-tour.js');
  assert.match(guided,/id:'coach-action-center'[\s\S]*selectors:Object\.freeze\(\['\[data-m26-coach-action-center\]','\[data-m26-area="hoy"\]'\]\)/u);
});

test('live set entry retains all fields and actions while adding device keyboard hints',()=>{
  const session=read('src/m26/workflows/session-ui.js');
  assert.ok(session.includes('data-session-set-entry="current"'));
  assert.ok(session.includes('m26-session-set-fields'));
  for(const field of ['reps','seconds','load','rpe','rir']){
    assert.ok(session.includes('data-set-field="'+field+'"'),'missing set field '+field);
  }
  for(const action of ['complete-set','reuse-previous-set','skip-set','previous','substitute','skip-exercise','pause','cancel']){
    assert.ok(session.includes('data-session-action="'+action+'"'),'missing session action '+action);
  }
  assert.match(session,/data-set-field="reps"[\s\S]{0,180}inputmode="numeric"|inputmode="numeric"[\s\S]{0,180}data-set-field="reps"/u);
  assert.match(session,/data-set-field="rpe"[\s\S]{0,180}enterkeyhint="done"|enterkeyhint="done"[\s\S]{0,180}data-set-field="rpe"/u);
});

test('V2.1 visual hierarchy adapts without hiding controls or introducing interaction locks',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  for(const selector of [
    '.m26-today-hero',
    '.m26-today-decision-grid',
    '.m26-today-next-action',
    '.m26-coach-action-center',
    '.m26-coach-priority-why',
    '.m26-session-set-fields',
    '[data-session-set-entry="current"]'
  ]) assert.ok(css.includes(selector),'missing refinement '+selector);
  assert.ok(css.includes('@media (max-width:980px)'));
  assert.ok(css.includes('@media (max-width:580px)'));
  assert.ok(css.includes('@media (max-width:390px)'));
  const added=css.slice(css.indexOf('/* Signature UX V2.1'));
  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden/iu);
  assert.doesNotMatch(
    added,
    /(?:button|a|input|select|textarea|summary|\[role="button"\])[^{}]*\{[^}]*pointer-events\s*:\s*none/iu,
    'interactive controls must remain operable'
  );
  assert.match(added,/\.m26-today-hero::after\{[\s\S]*pointer-events:none/u);
});
