import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRc62AgendaCalendarController,
  buildRc62AgendaEvents,
  fullCalendarCoachOptions,
} from '../src/m26/agenda/fullcalendar-agenda.js';

const tick=()=>new Promise((resolve)=>setImmediate(resolve));

function appointment(id,start='2026-10-16T10:00:00-03:00'){
  return {
    id,title:'Sesión presencial',startAt:start,
    endAt:new Date(new Date(start).getTime()+60*60*1000).toISOString(),status:'confirmed',modality:'presencial',
  };
}

function calendarHarness({compact=false}={}){
  const host={dataset:{},isConnected:true};
  let compactMatches=compact;
  let onCompactChange=null;
  let lastOptions=null;
  const calls={construct:0,render:0,remove:0,add:0,destroy:0};
  const scheduled=[];
  let mutation;
  let records=[appointment('a')];
  const viewport={
    matches:true,addEventListener(){},removeEventListener(){},
  };
  const compactViewport={
    get matches(){return compactMatches;},
    addEventListener(name,fn){if(name==='change')onCompactChange=fn;},
    removeEventListener(name,fn){if(onCompactChange===fn)onCompactChange=null;},
  };
  class FakeCalendar{
    constructor(host,options){calls.construct+=1;lastOptions=options;}
    render(){calls.render+=1;}
    removeAllEvents(){calls.remove+=1;}
    addEventSource(){calls.add+=1;}
    destroy(){calls.destroy+=1;}
  }
  class FakeObserver{
    constructor(callback){mutation=callback;}
    observe(){}
    disconnect(){}
  }
  const scope={
    FullCalendar:{Calendar:FakeCalendar},
    MutationObserver:FakeObserver,
    matchMedia:(query)=>query==='(max-width: 1099px)'?compactViewport:viewport,
    requestAnimationFrame(callback){scheduled.push(callback);},
  };
  const root={
    querySelector(selector){
      return selector==='[data-rc62-agenda-calendar]'?host:null;
    },
  };
  const store={
    getState(){
      return {
        identity:{role:'coach'},
        collections:{appointments:records},
      };
    },
  };
  const controller=createRc62AgendaCalendarController({root,store,scope});
  async function flush(){
    for(const callback of scheduled.splice(0))callback();
    await tick();
  }
  return {
    controller,calls,flush,
    getMutation:()=>mutation,
    getOptions:()=>lastOptions,
    setCompact(value){compactMatches=value;onCompactChange?.();},
    setAppointments(value){records=value;},
  };
}

test('M45 agenda ignores its own FullCalendar DOM mutations when events are unchanged',async()=>{
  const h=calendarHarness();
  h.controller.mount();
  await h.flush();
  assert.equal(h.calls.construct,1);
  assert.equal(h.calls.render,1);

  for(let n=0;n<4;n++){
    h.getMutation()();
    await h.flush();
  }
  assert.equal(h.calls.construct,1);
  assert.equal(h.calls.remove,0,'same events must not be removed repeatedly');
  assert.equal(h.calls.add,0,'same events must not be added repeatedly');

  h.setAppointments([appointment('a'),appointment('b','2026-10-16T12:00:00-03:00')]);
  h.getMutation()();
  await h.flush();
  assert.equal(h.calls.remove,1);
  assert.equal(h.calls.add,1);

  h.getMutation()();
  await h.flush();
  assert.equal(h.calls.remove,1,'calendar update must settle after one notification');
  assert.equal(h.calls.add,1);
  h.controller.destroy();
  assert.equal(h.calls.destroy,1);
});

test('M45 agenda coalesces several observer mutations into one refresh',async()=>{
  const h=calendarHarness();
  h.controller.mount();
  for(let n=0;n<10;n++)h.getMutation()();
  await h.flush();
  assert.equal(h.calls.construct,1);
  assert.equal(h.calls.render,1);
  h.controller.destroy();
});

test('M45 agenda queued frame cannot recreate the calendar after destroy',async()=>{
  const h=calendarHarness();
  h.controller.mount();
  h.controller.destroy();
  await h.flush();
  assert.equal(h.calls.construct,0);
  assert.equal(h.calls.render,0);
});

test('M45 agenda refuses invalid or reversed appointment times',()=>{
  const events=buildRc62AgendaEvents([
    appointment('valid'),
    {id:'invalid',startAt:'invalid',endAt:'2026-10-16T11:00:00-03:00'},
    {id:'reverse',startAt:'2026-10-16T12:00:00-03:00',endAt:'2026-10-16T11:00:00-03:00'},
  ]);
  assert.deepEqual(events.map(({id})=>id),['valid']);
});


test('M45 agenda uses day view on tablets without degrading the wide Coach week view',async()=>{
  assert.equal(fullCalendarCoachOptions({events:[]}).initialView,'timeGridWeek');
  assert.equal(fullCalendarCoachOptions({events:[],compact:true}).initialView,'timeGridDay');
  const h=calendarHarness({compact:true});
  h.controller.mount();
  await h.flush();
  assert.equal(h.getOptions().initialView,'timeGridDay');
  assert.equal(h.getOptions().editable,false);
  assert.equal(h.getOptions().selectable,false);
  h.setCompact(false);
  await h.flush();
  assert.equal(h.getOptions().initialView,'timeGridWeek');
  assert.equal(h.calls.construct,2);
  assert.equal(h.calls.destroy,1);
  h.controller.destroy();
  assert.equal(h.calls.destroy,2);
});
