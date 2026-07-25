import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IBERFIT_TIME_ZONE,
  civilDateInTimeZone,
  formatIberfitDate,
  parseCivilDate,
  parseDateValue,
} from '../src/m26/domain/civil-date.js';
import {deriveAgeYears} from '../src/m26/workflows/iri-profile.js';
import {
  __clientContentInternals,
  clientContentView,
} from '../src/m26/publication/client-content.js';
import {createProductionState} from '../src/m26/production-state.js';
import {createRouteViewModel} from '../src/m26/modules/route-view-model.js';
import {renderProgressRoute} from '../src/m26/modules/route-render.js';

const expected17=new Intl.DateTimeFormat('es-ES',{
  dateStyle:'medium',
  timeZone:'UTC',
}).format(new Date(Date.UTC(2026,6,17)));

const expected18=new Intl.DateTimeFormat('es-ES',{
  dateStyle:'medium',
  timeZone:'UTC',
}).format(new Date(Date.UTC(2026,6,18)));

test('una fecha civil conserva el mismo día sin depender del huso horario',()=>{
  const parsed=parseCivilDate('2026-07-17');

  assert.deepEqual(parsed,{
    iso:'2026-07-17',
    year:2026,
    month:7,
    day:17,
  });

  assert.equal(formatIberfitDate('2026-07-17'),expected17);
  assert.equal(
    parseDateValue('2026-07-17').toISOString(),
    '2026-07-17T00:00:00.000Z'
  );
});

test('las fechas civiles inválidas fallan cerradas',()=>{
  assert.equal(parseCivilDate('2026-02-30'),null);
  assert.equal(parseCivilDate('17-07-2026'),null);
  assert.equal(formatIberfitDate('2026-02-30'),null);
});

test('los instantes reales se presentan en la zona horaria IBERFIT',()=>{
  assert.equal(IBERFIT_TIME_ZONE,'America/Santiago');
  assert.equal(
    civilDateInTimeZone('2026-07-17T03:30:00.000Z'),
    '2026-07-16'
  );
  assert.equal(
    civilDateInTimeZone('2026-07-17T12:00:00.000Z'),
    '2026-07-17'
  );
});

test('la edad IRI usa aritmética civil y no Date UTC',()=>{
  assert.equal(deriveAgeYears('2000-07-25','2026-07-24'),25);
  assert.equal(deriveAgeYears('2000-07-25','2026-07-25'),26);
  assert.throws(
    ()=>deriveAgeYears('2000-02-30','2026-07-25'),
    /M26_IRI_BIRTH_DATE_INVALID/
  );
});

test('el contenido Cliente conserva los días de inicio y término',()=>{
  const view=clientContentView('report',{
    id:'REPORT-RC31-DATE',
    title:'Informe de prueba',
    periodStart:'2026-07-17',
    periodEnd:'2026-07-18',
    summary:'Resumen confirmado.',
  });

  assert.equal(view.dateRange,`${expected17} – ${expected18}`);
  assert.equal(
    __clientContentInternals.dateLabel('2026-07-17'),
    expected17
  );
});

test('el historial IRI Coach muestra la fecha civil exacta',()=>{
  const base=createProductionState();
  const clientId='CLI-RC31-DATE';

  const state=createProductionState({
    identity:{id:'COACH-RC31-DATE',role:'coach',name:'Coach'},
    activeArea:'iri',
    selectedClientId:clientId,
    collections:{
      ...base.collections,
      clients:[{id:clientId,name:'Cliente fecha'}],
      iriAssessments:[{
        id:'IRI-RC31-DATE',
        clientId,
        assessmentDate:'2026-07-17',
        status:'completado',
      }],
    },
  });

  const vm=createRouteViewModel(
    {
      activeArea:'iri',
      identity:{id:'COACH-RC31-DATE',role:'coach'},
    },
    state,
    new Date('2026-07-24T12:00:00.000Z')
  );

  assert.equal(vm.history.length,1);
  assert.equal(vm.history[0].dateLabel,expected17);
  assert.doesNotMatch(vm.history[0].dateLabel,/16/);
});

test('la cronología de progreso no desplaza una evaluación al día anterior',()=>{
  const html=renderProgressRoute({
    summary:{
      days:28,
      dataQuality:'limitada',
      adherence:null,
      completedSessions:0,
      plannedSessions:0,
      averageRpe:null,
      volume:null,
      iriDelta:null,
      iriCurrent:null,
      checkinAverage:{
        energy:null,
        sleep:null,
        stress:null,
        pain:null,
      },
      wearable:{metrics:{}},
    },
    signal:{label:'Sin datos',level:'info'},
    timeline:[{
      date:'2026-07-17',
      title:'Evaluación IRI',
      detail:'Registro confirmado',
    }],
    alerts:[],
  });

  assert.match(html,new RegExp(expected17.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.doesNotMatch(html,/16 jul/);
});
