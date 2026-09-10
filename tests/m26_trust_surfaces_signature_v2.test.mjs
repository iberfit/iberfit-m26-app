import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  renderReportsRoute,
  renderIntelligenceRoute,
  renderChallengesRoute,
  renderSettingsRoute,
  renderPrivateNotesRoute,
  renderVerificationRoute,
} from '../src/m26/modules/route-render-base.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('Reports V2.6 keeps primary diagnosis, report actions and publication lifecycle',()=>{
  const html=renderReportsRoute({
    role:'client',
    latestIri:{id:'iri-1',revision:3},
    iriDiagnosis:{
      assessmentId:'iri-1',
      dateLabel:'10 septiembre 2026',
      classification:'Perfil IRI por dominios',
      processLabel:'Evaluación confirmada',
      revision:3,
    },
    reports:[],
    canManage:false,
  });

  assert.ok(html.includes('m30-reports-route'));
  assert.ok(html.includes('data-reports-role="client"'));
  assert.ok(html.includes('m30-report-primary'));
  assert.ok(html.includes('data-m26-area="iri"'));
  assert.ok(html.includes('data-workflow-action="generate-client-iri-report"'));
  assert.ok(html.includes('data-iri-external-report-host'));

  const source=read('src/m26/modules/route-render-base.js');
  for(const action of ['approve','publish','withdraw','archive']){
    assert.ok(source.includes("action:'"+action+"'")||source.includes("status:'"+action+"'")||source.includes("data-publication-action"),'publication lifecycle contract missing '+action);
  }
  assert.ok(source.includes('data-workflow-action="approve-report"'));
});

test('Intelligence V2.6 stays a revisable proposal surface and never claims automatic publication',()=>{
  const html=renderIntelligenceRoute({
    canGenerate:true,
    ageYears:42,
    alerts:[],
    runs:[],
  });

  assert.ok(html.includes('m30-intelligence-route'));
  assert.ok(html.includes('data-intelligence-surface="coach-copilot"'));
  assert.ok(html.includes('m30-intelligence-form'));
  assert.ok(html.includes('data-workflow-action="generate-intelligence"'));
  assert.ok(html.includes('data-intelligence-preview'));
  assert.ok(html.includes('Nunca publica ni progresa cargas automáticamente.'));
  assert.ok(html.includes('Generar propuesta revisable'));

  const source=read('src/m26/modules/route-render-base.js');
  assert.ok(source.includes('m30-intelligence-brief'));
  assert.ok(source.includes('m30-intelligence-evidence'));
  assert.ok(source.includes('m30-intelligence-next'));
});

test('Settings V2.6 preserves privacy, language, locale, notifications, wearables and logout',()=>{
  const html=renderSettingsRoute({
    languageOptions:[{value:'es',label:'Español'}],
    localeOptions:[{value:'es-CL',label:'Chile'}],
    plannedLanguages:[],
    language:'es',
    locale:'es-CL',
    preferences:{social:{sharingEnabled:false,audience:'private'},notifications:{}},
    hasClientContext:true,
    wearableConnections:1,
    identity:{name:'Persona',roleLabel:'Cliente'},
    role:'client',
  });

  assert.ok(html.includes('m30-settings-route'));
  assert.ok(html.includes('data-settings-surface="preferences"'));
  for(const card of ['language','locale','social','notifications','wearables','privacy','account']){
    assert.ok(html.includes('data-settings-card="'+card+'"'),'missing settings card '+card);
  }
  assert.ok(html.includes('data-m26-ui-language'));
  assert.ok(html.includes('data-m26-ui-locale'));
  assert.ok(html.includes('data-m26-preference="social.sharingEnabled"'));
  for(const notification of ['sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones']){
    assert.ok(html.includes('notifications.'+notification),'missing notification preference '+notification);
  }
  assert.ok(html.includes('Gestionar wearables'));
  assert.ok(html.includes('publicación automática desactivada'));
  assert.ok(html.includes('ranking público desactivado'));
  assert.ok(html.includes('data-m26-action="logout"'));
});

test('Challenges V2.6 stays private-first and keeps progress/activity navigation',()=>{
  const html=renderChallengesRoute({
    clientId:'client-1',
    challenges:[],
    social:{visibility:'private',sharingEnabled:false,audience:'private'},
  });

  assert.ok(html.includes('m30-challenges-route'));
  assert.ok(html.includes('data-challenges-surface="private-progress"'));
  assert.ok(html.includes('m30-challenge-grid'));
  assert.ok(html.includes('Privado por defecto'));
  assert.ok(html.includes('No existe publicación automática ni ranking público.'));
  assert.ok(html.includes('data-m26-area="progreso"'));
  assert.ok(html.includes('data-m26-area="actividad"'));
  assert.ok(html.includes('data-m26-area="ajustes"'));
});

test('Private Notes V2.6 keeps capability gating and private save action',()=>{
  const html=renderPrivateNotesRoute({
    notes:[],
    capability:{ready:true},
  });

  assert.ok(html.includes('m30-notes-route'));
  assert.ok(html.includes('data-notes-surface="private-coach"'));
  assert.ok(html.includes('m30-notes-editor'));
  assert.ok(html.includes('data-private-note-title'));
  assert.ok(html.includes('data-private-note-draft'));
  assert.ok(html.includes('data-engagement-action="save-private-note"'));
  assert.ok(html.includes('Nunca son visibles para el cliente'));

  const blocked=renderPrivateNotesRoute({
    notes:[],
    capability:{ready:false,reason:'Sin permiso'},
  });
  assert.ok(blocked.includes('disabled aria-disabled="true"'));
});

test('Verification V2.6 preserves explicit conflict recovery without hiding operations',()=>{
  const html=renderVerificationRoute({
    center:{
      items:[{
        operationId:'op-1',
        status:'conflict',
        title:'Cambio en conflicto',
        errorCode:'revision_conflict',
        entityType:'session',
        attempts:2,
        nextRetryAt:null,
        actions:['retry','discard_local','inspect'],
      }],
      deploymentBlocked:true,
      summary:{pending:0,conflicts:1,rejected:0,total:1},
    },
  });

  assert.ok(html.includes('m30-verification-route'));
  assert.ok(html.includes('data-verification-surface="sync-state"'));
  assert.ok(html.includes('m30-verification-item'));
  assert.ok(html.includes('data-operation-status="conflict"'));
  assert.ok(html.includes('data-verification-action="refresh"'));
  for(const action of ['retry','discard_local','inspect']){
    assert.ok(html.includes('data-verification-action="'+action+'"'),'missing verification action '+action);
  }
  assert.ok(html.includes('Bloqueo activo'));
  assert.ok(html.includes('sin ocultar conflictos'));
});

test('Signature V2.6 is responsive and does not visually remove capabilities',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const start=css.indexOf('/* Signature UX V2.6');
  assert.ok(start>=0);
  const added=css.slice(start);

  for(const selector of [
    '.m30-reports-route',
    '.m30-report-primary',
    '.m30-intelligence-route',
    '.m30-intelligence-brief',
    '.m30-challenges-route',
    '.m30-settings-grid',
    '.m30-notes-editor',
    '.m30-verification-item',
  ]){
    assert.ok(added.includes(selector),'missing V2.6 selector '+selector);
  }

  assert.ok(added.includes('@media (max-width:900px)'));
  assert.ok(added.includes('@media (max-width:580px)'));
  assert.ok(added.includes('@media (prefers-reduced-motion:reduce)'));
  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
});
