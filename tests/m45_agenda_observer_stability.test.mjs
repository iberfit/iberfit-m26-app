import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRc62AgendaCalendarController,
  buildRc62AgendaEvents,
  fullCalendarCoachOptions,
  agendaVisibleHourWindow,
  loadFullCalendarStandard,
} from '../src/m26/agenda/fullcalendar-agenda.js';

const tick=()=>new Promise((resolve)=>setImmediate(resolve));

function appointment(id,start='2026-10-16T10:00:00-03:00'){
  return {
    id,title:'Sesión presencial',startAt:start,
    endAt:new Date(new Date(start).getTime()+60*60*1000).toISOString(),status:'confirmed',modality:'presencial',
  };
}

function calendarHarness({compact=false,failRender=false,failUpdate=false}={}){
  const documentLike={createElement(tag){
    return {
      tag,dataset:{},children:[],
      setAttribute(){},
      append(...children){this.children.push(...children);},
    };
  }};
  const host={
    dataset:{},isConnected:true,ownerDocument:documentLike,children:[],
    replaceChildren(...children){this.children=children;},
  };
  let compactMatches=compact;
  let renderFails=failRender;
  let onCompactChange=null;
  let lastOptions=null;
  let lastCalendar=null;
  const calls={construct:0,render:0,remove:0,add:0,destroy:0,options:[]};
  const scheduled=[];
  let mutation;
  const events=new Map(),onlineEvents=new Map();
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
    constructor(host,options){calls.construct+=1;lastOptions=options;lastCalendar=this;this.date=new Date(options.initialDate||'2026-10-20T12:00:00-03:00');}
    getDate(){return this.date;}
    render(){calls.render+=1;if(renderFails)throw Error('vendor render failure');}
    removeAllEvents(){calls.remove+=1;}
    addEventSource(){calls.add+=1;if(failUpdate)throw Error('vendor update failure');}
    setOption(name,value){calls.options.push({name,value});}
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
    addEventListener(name,callback){onlineEvents.set(name,callback);},
    removeEventListener(name){onlineEvents.delete(name);},
  };
  const root={
    ownerDocument:documentLike,
    addEventListener(name,callback){events.set(name,callback);},
    removeEventListener(name){events.delete(name);},
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
    controller,calls,flush,host,events,
    getMutation:()=>mutation,
    setRenderFailure(value){renderFails=value;},
    reconnect(){onlineEvents.get('online')?.();},
    getOptions:()=>lastOptions,
    selectDate(value){lastCalendar.date=new Date(value);},
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


test('M45 agenda reveals early and late appointments without all-day clutter',()=>{
  assert.deepEqual(agendaVisibleHourWindow([]),{
    slotMinTime:'06:00:00',slotMaxTime:'22:00:00',
  });
  const early=buildRc62AgendaEvents([{
    id:'early',title:'Sesión temprana',
    startAt:'2026-10-20T05:00:00-03:00',
    endAt:'2026-10-20T06:00:00-03:00',
  }]);
  assert.equal(fullCalendarCoachOptions({events:early}).slotMinTime,'04:00:00');
  const late=buildRc62AgendaEvents([{
    id:'late',title:'Sesión nocturna',
    startAt:'2026-10-20T23:00:00-03:00',
    endAt:'2026-10-21T00:00:00-03:00',
  }]);
  assert.deepEqual(agendaVisibleHourWindow(late),{
    slotMinTime:'06:00:00',slotMaxTime:'24:00:00',
  });
  const fromNineToMidnight=buildRc62AgendaEvents([{
    id:'evening',startAt:'2026-10-20T21:00:00-03:00',
    endAt:'2026-10-21T00:00:00-03:00',
  }]);
  assert.deepEqual(agendaVisibleHourWindow(fromNineToMidnight),{
    slotMinTime:'06:00:00',slotMaxTime:'24:00:00',
  });
});

test('M45 agenda expands hours when a late appointment arrives after initial render',async()=>{
  const h=calendarHarness();
  h.controller.mount();
  await h.flush();
  h.setAppointments([appointment('a'),{
    id:'late',title:'Entrenamiento nocturno',
    startAt:'2026-10-20T23:00:00-03:00',
    endAt:'2026-10-21T00:00:00-03:00',
  }]);
  h.getMutation()();
  await h.flush();
  assert.ok(h.calls.options.some((item)=>item.name==='slotMaxTime'&&item.value==='24:00:00'));
  assert.ok(h.calls.options.some((item)=>item.name==='slotMinTime'&&item.value==='06:00:00'));
  h.controller.destroy();
});


test('M45 a third-party calendar render exception releases resources and falls back to cards',async()=>{
  const h=calendarHarness({failRender:true});
  h.controller.mount();
  await h.flush();
  assert.equal(h.calls.construct,1);
  assert.equal(h.calls.destroy,1);
  assert.equal(h.host.dataset.calendarStatus,'fallback');
  // No retry loop when the third-party renderer is permanently broken.
  assert.equal(h.calls.render,1);
  h.controller.destroy();
  assert.equal(h.calls.destroy,1,'failed instance must not be leaked or destroyed again');
});

test('M45 a partial calendar update failure is contained, with no stale overlay',async()=>{
  const h=calendarHarness({failUpdate:true});
  h.controller.mount();
  await h.flush();
  assert.equal(h.calls.construct,1);
  h.setAppointments([appointment('a'),appointment('b','2026-10-16T12:00:00-03:00')]);
  h.getMutation()();
  await h.flush();
  assert.equal(h.calls.destroy,1);
  assert.equal(h.host.dataset.calendarStatus,'fallback');
  assert.equal(h.calls.add,1);
  h.controller.destroy();
  assert.equal(h.calls.destroy,1);
});


test('M45 Coach retains chosen agenda day when moving tablet to desktop and back',async()=>{
  const h=calendarHarness();
  h.controller.mount();
  await h.flush();
  h.selectDate('2026-11-24T12:00:00-03:00');
  h.setCompact(true);
  await h.flush();
  assert.equal(h.getOptions().initialView,'timeGridDay');
  assert.equal(h.getOptions().initialDate,new Date('2026-11-24T12:00:00-03:00').toISOString());
  h.selectDate('2026-11-26T12:00:00-03:00');
  h.setCompact(false);
  await h.flush();
  assert.equal(h.getOptions().initialView,'timeGridWeek');
  assert.equal(h.getOptions().initialDate,new Date('2026-11-26T12:00:00-03:00').toISOString());
  h.controller.destroy();
});

test('M45 calendar date input rejects invalid dates instead of injecting state',()=>{
  assert.equal('initialDate' in fullCalendarCoachOptions({initialDate:'not-a-date'}),false);
  assert.equal(fullCalendarCoachOptions({initialDate:'2026-11-24T12:00:00-03:00'}).initialDate,
    '2026-11-24T15:00:00.000Z');
});


test('M45 a failed third-party calendar script can be fetched successfully on explicit retry',async()=>{
  const entries=[];
  let attempts=0;
  const scope={};
  const fakeDocument={
    querySelector(selector){
      const found=entries.find((entry)=>
        entry.tag==='script'
          ?selector===`script[data-rc62-fullcalendar="${entry.dataset.rc62Fullcalendar}"]`
          :selector===`link[data-rc62-fullcalendar="${entry.dataset.rc62Fullcalendar}"]`
      );
      return found||null;
    },
    createElement(tag){
      return {
        tag,dataset:{},listeners:{},
        addEventListener(name,handler){this.listeners[name]=handler;},
        remove(){
          const index=entries.indexOf(this);
          if(index>=0)entries.splice(index,1);
        },
      };
    },
    head:{
      append(node){
        entries.push(node);
        if(node.tag!=='script')return;
        queueMicrotask(()=>{
          if(node.src.includes('all.global.js')){
            attempts++;
            if(attempts===1){node.listeners.error();return;}
          }
          if(node.src.includes('es.global.js'))scope.FullCalendar={Calendar:class {}};
          node.listeners.load();
        });
      },
    },
  };
  await assert.rejects(
    ()=>loadFullCalendarStandard({scope,documentLike:fakeDocument}),
    /M26_RC62_FULLCALENDAR_ASSET_FAILED/,
  );
  assert.equal(entries.filter(x=>x.tag==='script'&&x.src.includes('all.global.js')).length,0,
    'failed script is discarded, not left awaiting events forever');
  const result=await loadFullCalendarStandard({scope,documentLike:fakeDocument});
  assert.equal(typeof result.Calendar,'function');
  assert.equal(attempts,2,'the second attempt loads a fresh script');
  assert.equal(entries.filter(x=>x.tag==='script'&&x.src.includes('all.global.js')).length,1);
});


test('M45 a failed calendar shows accessible retry, with no automatic infinite observer loop',async()=>{
  const h=calendarHarness({failRender:true});
  h.controller.mount();
  await h.flush();
  assert.equal(h.host.dataset.calendarStatus,'fallback');
  const panel=h.host.children[0];
  assert.equal(panel.children[0].textContent,
    'No pudimos mostrar el calendario visual. La lista de citas sigue disponible.');
  assert.equal(panel.children[1].textContent,'Reintentar calendario');
  assert.equal(panel.children[1].dataset.rc62AgendaRetry,'true');
  for(let i=0;i<5;i++){
    h.getMutation()();
    await h.flush();
  }
  assert.equal(h.calls.construct,1,'observer mutations cannot create an endless failure loop');
  assert.equal(h.calls.render,1);
  h.setRenderFailure(false);
  h.events.get('click')({
    target:{closest(selector){return selector==='[data-rc62-agenda-retry]'?{}:null;}},
    preventDefault(){},
  });
  await h.flush();
  assert.equal(h.calls.construct,2);
  assert.equal(h.host.dataset.calendarStatus,'ready');
  h.controller.destroy();
  assert.equal(h.events.size,0,'retry listener must be detached');
});

test('M45 a real reconnect retries a failed calendar only once',async()=>{
  const h=calendarHarness({failRender:true});
  h.controller.mount();
  await h.flush();
  assert.equal(h.calls.render,1);
  h.setRenderFailure(false);
  h.reconnect();
  await h.flush();
  assert.equal(h.calls.render,2);
  assert.equal(h.host.dataset.calendarStatus,'ready');
  h.controller.destroy();
});
