import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {clientContentView} from '../src/m26/publication/client-content.js';
import {buildEvolutionReportHtml} from '../src/m26/workflows/evolution-report-document.js';

const makeRecord=()=>({
  id:'11111111-1111-4111-8111-111111111111',
  client_id:'22222222-2222-4222-8222-222222222222',
  status:'publicado',audience:'cliente',title:'Tu evolución',
  summary:'Entrenamientos confirmados del mes',
  coachComment:'PRIVATE_COACH_NOTE_NOT_FOR_CLIENT',
  content:{
    reportType:'monthly',conclusions:'Revisión profesional realizada.',
    recommendations:'Siguiente bloque acordado.',
    periodStart:'2026-09-15',periodEnd:'2026-10-15',
    evidence:[{label:'Entrenamientos',text:'3',source:'sessionExecutions'}],
    activitySeries:[
      {from:'2026-09-15',to:'2026-09-22',count:0},
      {from:'2026-09-23',to:'2026-10-15',count:3},
    ],
  },
});

test('M44 published client report projects prose, timeline and provenance but no private coach note',()=>{
  const client=clientContentView('report',makeRecord());
  assert.equal(client.reportDocument.id,'monthly');
  assert.equal(client.reportDocument.conclusions,'Revisión profesional realizada.');
  assert.equal(client.reportDocument.activitySeries.length,2);
  assert.equal(client.reportDocument.evidence[0].source,'sessionExecutions');
  assert.doesNotMatch(JSON.stringify(client),/PRIVATE_COACH_NOTE_NOT_FOR_CLIENT/);
});
test('M44 client cannot download a private draft, Coach-only report or withdrawn publication',()=>{
  for(const status of ['borrador','aprobado','retirado']){
    const v=clientContentView('report',{...makeRecord(),status});
    assert.equal(v.reportDocument,null,status);
  }
  assert.equal(clientContentView('report',{...makeRecord(),audience:'coach'}).reportDocument,null);
});
test('M44 published A4 rendering has five sheets and no draft watermark or coach-private section',()=>{
  const report=clientContentView('report',makeRecord()).reportDocument;
  const html=buildEvolutionReportHtml({report,publicationStatus:'published',clientName:'Persona QA'});
  assert.equal((html.match(/class="m44-sheet /g)||[]).length,5);
  assert.match(html,/CONSULTA DE INFORME PUBLICADO EN PLATAFORMA/);
  assert.doesNotMatch(html,/BORRADOR PRIVADO|LA MIRADA DE TU COACH|PRIVATE_COACH_NOTE_NOT_FOR_CLIENT/);
});
test('M44 Client opens published content through an explicit action and no hidden automatic publishing',async()=>{
  const ui=await readFile(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const controller=await readFile(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  assert.match(ui,/data-workflow-action="open-published-evolution-report"/);
  assert.match(controller,/function openPublishedEvolutionReport/);
  assert.match(controller,/if\(role!=='client'\|\|!clientId\)/);
  assert.match(controller,/clientContentView\('report',record\)/);
  assert.match(controller,/publicationStatus:'published'/);
  assert.doesNotMatch(controller,/openPublishedEvolutionReport[\s\S]*?async function executeWorkflowAction[\s\S]*?commandBus\.execute\(\s*buildPublicationCommand\(/u);
});
