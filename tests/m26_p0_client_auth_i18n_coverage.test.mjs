import test from 'node:test';
import assert from 'node:assert/strict';

import {
  iberfitSurfaceTranslate,
} from '../src/m26/ui/i18n-surface.js';
import {
  iberfitExtraSurfaceCoverage,
  iberfitExtraSurfaceSpanishCatalog,
} from '../src/m26/ui/i18n-surface-extra.js';

const CRITICAL_SURFACES=Object.freeze([
  'Correo',
  'Abre el acceso seguro',
  'Reintentar acceso',
  'Recuperación de acceso',
  'Estado del acceso',
  'Sesión disponible para reintentar',
  'Acceso a IBERFIT',
  'IBERFIT · entrenamiento personal',
  'Tu sesión está guardada. Puedes continuar sin bloquear el arranque de IBERFIT.',
  'Restaurando tu sesión segura…',
  'Reconectando tu sesión…',
  'Presencial con Coach',
  'Sesión autónoma',
  'Guiada en la aplicación',
  'Online en directo',
  'Contexto de sesión',
  'Capacidades de esta sesión',
  'Sesión supervisada',
  'Comenzar Live Workout',
  'Esta sesión la dirige tu Coach. Aparece en tu semana, pero no se reproduce como entrenamiento autónomo desde la aplicación.',
  'La sesión se realiza en directo con tu Coach.',
  'El contenido se mostrará cuando esté preparado y publicado.',
  'Tu agenda',
  'Agenda operativa',
  'Tu entrenamiento',
  'Preparación y ejecución',
  'Tu semana IBERFIT',
  'Tu semana de un vistazo',
  'Tu sesión confirmada está preparada para hoy.',
  'Registrar cómo estoy',
  'Abrir mis sesiones',
  'Revisar mi planificación',
  'Ver mi evolución',
  'Qué hacer hoy',
  'Tu recorrido',
]);

test('P0 Client and access surfaces are translated in every selectable non-Spanish language',()=>{
  for(const language of ['en','fr','pt']){
    for(const source of CRITICAL_SURFACES){
      const translated=iberfitSurfaceTranslate(source,{language});
      assert.ok(translated.trim(),`${language}: ${source} must not become blank`);
      assert.notEqual(translated,source,`${language}: ${source} must not remain Spanish`);
    }
  }
});

test('P0 dynamic Client session counts and top CTA translate without hardcoded Spanish fragments',()=>{
  const samples=[
    ['2 sesiones publicadas','2 published sessions','2 séances publiées','2 sessões publicadas'],
    ['3 sesiones','3 sessions','3 séances','3 sessões'],
    ['Tienes 1 sesión disponible en tu planificación.','You have 1 session available in your planning.','Vous avez 1 séance disponible dans votre planification.','Tem 1 sessão disponível no seu planeamento.'],
    ['Tienes 2 sesiones disponibles en tu planificación.','You have 2 sessions available in your planning.','Vous avez 2 séances disponibles dans votre planification.','Tem 2 sessões disponíveis no seu planeamento.'],
    ['Comenzar · Fuerza A','Start · Fuerza A','Démarrer · Fuerza A','Iniciar · Fuerza A'],
  ];
  for(const [source,en,fr,pt] of samples){
    assert.equal(iberfitSurfaceTranslate(source,{language:'en'}),en);
    assert.equal(iberfitSurfaceTranslate(source,{language:'fr'}),fr);
    assert.equal(iberfitSurfaceTranslate(source,{language:'pt'}),pt);
  }
});

test('P0 extra surface catalogue remains complete and contains the critical Client/access contract',()=>{
  const catalog=new Set(iberfitExtraSurfaceSpanishCatalog());
  for(const source of CRITICAL_SURFACES)assert.ok(catalog.has(source),`missing catalogue row: ${source}`);
  for(const coverage of iberfitExtraSurfaceCoverage()){
    assert.equal(coverage.complete,true,`${coverage.language} extra catalogue must be complete`);
    assert.deepEqual(coverage.missing,[]);
  }
});
