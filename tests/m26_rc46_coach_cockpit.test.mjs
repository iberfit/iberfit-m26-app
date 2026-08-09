import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveCoachCockpit,
} from '../src/m26/experience/coach-cockpit.js';

import {
  renderHoyRoute,
} from '../src/m26/modules/route-render.js';

function client(
  id,
  name,
  stage='active',
  priority=5
){
  return {
    id,
    name,
    modality:'Híbrida',
    status:'Activo',
    accessKnown:true,
    profile:{
      primaryObjective:'Mejorar salud',
      weeklyFrequency:2,
    },
    iri:{
      confirmed:true,
      coverageCount:7,
      coverageLabel:'7 etapas',
      processLabel:'Completada',
    },
    cycle:{name:'Plan activo'},
    nextAppointment:{dateLabel:'10 ago'},
    experience:{
      stage,
      stageLabel:
        stage==='evaluation'
          ?'Evaluación pendiente'
          :stage==='planning'
            ?'Planificación pendiente'
            :stage==='onboarding'
              ?'Alta incompleta'
              :'Seguimiento activo',
      priority,
    },
    nextAction:{
      key:'review',
      label:
        stage==='evaluation'
          ?'Continuar diagnóstico IRI'
          :'Revisar seguimiento',
      area:
        stage==='evaluation'
          ?'iri'
          :'expediente',
      reason:
        stage==='evaluation'
          ?'La evaluación debe quedar confirmada.'
          :'Revisar la evolución reciente.',
    },
  };
}

function alert(
  severity,
  title,
  detail='Detalle explicable',
  action='Revisar con el cliente.'
){
  return {
    id:`${severity}-${title}`,
    severity,
    title,
    detail,
    action,
    source:'registro_bienestar',
  };
}

test(
  'Cockpit prioriza crítico antes que advertencia',
  ()=>{
    const cockpit=deriveCoachCockpit([
      {
        client:client('C1','Ana'),
        alerts:[
          alert(
            'warning',
            'Recuperación condicionada'
          ),
        ],
      },
      {
        client:client('C2','Bruno'),
        alerts:[
          alert(
            'critical',
            'Dolor elevado informado'
          ),
        ],
      },
    ]);

    assert.equal(
      cockpit.items[0].clientId,
      'C2'
    );

    assert.equal(
      cockpit.items[0].signalLabel,
      'Atención prioritaria'
    );

    assert.equal(
      cockpit.riskFocus.clientId,
      'C2'
    );
  }
);

test(
  'recorrido pendiente queda antes que seguimiento informativo',
  ()=>{
    const cockpit=deriveCoachCockpit([
      {
        client:client(
          'C1',
          'Ana',
          'evaluation',
          2
        ),
        alerts:[],
      },
      {
        client:client(
          'C2',
          'Bruno',
          'active',
          5
        ),
        alerts:[
          alert(
            'info',
            'Ciclo próximo a finalizar'
          ),
        ],
      },
    ]);

    assert.deepEqual(
      cockpit.items.map((item)=>item.kind),
      ['process','info']
    );

    assert.equal(
      cockpit.riskFocus,
      null
    );
  }
);

test(
  'cliente activo y sin señales no ensucia la cola',
  ()=>{
    const cockpit=deriveCoachCockpit([
      {
        client:client('C1','Ana'),
        alerts:[],
      },
    ]);

    assert.equal(cockpit.totalClients,1);
    assert.equal(cockpit.items.length,0);
    assert.equal(cockpit.attentionCount,0);
  }
);

test(
  'resumen del cockpit separa riesgo proceso e información',
  ()=>{
    const cockpit=deriveCoachCockpit([
      {
        client:client('C1','Ana'),
        alerts:[
          alert(
            'critical',
            'Dolor elevado informado'
          ),
        ],
      },
      {
        client:client('C2','Bruno'),
        alerts:[
          alert(
            'warning',
            'Recuperación condicionada'
          ),
        ],
      },
      {
        client:client(
          'C3',
          'Carla',
          'planning',
          3
        ),
        alerts:[],
      },
      {
        client:client('C4','Diego'),
        alerts:[
          alert(
            'info',
            'Datos todavía limitados'
          ),
        ],
      },
    ]);

    assert.equal(cockpit.criticalCount,1);
    assert.equal(cockpit.warningCount,1);
    assert.equal(cockpit.processCount,1);
    assert.equal(cockpit.infoCount,1);
    assert.equal(cockpit.attentionCount,3);
  }
);

test(
  'Hoy Coach presenta la prioridad en español y permite abrir expediente',
  ()=>{
    const sourceClient=client('C1','Ana');

    const cockpit=deriveCoachCockpit([
      {
        client:sourceClient,
        alerts:[
          alert(
            'critical',
            'Dolor elevado informado',
            'El último registro requiere revisión.',
            'Revisar con el cliente antes de la próxima sesión.'
          ),
        ],
      },
    ]);

    const html=renderHoyRoute({
      role:'coach',
      clients:[sourceClient],
      appointments:[],
      proposals:[],
      upcoming:[],
      operations:{
        pending:0,
        conflicts:0,
        rejected:0,
      },
      coachCockpit:cockpit,
    });

    assert.match(
      html,
      /Atención de cartera/
    );

    assert.match(
      html,
      /Atención prioritaria/
    );

    assert.match(
      html,
      /Dolor elevado informado/
    );

    assert.match(
      html,
      /Abrir expediente/
    );

    assert.doesNotMatch(
      html,
      />critical<|>warning<|>process</i
    );
  }
);