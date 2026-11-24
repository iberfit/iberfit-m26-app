import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';

const fixture=[
 {id:'other',name_es:'Remo con banda',aliases:['sentadilla'],equipment:'banda',pattern:'traccion',primary_muscles:['dorsal']},
 {id:'prefix',name_es:'Sentadilla con barra',equipment:'barra',pattern:'sentadilla',name_translations:{en:'Barbell squat'}},
 {id:'exact',name_es:'Sentadilla',equipment:'peso corporal',pattern:'sentadilla',name_translations:{en:'Squat',fr:'Flexion des jambes'}},
 {id:'extra',name_es:'Elevación lateral',equipment:'mancuerna',primary_muscles:['deltoides'],tags:['hombro']}
];
const ids=rows=>rows.map(x=>x.id);
test('builder ranks exact then prefix names without losing alias matches or changing default order',()=>{
 const catalog=createExerciseCatalog(fixture);
 assert.deepEqual(ids(catalog.search('sentadilla')),['other','prefix','exact']);
 assert.deepEqual(ids(catalog.search('sentadilla',{}, {prioritizeNames:true})),['exact','prefix','other']);
 assert.deepEqual(ids(catalog.search('sentadilla',{equipment:['barra','banda']},{prioritizeNames:true})),['prefix','other']);
 assert.deepEqual(ids(catalog.search('SQUAT',{}, {prioritizeNames:true})),['exact','prefix']);
 assert.deepEqual(ids(catalog.search('flexion des jambes',{}, {prioritizeNames:true})),['exact']);
 assert.deepEqual(ids(catalog.search('elevacion')),['extra']);
 assert.deepEqual(ids(catalog.search('deltoides')),['extra']);
 assert.deepEqual(ids(catalog.search('hombro')),['extra']);
 assert.deepEqual(ids(catalog.search('',{equipment:'banda'})),['other']);
 assert.deepEqual(ids(catalog.search('')),['other','prefix','exact','extra']);
 const results=catalog.search('');results.pop();
 assert.equal(catalog.search('').length,4);
});
test('catalog replacement never reuses stale public exercise search text',()=>{
 const before=createExerciseCatalog(fixture);
 assert.equal(before.search('remo').length,1);
 const after=createExerciseCatalog([{...fixture[0],name_es:'Jalón con banda',aliases:[]}]);
 assert.equal(after.search('remo').length,0);
 assert.equal(after.search('jalon').length,1);
});
