import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  assertProductionSnapshot,
  stateFromBootstrap,
} from '../src/m26/production-state.js';

function syntheticSnapshot(overrides={}){
  return {
    environment:'SYNTHETIC_ONLY',
    canary:{
      active:true,
      scope:'allowlist',
      version:'M26-RC36-V12.3',
    },
    user:{
      id:'U-ADMIN',
      role:'admin',
    },
    data:{
      clients:[{
        id:'CLI-DEMO-001',
        name:'Cliente sintético QA',
      }],
    },
    ...overrides,
  };
}

test(
  'canary allowlist SYNTHETIC_ONLY acepta datos QA sintéticos',
  ()=>{
    const snapshot=syntheticSnapshot();

    assert.equal(
      assertProductionSnapshot(snapshot),
      snapshot,
    );

    const state=stateFromBootstrap(snapshot);

    assert.equal(state.identity.role,'admin');
    assert.equal(
      state.collections.clients.length,
      1,
    );
  },
);

test(
  'canary allowlist QA acepta datos sintéticos sin abrir producción',
  ()=>{
    const snapshot=syntheticSnapshot({
      environment:'QA',
    });

    assert.equal(
      assertProductionSnapshot(snapshot),
      snapshot,
    );

    const state=stateFromBootstrap(snapshot);
    assert.equal(state.identity.role,'admin');
    assert.equal(state.collections.clients.length,1);
  },
);

test(
  'QA normalizado como objeto también autoriza solo el canary allowlist',
  ()=>{
    const snapshot=syntheticSnapshot({
      environment:{
        mode:'QA',
      },
    });

    assert.doesNotThrow(
      ()=>assertProductionSnapshot(snapshot),
    );
  },
);

test(
  'QA sin canary activo o sin allowlist sigue rechazando marcadores sintéticos',
  ()=>{
    for(const canary of [
      {active:false,scope:'allowlist'},
      {active:true,scope:'public'},
    ]){
      assert.throws(
        ()=>assertProductionSnapshot(
          syntheticSnapshot({
            environment:'QA',
            canary,
          }),
        ),
        /M26_SYNTHETIC_DATA_REJECTED/,
      );
    }
  },
);

test(
  'entorno sintético normalizado como objeto también queda autorizado',
  ()=>{
    const snapshot=syntheticSnapshot({
      environment:{
        mode:'SYNTHETIC_ONLY',
      },
    });

    assert.doesNotThrow(
      ()=>assertProductionSnapshot(snapshot),
    );
  },
);

test(
  'producción continúa rechazando cualquier marcador sintético',
  ()=>{
    assert.throws(
      ()=>assertProductionSnapshot(
        syntheticSnapshot({
          environment:'PRODUCTION',
        }),
      ),
      /M26_SYNTHETIC_DATA_REJECTED/,
    );
  },
);

test(
  'canary sin allowlist continúa rechazando datos sintéticos',
  ()=>{
    assert.throws(
      ()=>assertProductionSnapshot(
        syntheticSnapshot({
          canary:{
            active:true,
            scope:'public',
          },
        }),
      ),
      /M26_SYNTHETIC_DATA_REJECTED/,
    );
  },
);

test(
  'canary inactivo continúa rechazando datos sintéticos',
  ()=>{
    assert.throws(
      ()=>assertProductionSnapshot(
        syntheticSnapshot({
          canary:{
            active:false,
            scope:'allowlist',
          },
        }),
      ),
      /M26_SYNTHETIC_DATA_REJECTED/,
    );
  },
);

test(
  'aplicación normaliza environment textual antes de hidratar',
  ()=>{
    const source=fs.readFileSync(
      'src/m26/app/application.js',
      'utf8',
    );

    assert.equal(
      source.includes(
        "const normalizedEnvironment=typeof rawEnvironment==='string'?{mode:rawEnvironment}",
      ),
      true,
    );

    assert.equal(
      source.includes(
        'environment:{...normalizedEnvironment,commandRegistry:installed',
      ),
      true,
    );
  },
);
