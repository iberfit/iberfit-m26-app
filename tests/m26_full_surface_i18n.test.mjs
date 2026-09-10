import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  iberfitSurfaceTranslate,
  iberfitSurfaceTranslationCoverage,
  iberfitSurfaceSpanishCatalog,
} from '../src/m26/ui/i18n-surface.js';

test('full surface catalogue is deterministic and complete for en/fr/pt',()=>{
  const coverage=iberfitSurfaceTranslationCoverage();
  assert.deepEqual(coverage.map((item)=>item.language),['en','fr','pt']);
  for(const item of coverage){
    assert.equal(item.complete,true);
    assert.equal(item.missing.length,0);
    assert.equal(item.translated,item.total);
  }
  assert.ok(iberfitSurfaceSpanishCatalog().length>=180);
});

test('surface translator covers representative Admin Coach Client and access/session UI',()=>{
  const cases=[
    ['Prioridades de hoy','Today’s priorities','Priorités du jour','Prioridades de hoje'],
    ['Revisar agenda','Review schedule','Vérifier l’agenda','Rever agenda'],
    ['Cliente 360','Client 360','Client 360','Cliente 360'],
    ['Tu día IBERFIT','Your IBERFIT day','Votre journée IBERFIT','O seu dia IBERFIT'],
    ['Evaluación IRI','IRI Assessment','Évaluation IRI','Avaliação IRI'],
    ['Crear cliente y enviar invitación','Create client and send invitation','Créer le client et envoyer l’invitation','Criar cliente e enviar convite'],
    ['Mostrar contraseña','Show password','Afficher le mot de passe','Mostrar palavra-passe'],
    ['Iniciar entrenamiento','Start training','Démarrer l’entraînement','Iniciar treino'],
    ['Pendiente de sincronización','Pending sync','Synchronisation en attente','Sincronização pendente'],
    ['Recuperación y bienestar','Recovery and wellbeing','Récupération et bien-être','Recuperação e bem-estar'],
  ];
  for(const [es,en,fr,pt] of cases){
    assert.equal(iberfitSurfaceTranslate(es,{language:'es'}),es);
    assert.equal(iberfitSurfaceTranslate(es,{language:'en'}),en);
    assert.equal(iberfitSurfaceTranslate(es,{language:'fr'}),fr);
    assert.equal(iberfitSurfaceTranslate(es,{language:'pt'}),pt);
  }
});

test('surface translator preserves whitespace and handles stable composable labels',()=>{
  assert.equal(iberfitSurfaceTranslate('  Ver clientes  ',{language:'en'}),'  View clients  ');
  assert.equal(iberfitSurfaceTranslate('7 de 7 etapas completadas',{language:'fr'}),'7 sur 7 étapes terminées');
  assert.equal(iberfitSurfaceTranslate('Últimos 28 días',{language:'pt'}),'Últimos 28 dias');
  assert.equal(iberfitSurfaceTranslate('Siguiente paso: Revisar agenda',{language:'en'}),'Next step: Review schedule');
  assert.equal(iberfitSurfaceTranslate('Texto de un cliente que no está en catálogo',{language:'en'}),'Texto de un cliente que no está en catálogo');
});

test('i18n bootstrap installs surface translation only in browser runtime',()=>{
  const source=fs.readFileSync('src/m26/ui/i18n.js','utf8');
  assert.match(source,/i18n-surface\.js/u);
  assert.match(source,/installIberfitSurfaceI18n/u);
  const uiIndex=fs.readFileSync('src/m26/ui/index.js','utf8');
  assert.match(uiIndex,/i18n-surface\.js/u);
});
