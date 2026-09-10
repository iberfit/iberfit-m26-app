import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  renderIriRoute,
  renderLibraryRoute,
} from '../src/m26/modules/route-render-base.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');

test('IRI V2.5 keeps all seven canonical stages and workflow actions',()=>{
  const html=renderIriRoute({
    role:'coach',
    current:{id:'iri-test'},
    currentSummary:null,
    profile:{},
    sourceProfile:{},
    canEdit:true,
    history:[],
  });

  assert.ok(html.includes('class="m26-route m30-iri-route"'));
  assert.ok(html.includes('data-iri-surface="assessment"'));
  assert.ok(html.includes('m30-iri-wizard'));
  assert.ok(html.includes('aria-label="Etapas de la evaluación IRI"'));

  for(const step of ['perfil','entrevista','composicion','movilidad','fuerza','cardio','revision']){
    assert.ok(html.includes('data-iri-step="'+step+'"'),'missing IRI step '+step);
  }

  for(const action of [
    'iri-prev',
    'save-iri-draft',
    'iri-next',
    'complete-iri',
    'generate-client-iri-report',
    'generate-coach-iri-report',
  ]){
    assert.ok(html.includes('data-workflow-action="'+action+'"'),'missing IRI action '+action);
  }

  assert.ok(html.includes('data-iri-progress'));
  assert.ok(html.includes('data-iri-comparability'));
  assert.ok(html.includes('data-iri-timer="cardio"'));
});

test('IRI V2.5 preserves skip, protocol and review safety controls',()=>{
  const html=renderIriRoute({
    role:'coach',
    current:{id:'iri-test'},
    currentSummary:null,
    profile:{},
    sourceProfile:{},
    canEdit:true,
    history:[],
  });

  for(const control of [
    'bodyCompositionSkipped',
    'mobilitySkipped',
    'strengthSkipped',
    'cardioSkipped',
    'screeningAccepted',
    'reviewAccepted',
  ]){
    assert.ok(html.includes('name="'+control+'"'),'missing IRI safety control '+control);
  }

  assert.ok(html.includes('data-iri-protocol-grid="composicion"'));
  assert.ok(html.includes('data-iri-protocol-grid="movilidad"'));
  assert.ok(html.includes('data-iri-protocol-grid="fuerza"'));
  assert.ok(html.includes('data-iri-protocol-grid="cardio"'));
  assert.ok(html.includes('nunca forman una puntuación global'));
});

test('Library V2.5 keeps canonical search, all filters, status and grid',()=>{
  const html=renderLibraryRoute({
    role:'coach',
    catalog:[],
    mediaMap:null,
    total:0,
  });

  assert.ok(html.includes('m30-library-route'));
  assert.ok(html.includes('data-library-role="coach"'));
  assert.ok(html.includes('m30-library-controls'));
  assert.ok(html.includes('data-library-search'));
  assert.ok(html.includes('enterkeyhint="search"'));
  assert.ok(html.includes('autocapitalize="none"'));

  for(const filter of ['equipment','pattern','visual']){
    assert.ok(html.includes('data-library-filter="'+filter+'"'),'missing library filter '+filter);
  }

  assert.ok(html.includes('data-library-clear'));
  assert.ok(html.includes('data-library-grid'));
  assert.ok(html.includes('data-library-status'));
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('Biblioteca no cargada'));
});

test('Library V2.5 preserves admin global rename capability in exercise cards',()=>{
  const html=renderLibraryRoute({
    role:'admin',
    total:1,
    mediaMap:null,
    catalog:[{
      id:'squat-test',
      revision:2,
      name_es:'Sentadilla',
      pattern:'sentadilla',
      equipment:'sin material',
      primary_muscles:['Cuádriceps'],
      secondary_muscles:[],
      instructions_es:['Controlar el descenso.'],
      precautions:['Detener ante dolor.'],
      aliases:[],
      tags:[],
      units:['reps'],
    }],
  });

  assert.ok(html.includes('data-exercise-id="squat-test"'));
  assert.ok(html.includes('data-exercise-rename-form'));
  assert.ok(html.includes('data-expected-revision="2"'));
  assert.ok(html.includes('Guardar nombre global'));
});

test('Signature V2.5 improves IRI and Library responsively without hiding capabilities',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const start=css.indexOf('/* Signature UX V2.5');
  assert.ok(start>=0);
  const added=css.slice(start);

  for(const selector of [
    '.m30-iri-route',
    '.m30-iri-wizard',
    '.m30-iri-stepper',
    '.m30-iri-progress',
    '.m30-iri-active-step-shell',
    '.m30-iri-actions',
    '.m30-library-route',
    '.m30-library-controls',
    '.m30-library-search',
    '.m30-library-groups',
  ]){
    assert.ok(added.includes(selector),'missing V2.5 selector '+selector);
  }

  for(const breakpoint of [
    '@media (max-width:1100px)',
    '@media (max-width:760px)',
    '@media (max-width:580px)',
    '@media (max-width:390px)',
    '@media (prefers-reduced-motion:reduce)',
  ]){
    assert.ok(added.includes(breakpoint),'missing V2.5 breakpoint '+breakpoint);
  }

  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
});

test('V2.5 keeps mobile IRI actions visible and makes library filters non-sticky on compact screens',()=>{
  const css=read('src/m26/design/signature-ux-v2.css');
  const added=css.slice(css.indexOf('/* Signature UX V2.5'));
  const compact=added.slice(added.indexOf('@media (max-width:760px)'));

  assert.ok(compact.includes('.m30-iri-actions'));
  assert.ok(compact.includes('position:static'));
  assert.ok(compact.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(compact.includes('.m30-library-controls'));
  assert.ok(compact.includes('.m30-library-groups .m26-library-group-heading'));
});
