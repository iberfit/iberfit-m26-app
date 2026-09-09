import test from 'node:test';
import assert from 'node:assert/strict';
import {iberfitDynamicSurfaceTranslate} from '../src/m26/ui/i18n-surface-dynamic.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const tx=(value,language)=>iberfitDynamicSurfaceTranslate(value,{language,translatePart:(part)=>part});
const surface=(value,language)=>iberfitSurfaceTranslate(value,{language});

test('dynamic surface translator covers runtime counters and user-preserving phrases',()=>{
  assert.equal(tx('3 ejercicios visibles con los filtros actuales.','en'),'3 exercises visible with the current filters.');
  assert.equal(tx('1 cliente encontrado con búsqueda tolerante.','fr'),'1 client trouvé avec la recherche tolérante.');
  assert.equal(tx('2 clientes visibles con los filtros actuales.','pt'),'2 clientes visíveis com os filtros atuais.');
  assert.equal(tx('Expediente de Ana Pérez creado. Continúa con la primera sesión.','en'),'Record for Ana Pérez created. Continue with the first session.');
  assert.equal(tx('Tu acompañamiento, Ana Pérez','fr'),'Votre accompagnement, Ana Pérez');
});

test('dynamic surface translator covers Coach progress session and wearable sentences',()=>{
  assert.equal(tx('RPE 7.5 · esfuerzo percibido confirmado','en'),'RPE 7.5 · confirmed perceived effort');
  assert.equal(tx('4 de 6 sesiones confirmadas en 28 días','fr'),'4 séances confirmées sur 6 en 28 jours');
  assert.equal(tx('2 de 6 sesiones confirmadas en 28 días · 1 pendiente fuera del cálculo','pt'),'2 de 6 sessões confirmadas em 28 dias · 1 pendente fora do cálculo');
  assert.equal(tx('Calidad alta · 2 muestras excluidas de métricas','en'),'Quality alta · 2 samples excluded from metrics');
  assert.equal(tx('3 exposiciones confirmadas · calidad suficiente','fr'),'3 expositions confirmées · qualité suficiente');
  assert.equal(tx('2 conexiones registradas','pt'),'2 ligações registadas');
});

test('dynamic surface translator covers access errors and device continuity without changing identifiers',()=>{
  assert.equal(tx('No fue posible conectar. Código: M26_NETWORK_UNAVAILABLE.','en'),'No fue posible conectar. Code: M26_NETWORK_UNAVAILABLE.');
  assert.equal(tx('Garmin conectado. No hay resúmenes disponibles en el periodo seleccionado.','fr'),'Garmin connecté. Aucun résumé n’est disponible pour la période sélectionnée.');
  assert.equal(tx('Apple Health: la conexión requiere revisión. Los datos confirmados existentes no se alteran.','pt'),'Apple Health: a ligação requer revisão. Os dados confirmados existentes não são alterados.');
  assert.equal(tx('Coach · sesión en este dispositivo','en'),'Coach · session on this device');
});

test('public surface translator closes final Admin planning and live-session families',()=>{
  assert.equal(surface('3 sesiones/semana','en'),'3 sessions/week');
  assert.equal(surface('2 sesiones por semana','fr'),'2 séances par semaine');
  assert.equal(surface('Abrir seguimiento de Ana Pérez','pt'),'Abrir acompanhamento de Ana Pérez');
  assert.equal(surface('12 clientes','en'),'12 clients');
  assert.equal(surface('18 de 40 h · 12 clientes','fr'),'18 sur 40 h · 12 clients');
  assert.equal(surface('45% de carga','pt'),'45% de carga');
  assert.equal(surface('4 de 6 series resueltas · guardado','en'),'4 of 6 sets resolved · guardado');
  assert.equal(surface('3 de 5 series','pt'),'3 de 5 séries');
});

test('dynamic translator leaves unmatched user/domain content untouched',()=>{
  for(const language of ['en','fr','pt']){
    assert.equal(tx('Peso muerto rumano con mancuernas',language),'Peso muerto rumano con mancuernas');
    assert.equal(tx('Ana Pérez',language),'Ana Pérez');
  }
});
