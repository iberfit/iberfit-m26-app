import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COACH_SESSIONS_FIRST_PAGE,prioritizeCoachSessions,renderCoachSessionsProgressive,renderRc39Route} from '../src/m26/rc39/route-render.js';

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
  assert.match(html,/Revisar prescripción y vista del cliente/u,'Coach retains real prescription review');
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


test('SIGNATURE Coach prioritizes the nearest future dated session, keeps undated and historic accessible',()=>{
  const input=[
    {...item(1),startAt:'2026-10-12T15:00:00Z'},
    {...item(2),startAt:null},
    {...item(3),startAt:'2026-10-27T15:00:00Z'},
    {...item(4),startAt:'2026-10-21T15:00:00Z'},
    {...item(5),startAt:'2026-10-03T15:00:00Z'},
    {...item(6),startAt:'invalid date'},
  ];
  const before=input.slice();
  const sorted=prioritizeCoachSessions(input,new Date('2026-10-20T15:00:00Z'));
  assert.deepEqual(sorted.map(x=>x.id),['session-4','session-3','session-2','session-6','session-1','session-5']);
  assert.deepEqual(input,before,'date prioritization must be a pure display projection');
  assert.strictEqual(sorted[0],input[3],'canonical session object identity is untouched');
});


test('U48 Coach prioritizes recently published undated sessions without hiding appointments',()=>{
 const now=new Date('2026-10-20T15:00:00Z');
 const baseline={id:'future',startAt:'2026-10-21T15:00:00Z',session:{publishedAt:'2026-08-01T10:00:00Z'}};
 const old={id:'old',startAt:null,session:{publishedAt:'2026-09-01T10:00:00Z'}};
 const fresh={id:'fresh',startAt:null,session:{publishedAt:'2026-10-28T12:00:00Z'}};
 const past={id:'past',startAt:'2026-10-01T15:00:00Z'};
 const input=[old,past,fresh,baseline];
 assert.deepEqual(prioritizeCoachSessions(input,now).map(x=>x.id),['future','fresh','old','past']);
 assert.strictEqual(input[0],old,'Coach priority is visual only, never mutates domain state');
});
