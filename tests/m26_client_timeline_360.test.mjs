import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientTimeline360,
  buildProgressTimeline,
} from '../src/m26/engagement/index.js';

const NOW=new Date('2026-09-06T12:00:00Z');

function state(){
  return {
    collections:{
      clients:[
        {id:'client-1',createdAt:'2026-07-01T09:00:00Z',name:'Cliente Uno'},
      ],
      trainingCycles:[
        {
          id:'plan-1',clientId:'client-1',status:'publicado',visibleToClient:true,
          publishedAt:'2026-08-10T09:00:00Z',title:'Fuerza base',goal:'Construir consistencia semanal',
        },
        {
          id:'plan-draft',clientId:'client-1',status:'borrador',
          publishedAt:'2026-08-20T09:00:00Z',title:'No debe aparecer',
        },
      ],
      sessions:[
        {
          id:'session-1',clientId:'client-1',status:'published',visibleToClient:true,
          publishedAt:'2026-08-15T09:00:00Z',title:'Fuerza A',objective:'Técnica y control',
        },
        {
          id:'session-hidden',clientId:'client-1',status:'published',visibleToClient:false,
          publishedAt:'2026-08-16T09:00:00Z',title:'Sesión interna',
        },
      ],
      reports:[
        {
          id:'report-1',clientId:'client-1',status:'aprobado',visibleToClient:true,
          publishedAt:'2026-08-18T09:00:00Z',title:'Informe no publicado',
        },
        {
          id:'report-2',clientId:'client-1',status:'publicado',visibleToClient:true,
          publishedAt:'2026-09-01T09:00:00Z',title:'Informe de evolución',
        },
      ],
      appointments:[
        {
          id:'appointment-1',clientId:'client-1',status:'confirmada',visibleToClient:true,
          title:'Entrenamiento presencial',startAt:'2026-09-02T12:00:00Z',modality:'presencial',
        },
        {
          id:'appointment-hidden',clientId:'client-1',status:'propuesta',visibleToClient:true,
          title:'Propuesta no confirmada',startAt:'2026-09-03T12:00:00Z',
        },
      ],
      sessionExecutions:[
        {
          id:'exec-1',clientId:'client-1',status:'completed',syncStatus:'clean',
          completedAt:'2026-09-04T10:00:00Z',title:'Fuerza A',
          results:{'set-1':{reps:10,loadKg:20,rpe:7}},
          feedback:{pain:true,painNotes:'Molestia leve en hombro'},
        },
      ],
      iriAssessments:[],
      checkins:[],
      wearableDailySummaries:[],
    },
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
  };
}

test('Client Timeline 360 combines confirmed lifecycle evidence in one chronology',()=>{
  const rows=buildClientTimeline360(state(),'client-1',{now:NOW,days:90,limit:30});
  const titles=rows.map((row)=>row.title);

  assert.ok(titles.includes('Alta en IBERFIT'));
  assert.ok(titles.includes('Fuerza base'));
  assert.ok(titles.includes('Fuerza A'));
  assert.ok(titles.includes('Informe de evolución'));
  assert.ok(titles.includes('Entrenamiento presencial'));

  assert.equal(titles.includes('No debe aparecer'),false);
  assert.equal(titles.includes('Sesión interna'),false);
  assert.equal(titles.includes('Informe no publicado'),false);
  assert.equal(titles.includes('Propuesta no confirmada'),false);

  const execution=rows.find((row)=>row.kind==='execution');
  assert.match(execution.detail,/Molestia registrada/u);
  assert.match(execution.detail,/hombro/u);

  const sorted=[...rows].map((row)=>new Date(row.date).getTime());
  assert.deepEqual(sorted,[...sorted].sort((a,b)=>b-a));
});

test('canonical engagement API promotes the richer timeline without changing its public name',()=>{
  assert.equal(buildProgressTimeline,buildClientTimeline360);
  const rows=buildProgressTimeline(state(),'client-1',{now:NOW,days:90,limit:4});
  assert.equal(rows.length,4);
  assert.equal(rows[0].kind,'execution');
});

test('timeline stays fail-closed when publication evidence is incomplete',()=>{
  const sample=state();
  sample.collections.trainingCycles.push({
    id:'plan-no-date',clientId:'client-1',status:'publicado',visibleToClient:true,title:'Sin fecha explícita',
  });
  sample.collections.sessions.push({
    id:'session-no-status',clientId:'client-1',publishedAt:'2026-09-05T09:00:00Z',title:'Sin estado publicado',
  });

  const rows=buildClientTimeline360(sample,'client-1',{now:NOW,days:90,limit:30});
  const titles=rows.map((row)=>row.title);
  assert.equal(titles.includes('Sin fecha explícita'),false);
  assert.equal(titles.includes('Sin estado publicado'),false);
});

test('client isolation is preserved across all added lifecycle collections',()=>{
  const sample=state();
  sample.collections.trainingCycles.push({
    id:'other-plan',clientId:'client-2',status:'publicado',visibleToClient:true,
    publishedAt:'2026-09-05T09:00:00Z',title:'Plan de otro cliente',
  });
  sample.collections.appointments.push({
    id:'other-appointment',clientId:'client-2',status:'confirmada',visibleToClient:true,
    startAt:'2026-09-05T10:00:00Z',title:'Cita de otro cliente',
  });

  const rows=buildClientTimeline360(sample,'client-1',{now:NOW,days:90,limit:30});
  const titles=rows.map((row)=>row.title);
  assert.equal(titles.includes('Plan de otro cliente'),false);
  assert.equal(titles.includes('Cita de otro cliente'),false);
});
