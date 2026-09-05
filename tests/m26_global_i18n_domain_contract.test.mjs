import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  iberfitDomainTranslate,
  iberfitDomainTranslationCoverage,
  iberfitStatusLabel,
  iberfitSourceLabel,
  iberfitPlatformLabel,
  iberfitEntityLabel,
  iberfitOperationTitle,
  iberfitOperationDetail,
  iberfitCompareText,
  iberfitFormatNumber,
  iberfitFormatDate,
} from '../src/m26/ui/i18n-domain.js';
import {IBERFIT_LANGUAGE_CATALOG} from '../src/m26/ui/i18n.js';
import {deriveCoachCockpit} from '../src/m26/experience/coach-cockpit.js';

function mockStorage(language,locale){
  return {
    getItem(key){
      if(key==='iberfit:m26:ui-language')return language;
      if(key==='iberfit:m26:ui-locale')return locale;
      return null;
    },
    setItem(){},
    removeItem(){},
  };
}

test('shared domain language has complete parity for every supported IBERFIT language',()=>{
  assert.deepEqual(IBERFIT_LANGUAGE_CATALOG.map((item)=>item.value),['es','en','fr','pt']);
  for(const coverage of iberfitDomainTranslationCoverage()){
    assert.equal(coverage.complete,true,`${coverage.language} must be complete`);
    assert.deepEqual(coverage.missing,[]);
    assert.deepEqual(coverage.extra,[]);
    assert.deepEqual(coverage.blank,[]);
  }
});

test('status, source, platform, entity and operation copy resolves from the active language model',()=>{
  assert.equal(iberfitStatusLabel('pending',{language:'es'}),'Pendiente');
  assert.equal(iberfitStatusLabel('pending',{language:'en'}),'Pending');
  assert.equal(iberfitStatusLabel('pending',{language:'fr'}),'En attente');
  assert.equal(iberfitStatusLabel('pending',{language:'pt'}),'Pendente');
  assert.equal(iberfitStatusLabel('confirmado',{language:'en'}),'Confirmed');
  assert.equal(iberfitSourceLabel('registro_bienestar',{language:'fr'}),'Suivi du bien-être');
  assert.equal(iberfitPlatformLabel('cloud',{language:'pt'}),'Serviço online');
  assert.equal(iberfitEntityLabel('session',{language:'en'}),'Session');
  assert.equal(iberfitOperationTitle('SESION_PUBLICAR','session',{language:'en'}),'Session · Publish');
  assert.equal(iberfitOperationDetail('ROLE_FORBIDDEN','session',{language:'fr'}),'Le compte actuel n’a pas l’autorisation d’effectuer cette opération.');
  assert.equal(iberfitDomainTranslate('coach.nextStep',{language:'pt',params:{action:'Rever processo'}}),'Próximo passo: Rever processo.');
});

test('regional formatting follows locale independently from translated language copy',()=>{
  assert.equal(iberfitFormatNumber(1234.5,{minimumFractionDigits:1},'en-US'),'1,234.5');
  assert.match(iberfitFormatNumber(1234.5,{minimumFractionDigits:1},'es-CL'),/1[.,]234,5|1\.234,5/u);
  assert.match(iberfitFormatDate('2026-09-05T12:00:00Z',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'},'en-US'),/09\/05\/2026/u);
  assert.equal(Math.sign(iberfitCompareText('Álvaro','Bruno',{language:'es'})),-1);
});

test('coach cockpit uses the global language at render derivation time instead of hardcoded Spanish',()=>{
  const previous=globalThis.localStorage;
  globalThis.localStorage=mockStorage('fr','fr-FR');
  try{
    const cockpit=deriveCoachCockpit([{
      client:{
        id:'client-1',
        name:'',
        experience:{stage:'onboarding',stageLabel:''},
        nextAction:{label:'',area:'expediente'},
      },
      alerts:[],
    }]);
    assert.equal(cockpit.items.length,1);
    assert.equal(cockpit.items[0].clientName,'Client');
    assert.equal(cockpit.items[0].signalLabel,'Parcours en attente');
    assert.equal(cockpit.items[0].reason,'Suivi actif');
    assert.equal(cockpit.items[0].detail,'Le parcours du client comporte une étape en attente.');
    assert.equal(cockpit.items[0].guidance,'Prochaine étape : Ouvrir le dossier client.');
  }finally{
    if(previous===undefined)delete globalThis.localStorage;
    else globalThis.localStorage=previous;
  }
});

test('legacy castellano bridge delegates to global i18n and coach cockpit contains no own Spanish fallback catalogue',()=>{
  const bridge=fs.readFileSync('src/m26/ui/castellano.js','utf8');
  const cockpit=fs.readFileSync('src/m26/experience/coach-cockpit.js','utf8');
  assert.match(bridge,/from '\.\/i18n-domain\.js'/u);
  assert.doesNotMatch(bridge,/const STATUS_LABELS|const ERROR_MESSAGES|const OPERATION_ACTION_LABELS/u);
  assert.match(cockpit,/i18n-domain\.js/u);
  assert.doesNotMatch(cockpit,/Atención prioritaria|Seguimiento al día|Siguiente paso:/u);
});
