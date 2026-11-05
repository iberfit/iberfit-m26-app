import test from 'node:test';
import assert from 'node:assert/strict';
import {projectHabitFocus} from '../src/m26/modules/route-render.js';
test('Life360 prioritizes 1–3 active habits without deleting legacy extras',()=>{
  const habits=[
    {id:'a',statusRaw:'activo'},
    {id:'b',statusRaw:'active'},
    {id:'c',statusRaw:'publicado'},
    {id:'d',statusRaw:'activo'},
    {id:'old',statusRaw:'archivado'},
  ];
  const focus=projectHabitFocus(habits);
  assert.deepEqual(focus.featured.map(v=>v.id),['a','b','c']);
  assert.deepEqual(focus.additional.map(v=>v.id),['d']);
  assert.deepEqual(focus.archived.map(v=>v.id),['old']);
  assert.equal(focus.activeCount,4);
  assert.equal(focus.totalCount,5);
  assert.equal(Object.isFrozen(focus.featured),true);
  assert.deepEqual(projectHabitFocus(null).featured,[]);
});
test('Life360 treats uncertain legacy statuses conservatively as visible',()=>{
  const focus=projectHabitFocus([{id:'unknown',statusRaw:''},{id:'cancel',status:'Cancelado'}],1);
  assert.deepEqual(focus.featured.map(v=>v.id),['unknown']);
  assert.deepEqual(focus.archived.map(v=>v.id),['cancel']);
});