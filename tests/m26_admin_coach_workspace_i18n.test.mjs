import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  IBERFIT_LANGUAGE_CATALOG,
  iberfitLanguageOptions,
  iberfitPlannedLanguages,
  iberfitTranslationCoverage,
  iberfitTranslate,
} from '../src/m26/ui/i18n.js';

const shell=fs.readFileSync('src/m26/shell/shell-render.js','utf8');
const navigation=fs.readFileSync('src/m26/shell/navigation.js','utf8');
const adminNavigation=fs.readFileSync('src/m26/admin/navigation.js','utf8');

test('IBERFIT exposes exactly the four requested application languages with visible flags and measured coverage',()=>{
  assert.deepEqual(
    IBERFIT_LANGUAGE_CATALOG.map(({value,flag})=>({value,flag})),
    [
      {value:'es',flag:'🇪🇸'},
      {value:'en',flag:'🇬🇧'},
      {value:'fr',flag:'🇫🇷'},
      {value:'pt',flag:'🇵🇹'},
    ]
  );
  assert.equal(IBERFIT_LANGUAGE_CATALOG.some((item)=>Object.hasOwn(item,'complete')),false);
  assert.deepEqual(iberfitPlannedLanguages().map(({value,complete})=>({value,complete})),[
    {value:'es',complete:true},
    {value:'en',complete:true},
    {value:'fr',complete:true},
    {value:'pt',complete:true},
  ]);
  for(const coverage of iberfitTranslationCoverage()){
    assert.equal(coverage.complete,true);
    assert.equal(coverage.missing.length,0);
    assert.equal(coverage.extra.length,0);
    assert.equal(coverage.blank.length,0);
    assert.equal(coverage.translated,coverage.total);
  }
  assert.equal(iberfitLanguageOptions().length,4);
  assert.equal(iberfitTranslate('settings.title',{language:'es'}),'Ajustes');
  assert.equal(iberfitTranslate('settings.title',{language:'en'}),'Settings');
  assert.equal(iberfitTranslate('settings.title',{language:'fr'}),'Réglages');
  assert.equal(iberfitTranslate('settings.title',{language:'pt'}),'Definições');
});

test('Admin and Coach workspace navigation is grouped around understandable jobs without changing route contracts',()=>{
  for(const group of [
    'nav.admin.direction','nav.admin.people','nav.admin.operation','nav.admin.control',
    'nav.coach.day','nav.coach.clients','nav.coach.resources','nav.coach.control',
  ])assert.match(shell,new RegExp(group.replaceAll('.','\\.')));

  for(const area of [
    'admin-inicio','admin-usuarios','admin-equipo','admin-clientes','admin-agenda',
    'admin-operaciones','admin-comunicacion','admin-automatizaciones','admin-analitica',
    'admin-auditoria','admin-configuracion',
  ])assert.match(adminNavigation,new RegExp(`['\"]${area}['\"]`));

  for(const area of [
    'hoy','clientes','agenda','biblioteca','expediente','iri','planificacion','sesion',
    'progreso','actividad','informes','retos','notas','inteligencia','mensajes','ajustes','verificacion',
  ])assert.match(navigation,new RegExp(`${area}`));
});

test('Workspace shell includes quick actions, language cards, region selector and safe client-dependent disabling',()=>{
  assert.match(shell,/m26-workspace-home/u);
  assert.match(shell,/m26-workspace-actions/u);
  assert.match(shell,/data-m26-ui-language/u);
  assert.match(shell,/data-m26-ui-locale/u);
  assert.match(shell,/m26-language-flag/u);
  assert.match(shell,/common\.clientRequired/u);
  assert.match(shell,/action\.client&&!vm\.selectedClient/u);
});


test('Coach Today keeps quick actions accessible without putting them ahead of operational priority',()=>{
  assert.match(shell,/data-m26-workspace-shortcuts="coach"/u);
  assert.match(shell,/class="m26-workspace-shortcuts"/u);
  assert.match(shell,/workspace\.coach\.primary/u);
  assert.match(shell,/m26-workspace-shortcuts-toggle/u);
  assert.match(shell,/const shortcuts=isAdmin[\s\S]*?<div class="m26-workspace-section-title">[\s\S]*?:`<details class="m26-workspace-shortcuts"/u);
  assert.doesNotMatch(shell,/data-m26-workspace-shortcuts="admin"/u);
  for(const area of ['clientes','agenda','planificacion','mensajes']){
    assert.match(shell,new RegExp(`area:'${area}'`,'u'));
  }
});

test('Coach shortcut disclosure remains touch-safe, motion-safe and printable',()=>{
  const start=shell.indexOf('.m26-workspace-shortcuts{');
  const end=shell.indexOf('</style>',start);
  assert.ok(start>=0&&end>start);
  const block=shell.slice(start,end);
  assert.match(block,/min-height:3\.4rem/u);
  assert.match(block,/@media\(max-width:720px\)/u);
  assert.match(block,/@media\(prefers-reduced-motion:reduce\)/u);
  assert.match(block,/@media print/u);
});
