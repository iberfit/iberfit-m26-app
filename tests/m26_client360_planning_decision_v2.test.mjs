import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderRc39Route} from '../src/m26/rc39/route-render.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Cliente 360 derives its primary next action from the canonical client journey',()=>{
  const source=read('src/m26/ui/client-360.js');
  assert.ok(source.includes("import {clientHealthSummary} from '../modules/domain-selectors.js';"));
  assert.ok(source.includes("import {deriveClientExperience,experienceNextAction} from '../experience/client-experience.js';"));
  assert.ok(source.includes('const journeySummary=clientHealthSummary(state,clientId,now);'));
  assert.ok(source.includes('const journey=deriveClientExperience(journeySummary||{});'));
  assert.ok(source.includes("const nextAction=experienceNextAction(journey,{role:String(viewModel.identity.role||'client')});"));
  assert.ok(source.includes("nowPanel.setAttribute('data-m30-cliente-360-now','true')"));
  assert.ok(source.indexOf('section.append(header,nowPanel,proof,grid,context,evolution,actions,note)')>=0);
});

test('Cliente 360 keeps all previous destinations while adding the decision block',()=>{
  const source=read('src/m26/ui/client-360.js');
  for(const pair of [
    ["Ver planificación","planificacion"],
    ["Abrir sesiones","sesion"],
    ["Registrar bienestar","actividad"],
    ["Revisar IRI","iri"],
    ["Consultar informes","informes"],
  ]){
    assert.ok(source.includes("action(document,'"+pair[0]+"','"+pair[1]+"')"),'missing Cliente 360 action '+pair[0]);
  }
  assert.ok(source.includes("nowAction.classList.add('m26-primary-action')"));
});

test('client planning overview preserves delivery ownership and reports supervised vs Live Workout sessions',()=>{
  const vm={
    kind:'planificacion',
    role:'client',
    selectedClient:{modality:'hibrido'},
    rc39:{
      planningItems:[
        {
          id:'session-coach',
          appointmentId:'appointment-coach',
          title:'Fuerza con Coach',
          startAt:'2026-09-11T10:00:00-03:00',
          ownership:'coach_led',
          modality:'presencial',
          visibility:'full',
          visible:true,
          canClientExecute:false,
          session:{blocks:[{name:'Sentadilla',sets:3,reps:'8'}]},
          calendarVisible:false,
        },
        {
          id:'session-app',
          appointmentId:'appointment-app',
          title:'Trabajo autónomo',
          startAt:'2026-09-12T10:00:00-03:00',
          ownership:'guided_in_app',
          modality:'guiada_en_app',
          visibility:'full',
          visible:true,
          canClientExecute:true,
          session:{blocks:[{name:'Remo',sets:3,reps:'10'}]},
          calendarVisible:false,
        },
      ],
    },
  };
  const html=renderRc39Route(vm);
  assert.ok(html.includes('data-m30-planning-overview'));
  assert.ok(html.includes('2 sesiones publicadas'));
  assert.ok(html.includes('<span>Con Coach</span><strong>1</strong>'));
  assert.ok(html.includes('<span>En app</span><strong>1</strong>'));
  assert.ok(html.includes('data-session-experience-card="hybrid_coach_led"'));
  assert.ok(html.includes('data-session-experience-card="hybrid_autonomous"'));
  assert.ok(html.includes('Comenzar Live Workout'));
  assert.ok(html.includes('Sesión con tu Coach'));
});

test('V2.2 adapts Cliente 360 and planning without hiding or disabling any control',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const start=css.indexOf('/* Signature UX V2.2');
  assert.ok(start>=0);
  const added=css.slice(start);
  for(const selector of [
    '.m26-shell .m27-cliente-360',
    '.m30-planning-overview',
    '.m30-planning-overview-metrics',
    '.m26-rc39-planning .m26-rc39-week'
  ]) assert.ok(added.includes(selector),'missing V2.2 selector '+selector);
  assert.ok(added.includes('@media (max-width:900px)'));
  assert.ok(added.includes('@media (max-width:580px)'));
  assert.ok(added.includes('@media (max-width:390px)'));
  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
});
