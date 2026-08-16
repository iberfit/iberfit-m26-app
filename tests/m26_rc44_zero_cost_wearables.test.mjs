import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createMemoryKeyValueStore,
} from '../src/m26/platform/key-value-store.js';

import {
  createWearableRemoteSync,
} from '../src/m26/wearables/remote-sync.js';

const read=(path)=>fs.readFileSync(path,'utf8');

const migration=read(
  'docs/evidence/rc59-c2d/retired-august-migrations/20260804065000_rc44_zero_cost_wearables.sql',
);

const rollback=read(
  'backend/RC44_ZERO_COST_WEARABLES_ROLLBACK.sql',
);

const transport=read(
  'src/m26/supabase-transport.js',
);

const application=read(
  'src/m26/app/application.js',
);

const controller=read(
  'src/m26/wearables/controller.js',
);

const remoteSync=read(
  'src/m26/wearables/remote-sync.js',
);

const css=read(
  'src/m26/rc44/rc44.css',
);

const index=read(
  'public/m26/index.html',
);

const worker=read(
  'public/m26/sw.js',
);

const pkg=JSON.parse(
  read('package.json'),
);

test('RC44 es aditiva y protege producción',()=>{
  assert.match(migration,/^-- IBERFIT M26 RC44/u);
  assert.match(migration,/\nbegin;\n/u);
  assert.match(migration,/\ncommit;\s*$/u);

  assert.doesNotMatch(
    migration,
    /\bdb reset\b/iu,
  );

  assert.doesNotMatch(
    migration,
    /\bdrop table\b/iu,
  );

  assert.doesNotMatch(
    migration,
    /pjhmrhejsoofmouedavw/u,
  );
});

test('RC44 crea conexiones, resúmenes y consentimientos con RLS',()=>{
  for(const table of [
    'm26_wearable_connections_v44',
    'm26_wearable_daily_summaries_v44',
    'm26_wearable_consents_v44',
  ]){
    assert.ok(migration.includes(table));
  }

  assert.equal(
    migration.match(
      /enable row level security/gu,
    )?.length,
    3,
  );

  assert.match(
    migration,
    /client_id = public\.iberfit_client_id\(\)/u,
  );

  assert.match(
    migration,
    /public\.is_assigned_coach\(client_id\)/u,
  );
});

test('RC44 no admite secretos ni datos personales en payload wearable',()=>{
  for(const key of [
    'access_token',
    'refresh_token',
    'client_secret',
    'service_role',
    'email',
    'phone',
    'nombre',
  ]){
    assert.ok(migration.includes(`'${key}'`));
  }

  assert.match(
    migration,
    /m26_json_has_forbidden_key_v44/u,
  );
});

test('RC44 publica cinco RPC operativas y una RPC de salud',()=>{
  for(const rpc of [
    'm26_wearable_health_v44',
    'm26_wearable_bootstrap_v44',
    'm26_wearable_import_v44',
    'm26_wearable_connection_upsert_v44',
    'm26_wearable_revoke_v44',
    'm26_wearable_delete_all_v44',
  ]){
    assert.ok(migration.includes(rpc));
    assert.ok(transport.includes(rpc));
  }
});

test('RC44 hidrata colecciones remotas sin ampliar el scope',()=>{
  assert.ok(
    application.includes(
      'transport.wearableBootstrap(currentToken())',
    ),
  );

  assert.ok(
    application.includes(
      'wearableConnections:wearableV44.connections||[]',
    ),
  );

  assert.ok(
    application.includes(
      'wearableDailySummaries:wearableV44.dailySummaries||[]',
    ),
  );
});

test('RC44 guarda offline y sincroniza en lotes',async()=>{
  let online=false;
  let imported=0;
  let refreshed=0;

  const queueStore=createMemoryKeyValueStore();

  const transportFake={
    async importWearableSummaries(_token,payload){
      imported+=payload.records.length;

      return {
        ok:true,
        accepted:payload.records.length,
        stale:0,
        rejected:0,
      };
    },

    async upsertWearableConnection(){
      return {
        ok:true,
        saved:true,
      };
    },

    async revokeWearableConnection(){
      return {
        ok:true,
        revoked:true,
      };
    },

    async deleteWearableData(){
      return {
        ok:true,
        deleted:true,
      };
    },
  };

  const sync=createWearableRemoteSync({
    transport:transportFake,
    getToken:async()=>'qa-token',
    refreshState:async()=>{refreshed+=1;},
    isOnline:()=>online,
    queueStore,
  });

  const record={
    id:'normalized_file:11111111-1111-1111-1111-111111111111:2026-08-04',
    clientId:'11111111-1111-1111-1111-111111111111',
    provider:'normalized_file',
    date:'2026-08-04',
    metrics:{
      steps:8000,
      activeMinutes:45,
      sleepMinutes:450,
      restingHeartRate:58,
      hrvMs:null,
      activeEnergyKcal:500,
      workoutMinutes:30,
    },
    quality:'media',
    sourceUpdatedAt:'2026-08-04T12:00:00Z',
    sourceRecordCount:1,
  };

  const queued=await sync.stage({
    clientId:record.clientId,
    provider:record.provider,
    records:[record],
  });

  assert.equal(queued.queued,true);
  assert.equal(await sync.pendingCount(),1);

  online=true;

  const flushed=await sync.flush();

  assert.equal(flushed.synced,true);
  assert.equal(imported,1);
  assert.equal(await sync.pendingCount(),0);
  assert.equal(refreshed,1);
});

test('RC44 ofrece confirmación, reintento, borrado y puente Android condicional',()=>{
  assert.match(
    controller,
    /data-wearable-action="confirm-import"/u,
  );

  assert.match(
    controller,
    /connect-health-connect/u,
  );

  assert.match(
    controller,
    /bridge\.support\.healthConnect\.available/u,
  );

  assert.match(
    controller,
    /sync-pending/u,
  );

  assert.match(
    controller,
    /delete-all/u,
  );

  assert.match(
    remoteSync,
    /chunks\(groupEntries,200\)/u,
  );
});

test('RC44 aplica capa premium, responsive y accesible',()=>{
  assert.ok(
    index.includes(
      '/src/m26/rc44/rc44.css',
    ),
  );

  assert.ok(
    worker.includes(
      '/src/m26/rc44/rc44.css',
    ),
  );

  assert.match(
    css,
    /\.m26-wearable-source/u,
  );

  assert.match(
    css,
    /prefers-reduced-motion/u,
  );

  assert.match(
    css,
    /@media \(max-width: 720px\)/u,
  );

  assert.match(
    css,
    /min-height: 48px/u,
  );
});

test('RC44 dispone de rollback manual guardado',()=>{
  assert.match(
    rollback,
    /M26_RC44_ROLLBACK_NOT_AUTHORIZED/u,
  );

  assert.match(
    rollback,
    /iberfit\.allow_rc44_rollback/u,
  );

  assert.match(
    rollback,
    /\ncommit;\s*$/u,
  );
});

test('RC44 registra gates y build reproducible',()=>{
  assert.equal(
    pkg.scripts['test:m26:rc44'],
    'node --test tests/m26_rc44_zero_cost_wearables.test.mjs',
  );

  assert.ok(
    pkg.scripts['validate:rc44:local'].includes(
      'validate:rc431:local',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc44:canary'].includes(
      'patch_rc44_canary_runtime_source.mjs',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc44:canary'].includes(
      'generate_rc44_runtime_config.mjs',
    ),
  );

  assert.ok(
    pkg.scripts['build:rc44:canary'].includes(
      'verify_rc44_canary_candidate.mjs',
    ),
  );
});
