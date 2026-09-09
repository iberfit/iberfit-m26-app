import test from 'node:test';
import assert from 'node:assert/strict';
import {
  iberfitExtraSurfaceTranslate,
  iberfitExtraSurfaceCoverage,
  iberfitExtraSurfaceSpanishCatalog,
} from '../src/m26/ui/i18n-surface-extra.js';

test('route surface catalogue is complete in en fr pt',()=>{
  const coverage=iberfitExtraSurfaceCoverage();
  assert.deepEqual(coverage.map((item)=>item.language),['en','fr','pt']);
  for(const item of coverage){
    assert.equal(item.complete,true);
    assert.equal(item.missing.length,0);
    assert.equal(item.translated,item.total);
  }
  assert.ok(iberfitExtraSurfaceSpanishCatalog().length>=350);
});

test('route surface covers client coach admin IRI devices and library',()=>{
  const cases=[
    ['Qué requiere tu decisión','What needs your decision','Ce qui nécessite votre décision','O que requer a sua decisão'],
    ['Cliente 360º · Expediente profesional','Client 360º · Professional record','Client 360º · Dossier professionnel','Cliente 360º · Processo profissional'],
    ['Dispositivos · últimos 7 días','Devices · last 7 days','Appareils · 7 derniers jours','Dispositivos · últimos 7 dias'],
    ['Confirmar evaluación IRI','Confirm IRI assessment','Confirmer l’évaluation IRI','Confirmar avaliação IRI'],
    ['Preparar ciclo de entrenamiento','Prepare training cycle','Préparer le cycle d’entraînement','Preparar ciclo de treino'],
    ['Preparar informe IBERFIT','Prepare IBERFIT report','Préparer le rapport IBERFIT','Preparar relatório IBERFIT'],
    ['Crear ejercicio personalizado','Create custom exercise','Créer un exercice personnalisé','Criar exercício personalizado'],
    ['No existe publicación automática ni ranking público.','There is no automatic publishing or public ranking.','Il n’existe ni publication automatique ni classement public.','Não existe publicação automática nem ranking público.'],
  ];
  for(const [es,en,fr,pt] of cases){
    assert.equal(iberfitExtraSurfaceTranslate(es,{language:'en'}),en);
    assert.equal(iberfitExtraSurfaceTranslate(es,{language:'fr'}),fr);
    assert.equal(iberfitExtraSurfaceTranslate(es,{language:'pt'}),pt);
  }
});

test('route surface does not translate unknown domain or user data',()=>{
  assert.equal(iberfitExtraSurfaceTranslate('Ana Pérez',{language:'en'}),'Ana Pérez');
  assert.equal(iberfitExtraSurfaceTranslate('Peso muerto rumano con mancuernas',{language:'fr'}),'Peso muerto rumano con mancuernas');
});
