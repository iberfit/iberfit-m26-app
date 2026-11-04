import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildClientPlanningItems} from '../src/m26/rc39/session-policy.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';
import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const source={id:SESSION,clientId:CLIENT,status:'disponible',title:'Fuerza martes',revision:4,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  visibleToClient:true,clientVisibilityLevel:'full',
  blocks:[{id:'b',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:3}]};
const appointment=(id,at,override={})=>({
  id,sessionId:SESSION,clientId:CLIENT,status:'confirmada',visibleToClient:true,
  startAt:at,endAt:new Date(Date.parse(at)+3_600_000).toISOString(),
  modality:'guiada_en_app',...override
});
const a1=appointment('tuesday-a','2026-10-20T15:00:00Z');
const a2=appointment('tuesday-b','2026-10-27T15:00:00Z');
const view=(items)=>({kind:'planificacion',role:'client',rc39:{planningItems:items},
  clientAppointments:[],serviceActive:true,sessionPreviewAssets:{catalog:[]}});

test('U35 Client calendar shows two dates with one canonical prescription, never two legacy starts',()=>{
  const before=JSON.stringify([source,a1,a2]);
  const items=buildClientPlanningItems({sessions:[source],appointments:[a2,a1]});
  assert.deepEqual(items.map(item=>item.appointmentId),['tuesday-a','tuesday-b']);
  assert.deepEqual(items.map(item=>item.id),[SESSION,SESSION]);
  assert.equal(items[0].session,items[1].session);
  assert.equal(items.every(item=>item.recurringAwaitingActivation&&item.canClientStart===false),true);
  assert.equal(JSON.stringify([source,a1,a2]),before);
  const html=renderRc39Route(view(items));
  assert.match(html,/data-training-date="2026-10-20"/);
  assert.match(html,/data-training-date="2026-10-27"/);
  assert.equal((html.match(/data-rc39-session="/g)||[]).length,2);
  assert.equal((html.match(/data-workflow-action="start-published-session"/g)||[]).length,0);
  assert.match(html,/1 sesión publicada/);
  assert.match(html,/2 fechas programadas/);
  assert.match(html,/El inicio independiente por fecha/);
});

test('U35 private, cancelled, cross-client and duplicate appointment rows never leak to calendar',()=>{
  const items=buildClientPlanningItems({sessions:[source],appointments:[
    a1,a2,{...a1},
    appointment('cancelled','2026-11-03T15:00:00Z',{status:'cancelada'}),
    appointment('proposal','2026-11-10T15:00:00Z',{status:'propuesta'}),
    appointment('hidden','2026-11-17T15:00:00Z',{visibleToClient:false}),
    appointment('other-client','2026-11-24T15:00:00Z',{clientId:OTHER}),
    appointment('other-session','2026-12-01T15:00:00Z',{sessionId:OTHER})
  ]});
  assert.deepEqual(items.map(x=>x.appointmentId),['tuesday-a','tuesday-b']);
  const html=renderRc39Route(view(items));
  assert.doesNotMatch(html,/data-training-date="2026-11-03"/);
  assert.doesNotMatch(html,/data-training-date="2026-11-10"/);
});

test('U35 existing single guided appointment keeps legitimate legacy start, unscheduled plans remain',()=>{
  const one=buildClientPlanningItems({sessions:[source],appointments:[a1]});
  assert.equal(one.length,1);
  assert.equal(one[0].canClientStart,true);
  assert.equal(one[0].recurringAwaitingActivation,false);
  const unscheduled=buildClientPlanningItems({sessions:[source],appointments:[]});
  assert.equal(unscheduled.length,1);
  assert.equal(unscheduled[0].appointmentId,null);
  assert.equal(unscheduled[0].canClientStart,true);
  assert.match(renderRc39Route(view(unscheduled)),/Sesiones sin fecha asignada/);
});

test('U35 date navigation is keyboard accessible, responsive and not a phantom button',()=>{
  const html=renderRc39Route(view(buildClientPlanningItems({sessions:[source],appointments:[a1,a2]})));
  assert.match(html,/aria-label="Fechas de entrenamiento programadas"/);
  assert.match(html,/data-rc39-date-target="2026-10-20"/);
  assert.equal((html.match(/data-rc39-primary-day="true"/g)||[]).length,1);
  const css=readFileSync(new URL('../src/m26/rc39/rc39.css',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/rc39/controller.js',import.meta.url),'utf8');
  assert.match(css,/\.m26-rc39-date-links\{[^}]*overflow-x:auto/);
  assert.match(css,/\.m26-rc39-date-links>a:focus-visible/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(controller,/data-rc39-date-target/);
  assert.match(controller,/day\.querySelector\?\.\(':scope > summary'\)\?\.focus/);
  assert.match(controller,/link\.setAttribute\('aria-current'/);
});

test('U35 Sessions area uses the same date-specific list and blocks misleading shared-source starts',()=>{
  const items=buildClientPlanningItems({sessions:[source],appointments:[a1,a2]});
  const vm={kind:'sesion',role:'client',serviceActive:true,
    rc39:{planningItems:items,sessionProjections:[items[0]]},
    sessionPreviewAssets:{catalog:[]}};
  const markup=renderRc39Route(vm);
  assert.match(markup,/data-m27-session-surface="sessions"/);
  assert.match(markup,/aria-label="Fechas de entrenamiento programadas"/);
  assert.equal((markup.match(/data-rc39-session="/g)||[]).length,2);
  assert.equal((markup.match(/data-workflow-action="start-published-session"/g)||[]).length,0);
  assert.match(markup,/data-training-date="2026-10-27"/);
});

test('U35 date navigation opens target, restores keyboard focus and rejects invalid date keys',async()=>{
  const {createRc39Controller}=await import('../src/m26/rc39/controller.js');
  let focused=0,scrolled=0,prevented=0;
  const summary={focus:()=>{focused++}};
  const day={open:false,querySelector:()=>summary,scrollIntoView:()=>{scrolled++}};
  const handlers=new Map();
  const root={
    addEventListener:(name,handler)=>handlers.set(name,[...(handlers.get(name)||[]),handler]),
    removeEventListener:()=>{},
    querySelector:(selector)=>selector==='#m26-plan-day-2026-10-27'?day:null,
  };
  const store={getState:()=>({identity:{role:'client'},collections:{appointments:[]}})};
  const controller=createRc39Controller({root,store});
  controller.mount();
  const key={current:'2026-10-27'};
  const target={closest:(selector)=>selector==='[data-rc39-date-target]'
    ?{getAttribute:()=>key.current}:null};
  const event={target,preventDefault:()=>{prevented++}};
  for(const handler of handlers.get('click')||[])await handler(event);
  assert.equal(day.open,true);
  assert.equal(focused,1);
  assert.equal(scrolled,1);
  assert.equal(prevented,1);
  key.current='../2026-10-27';
  for(const handler of handlers.get('click')||[])await handler(event);
  assert.equal(prevented,1,'invalid selector data cannot activate arbitrary targets');
  controller.destroy();
});

test('U35 Sessions keeps guided exercise previews visible across dated and undated groups',()=>{
  const dates=buildClientPlanningItems({sessions:[source],appointments:[a1,a2]});
  const undated=buildClientPlanningItems({sessions:[{
    ...source,id:'10000000-0000-4000-8000-000000000104',title:'Sesión guiada sin fecha'
  }],appointments:[]});
  const entries=[...dates,...undated];
  const html=renderRc39Route({kind:'sesion',role:'client',serviceActive:true,
    rc39:{planningItems:entries,sessionProjections:[dates[0]]},
    sessionPreviewAssets:{catalog:[]}});
  const groups=[...html.matchAll(/<details class="m26-rc39-day-group"[^>]*>/g)].map(x=>x[0]);
  assert.equal(groups.length,3);
  assert.equal(groups.every(x=>/\sopen(?:\s|>)/.test(x)),true);
  assert.match(html,/data-training-date="unscheduled"[^>]*\sopen/);
  assert.match(html,/data-rc39-session="10000000-0000-4000-8000-000000000104"/);
  const planning=renderRc39Route(view(entries));
  const expanded=[...planning.matchAll(/<details class="m26-rc39-day-group"[^>]*\sopen(?:\s|>)/g)];
  assert.equal(expanded.length,1,'Planning retains only one expanded day');
});

test('U35 Agenda and session projections never resurrect legacy start for shared dates',()=>{
  const state={identity:{role:'client',clientId:CLIENT},
    selectedClientId:null,
    collections:{sessions:[source],appointments:[a1,a2]}};
  const vm=augmentRc39ViewModel({kind:'agenda',role:'client'},
    {identity:{role:'client',clientId:CLIENT}},state,new Date('2026-10-19T10:00:00Z'));
  assert.equal(vm.rc39.planningItems.length,2);
  assert.equal(vm.rc39.sessionProjections.length,1);
  assert.equal(vm.rc39.sessionProjections[0].canClientStart,false);
  assert.equal(vm.rc39.sessionProjections[0].recurringAwaitingActivation,true);
  const html=renderRc39Route({...vm,kind:'agenda',role:'client',serviceActive:true});
  assert.equal((html.match(/data-appointment-card="tuesday-/g)||[]).length,2);
  assert.equal((html.match(/data-workflow-action="start-published-session"/g)||[]).length,0);
  assert.match(html,/El inicio independiente por fecha/);
});

// B17: date selection remains single-open in Planning but all-open in Sessions.
// Arrow-key browsing only moves focus; opening a workout always needs activation.
test('B17 date navigation synchronizes active day, focus and layout mode',async()=>{
 const {createRc39Controller}=await import('../src/m26/rc39/controller.js');
 const handlers=new Map(),date1='2026-10-20',date2='2026-10-27';
 let focused='',prevented=0;
 const strip={querySelectorAll:()=>links};
 const nav={querySelectorAll:()=>links};
 const groups={
   mode:'single',
   getAttribute(name){return name==='data-rc39-date-mode'?this.mode:null;},
   querySelectorAll:()=>days,
 };
 function day(key,open){
   const attrs=new Map([['data-rc39-primary-day',open?'true':'false']]);
   return {key,open,attrs,
     closest:sel=>sel==='.m26-rc39-date-groups'?groups:null,
     setAttribute:(name,val)=>attrs.set(name,val),
     removeAttribute:name=>attrs.delete(name),
     querySelector:()=>({focus:()=>{focused='summary-'+key;}}),
     scrollIntoView:()=>{},
   };
 }
 const days=[day(date1,true),day(date2,false)];
 function link(key){
   const attrs=new Map([['data-rc39-date-target',key],['data-rc39-today','false']]);
   return {key,attrs,
     getAttribute:name=>attrs.get(name)||null,
     setAttribute:(name,val)=>attrs.set(name,val),
     removeAttribute:name=>attrs.delete(name),
     closest:sel=>sel==='[data-rc39-date-target]'?links.find(l=>l.key===key):
       sel==='.m26-rc39-date-navigation'?nav:
       sel==='.m26-rc39-date-links'?strip:null,
     focus:()=>{focused='link-'+key;},scrollIntoView:()=>{},
   };
 }
 const links=[link(date1),link(date2)];
 links[0].attrs.set('aria-current','location');
 const root={
   addEventListener:(type,handler)=>handlers.set(type,handler),
   removeEventListener:(type)=>handlers.delete(type),
   querySelector:(sel)=>sel==='#m26-plan-day-'+date1?days[0]:
     sel==='#m26-plan-day-'+date2?days[1]:null,
 };
 const controller=createRc39Controller({
   root,store:{getState:()=>({identity:{role:'client'},collections:{appointments:[]}})},
 });
 controller.mount();
 const keydown=handlers.get('keydown'),click=handlers.get('click');
 keydown({key:'ArrowRight',target:links[0],preventDefault:()=>{prevented++;}});
 assert.equal(focused,'link-'+date2);
 assert.equal(days[1].open,false,'arrow navigation does not open a session');
 await click({target:links[1],preventDefault:()=>{prevented++;}});
 assert.equal(focused,'summary-'+date2);
 assert.equal(days[0].open,false);
 assert.equal(days[1].open,true);
 assert.equal(days[0].attrs.has('data-rc39-primary-day'),false);
 assert.equal(days[1].attrs.get('data-rc39-primary-day'),'true');
 assert.equal(links[1].attrs.get('aria-current'),'location');
 assert.equal(links[0].attrs.has('aria-current'),false);
 groups.mode='all';days[0].open=true;
 await click({target:links[1],preventDefault:()=>{prevented++;}});
 assert.equal(days[0].open,true,'Sessions must preserve independently open days');
 assert.equal(days[1].open,true);
 keydown({key:'Home',target:links[1],preventDefault:()=>{prevented++;}});
 assert.equal(focused,'link-'+date1);
 keydown({key:'End',target:links[0],preventDefault:()=>{prevented++;}});
 assert.equal(focused,'link-'+date2);
 const original=prevented;
 keydown({key:'ArrowLeft',altKey:true,target:links[1],preventDefault:()=>{prevented++;}});
 assert.equal(prevented,original,'modified shortcuts remain untouched');
 controller.destroy();
 assert.equal(handlers.has('keydown'),false);
});
