import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COACH_SESSIONS_FIRST_PAGE,renderCoachSessionsProgressive,renderRc39Route} from '../src/m26/rc39/route-render.js';

function item(index){
  const id='session-'+index;
  return {id,title:'Sesión Coach '+index,visible:true,canClientExecute:false,
    modality:'presencial',ownership:'coach_led',visibility:'summary_only',
    session:{id,status:'published',durationMinutes:50,blocks:[{id:'ex-1',type:'exercise',exerciseId:'press',name:'Press',sets:3,reps:'10'}]}};
}
const assets={catalog:[],mediaMap:null,serviceActive:true};

test('SIGNATURE Coach keeps all functions available while showing only six cards initially',()=>{
  const sessions=Array.from({length:17},(_,i)=>item(i+1));
  assert.equal(COACH_SESSIONS_FIRST_PAGE,6);
  const html=renderCoachSessionsProgressive(sessions,'presencial',assets);
  assert.equal((html.match(/data-rc39-session="/gu)||[]).length,17);
  assert.equal((html.match(/<details class="m26-rc39-coach-more"/gu)||[]).length,1);
  assert.match(html,/Ver otras 11 sesiones/u);
  assert.ok(html.indexOf('Sesión Coach 6')<html.indexOf('data-coach-sessions-more'));
  assert.ok(html.indexOf('Sesión Coach 7')>html.indexOf('data-coach-sessions-more'));
  assert.match(html,/Esta sesión la dirige tu Coach/u,'empty prescriptions retain their honest supervised summary');
  assert.match(html,/data-rc39-session="session-17"/u,'last session remains accessible');
});

test('SIGNATURE Coach uses ordinary cards without nested disclosure if list is short',()=>{
  const html=renderCoachSessionsProgressive([item(1),item(2)],'presencial',assets);
  assert.match(html,/data-rc39-session="session-1"/u);
  assert.doesNotMatch(html,/data-coach-sessions-more/u);
});

test('SIGNATURE Client and Admin retain their own routes rather than inheriting Coach disclosure',()=>{
  const sessions=Array.from({length:9},(_,i)=>item(i+1));
  for(const role of ['client','admin']){
    const html=renderRc39Route({kind:'sesion',role,serviceActive:true,
      rc39:{role,sessionProjections:sessions},sessionPreviewAssets:{catalog:[]},
      selectedClient:{modality:'hibrido'}});
    assert.equal((html.match(/data-rc39-session="/gu)||[]).length,9);
    assert.doesNotMatch(html,/data-coach-sessions-more/u);
  }
});

test('SIGNATURE disclosure is keyboard/touch accessible with visible focus and no hidden cards',()=>{
  const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-rc39-coach-more-toggle\{min-height:62px/u);
  assert.match(css,/\.m26-rc39-coach-more-toggle:focus-visible/u);
  assert.match(css,/@media\(max-width:690px\)/u);
  assert.match(css,/@media\(forced-colors:active\)/u);
  const ui=readFileSync(new URL('../src/m26/rc39/route-render.js',import.meta.url),'utf8');
  assert.match(ui,/<summary class="m26-rc39-coach-more-toggle">/u);
  assert.doesNotMatch(ui,/COACH_SESSIONS_FIRST_PAGE[^\n]*\.filter\(/u);
});
