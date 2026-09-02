import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  resolveActiveRole,
} from '../src/m26/rc39/multi-role.js';

import {
  areaAllowedForRole,
  navigationForRole,
} from '../src/m26/shell/navigation.js';

import {
  buildIberfitDecisionBrief,
} from '../src/m26/intelligence/decision-brief.js';

test(
  'multirrol conserva switch autorizado',
  ()=>{
    const roles=['coach','admin'];

    assert.equal(
      resolveActiveRole(
        roles,
        'admin'
      ),
      'admin'
    );

    assert.equal(
      resolveActiveRole(
        roles,
        'coach'
      ),
      'coach'
    );
  }
);

test(
  'bootstrap de producción prefiere Admin sin hardcodear correo',
  ()=>{
    const app=fs.readFileSync(
      'src/m26/app/application.js',
      'utf8'
    );

    assert.match(
      app,
      /authorizedRoles\.includes\('admin'\)\?'admin':primaryRole/u
    );

    assert.match(
      app,
      /roleChoiceConfirmed:true/u
    );

    assert.match(
      app,
      /M26_ROLE_SWITCH_FORBIDDEN/u
    );

    assert.doesNotMatch(
      app,
      /iberfit\.cl@gmail\.com/u
    );
  }
);

test(
  'Cliente descubre Retos y Ajustes sin rutas inválidas',
  ()=>{
    for(const role of ['admin','coach','client']){
      const nav=navigationForRole(role);

      for(const group of [
        'primary',
        'context',
        'tools',
        'mobile',
      ]){
        for(const item of nav[group]){
          assert.equal(
            areaAllowedForRole(
              item.key,
              role
            ),
            true,
            `${role}:${group}:${item.key}`
          );
        }
      }
    }

    const client=navigationForRole('client');

    assert.ok(
      client.context.some(
        (item)=>item.key==='retos'
      )
    );

    assert.ok(
      client.tools.some(
        (item)=>item.key==='ajustes'
      )
    );
  }
);

test(
  'Admin usa Configuración',
  ()=>{
    const shell=fs.readFileSync(
      'src/m26/shell/shell-render.js',
      'utf8'
    );

    assert.match(
      shell,
      /data-m26-area="admin-configuracion">Configuración/u
    );
  }
);

test(
  'Copiloto IBERFIT usa evidencia y no toma decisiones automáticas',
  ()=>{
    const brief=buildIberfitDecisionBrief({
      summary:{
        adherence:.75,
        completedSessions:3,
        plannedSessions:4,
        averageRpe:6.5,
        checkins:2,
        lastExecutionAt:'2026-09-01T10:00:00Z',
        dataQuality:'alta',
        unconfirmedExecutions:0,
        wearable:{
          daysWithData:3,
        },
      },
      alerts:[
        {
          severity:'warning',
          title:'Adherencia por debajo de lo previsto',
          action:'Revisar barreras de agenda antes de ajustar la semana.',
        },
      ],
    });

    assert.equal(
      brief.confidence,
      'alta'
    );

    assert.equal(
      brief.nextStep,
      'Revisar barreras de agenda antes de ajustar la semana.'
    );

    assert.ok(
      brief.signals.length>=5
    );

    assert.match(
      brief.safetyNote,
      /no diagnostica/u
    );

    assert.match(
      brief.safetyNote,
      /no modifica cargas/u
    );

    assert.match(
      brief.safetyNote,
      /no publica sesiones/u
    );
  }
);

test(
  'Copiloto está conectado a Inteligencia',
  ()=>{
    const vm=fs.readFileSync(
      'src/m26/modules/route-view-model.js',
      'utf8'
    );

    const render=fs.readFileSync(
      'src/m26/modules/route-render.js',
      'utf8'
    );

    assert.match(
      vm,
      /buildIberfitDecisionBrief/u
    );

    assert.match(
      render,
      /data-m26-intelligence-copilot/u
    );

    assert.match(
      render,
      /injectIntelligenceDecisionBrief/u
    );
  }
);