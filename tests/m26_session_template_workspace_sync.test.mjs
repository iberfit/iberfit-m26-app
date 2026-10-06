import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_TEMPLATE_SCHEMA_VERSION,
  createSessionTemplateRepository,
  mergeSessionTemplateWorkspaces,
  normalizeSessionTemplateWorkspace,
} from '../src/m26/productivity/session-reuse.js';

function memoryStorage(initial={}){
  const data=new Map(Object.entries(initial));
  return {
    getItem:(key)=>data.has(key)?data.get(key):null,
    setItem:(key,value)=>data.set(key,String(value)),
    removeItem:(key)=>data.delete(key),
  };
}

function snapshot(title='Fuerza A'){
  return {
    title,
    durationMinutes:60,
    blocks:[{
      type:'exercise',
      exerciseId:'squat',
      name:'Sentadilla',
      sets:3,
      reps:'8',
      plannedLoad:'40 kg',
      restSeconds:90,
      tempo:'controlado',
      targetRpe:7,
      targetRir:3,
      prescriptionNotes:'',
      progression:'',
      alternativeId:null,
    }],
  };
}

function template({id,name='Fuerza A',updatedAt='2026-10-05T10:00:00.000Z',versions=[]}){
  return {id,name,latestVersion:versions.length,updatedAt,versions};
}

test('legacy local template workspace upgrades without losing templates',()=>{
  const ownerId='coach-1';
  const key=`iberfit-m26:session-templates:${ownerId}`;
  const legacy={
    schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,
    templates:[template({
      id:'template-a',
      versions:[{version:1,createdAt:'2026-10-05T10:00:00.000Z',snapshot:snapshot()}],
    })],
  };
  const storage=memoryStorage({[key]:JSON.stringify(legacy)});
  const repo=createSessionTemplateRepository({ownerId,storage});

  assert.equal(repo.workspace().remoteRevision,0);
  assert.equal(repo.list().length,1);
  assert.equal(repo.get('template-a').snapshot.title,'Fuerza A');
});

test('workspace merge preserves divergent offline versions for the same template name',()=>{
  const local={
    schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,
    remoteRevision:3,
    templates:[template({
      id:'local-id',
      updatedAt:'2026-10-05T11:00:00.000Z',
      versions:[
        {version:1,createdAt:'2026-10-05T09:00:00.000Z',snapshot:snapshot('Base')},
        {version:2,createdAt:'2026-10-05T11:00:00.000Z',snapshot:snapshot('Local')},
      ],
    })],
  };
  const remote={
    schemaVersion:SESSION_TEMPLATE_SCHEMA_VERSION,
    remoteRevision:4,
    templates:[template({
      id:'remote-id',
      updatedAt:'2026-10-05T12:00:00.000Z',
      versions:[
        {version:1,createdAt:'2026-10-05T09:00:00.000Z',snapshot:snapshot('Base')},
        {version:2,createdAt:'2026-10-05T12:00:00.000Z',snapshot:snapshot('Remota')},
      ],
    })],
  };

  const merged=mergeSessionTemplateWorkspaces(local,remote);
  assert.equal(merged.remoteRevision,4);
  assert.equal(merged.templates.length,1);
  assert.equal(merged.templates[0].id,'remote-id');
  assert.deepEqual(
    merged.templates[0].versions.map((item)=>item.snapshot.title),
    ['Base','Local','Remota'],
  );
  assert.deepEqual(
    merged.templates[0].versions.map((item)=>item.version),
    [1,2,3],
  );
});

test('repository can replace remote workspace while retaining canonical remote revision',()=>{
  const storage=memoryStorage();
  const repo=createSessionTemplateRepository({ownerId:'coach-2',storage});
  const remote=normalizeSessionTemplateWorkspace({
    templates:[template({
      id:'remote-template',
      name:'Tren inferior',
      updatedAt:'2026-10-05T13:00:00.000Z',
      versions:[{
        version:1,
        createdAt:'2026-10-05T13:00:00.000Z',
        snapshot:snapshot('Tren inferior'),
      }],
    })],
  });

  repo.replaceWorkspace(remote,{remoteRevision:7});
  assert.equal(repo.workspace().remoteRevision,7);
  assert.equal(repo.list()[0].name,'Tren inferior');
});

test('normalization bounds workspace and version history',()=>{
  const templates=Array.from({length:25},(_,i)=>template({
    id:`t-${i}`,
    name:`Plantilla ${i}`,
    updatedAt:new Date(Date.UTC(2026,9,5,10,0,i)).toISOString(),
    versions:Array.from({length:8},(_,v)=>({
      version:v+1,
      createdAt:new Date(Date.UTC(2026,9,5,9,v,i)).toISOString(),
      snapshot:snapshot(`P${i}-V${v}`),
    })),
  }));
  const normalized=normalizeSessionTemplateWorkspace({remoteRevision:2,templates});

  assert.equal(normalized.templates.length,20);
  assert.ok(normalized.templates.every((item)=>item.versions.length<=5));
  assert.equal(normalized.remoteRevision,2);
});
