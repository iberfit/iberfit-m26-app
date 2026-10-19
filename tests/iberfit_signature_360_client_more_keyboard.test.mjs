import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bindShellDisclosureDismissSupport,
} from '../src/m26/rc39/shell-enhancer.js';
import {renderRouteView} from '../src/m26/modules/route-render.js';

const nav=fs.readFileSync('src/m26/ui/client-bottom-nav.css','utf8');

function clientMoreFixture(){
  const events=new Map();
  const focused=[];
  let outside=null;
  const summary={
    attributes:new Map(),
    setAttribute(k,v){this.attributes.set(k,v);},
    focus(){documentLike.activeElement=this;focused.push('summary');},
  };
  const items=Array.from({length:6},(_,n)=>({
    focus(){documentLike.activeElement=this;focused.push(n);},
  }));
  const details={
    open:true,
    matches(selector){return selector==='details.m26-client-bottom-nav-more';},
    querySelector(selector){return [':scope > summary','summary'].includes(selector)?summary:null;},
    querySelectorAll(selector){
      return selector==='.m26-client-bottom-nav-menu [role="menuitem"]:not([disabled])'?items:[];
    },
    contains(target){return target===summary||items.includes(target);},
    removeAttribute(name){if(name==='open')this.open=false;},
  };
  const documentLike={
    activeElement:summary,
    addEventListener(type,fn){events.set(type,[...(events.get(type)||[]),fn]);},
    querySelector(selector){
      if(selector==='details.m26-client-bottom-nav-more[open]')return details.open?details:null;
      if(selector.includes('.m26-client-bottom-nav-more[open]'))return details.open?details:null;
      return null;
    },
    fire(type,event){for(const fn of events.get(type)||[])fn(event);},
  };
  const key=(name,target=documentLike.activeElement)=>{
    let prevented=0;
    documentLike.fire('keydown',{key:name,target,preventDefault(){prevented+=1;}});
    return prevented;
  };
  const click=(target)=>{
    outside=target;
    documentLike.fire('click',{target});
  };
  return {documentLike,details,summary,items,focused,key,click,get outside(){return outside;}};
}

test('Client Más announces the current destination and menu relations without inventing permissions',()=>{
  const html=renderRouteView({kind:'mensajes',role:'client',title:'Mensajes'});
  assert.match(html,/aria-haspopup="menu" aria-controls="m26-client-bottom-nav-menu" aria-expanded="false"/u);
  assert.match(html,/id="m26-client-bottom-nav-menu" class="m26-client-bottom-nav-menu" role="menu"/u);
  for(const area of ['informes','actividad','retos','ajustes']){
    assert.match(html,new RegExp('role="menuitem" data-m26-area="'+area+'"'));
  }
  assert.match(html,/role="menuitem" data-m26-area="mensajes" aria-current="page"/u);
  assert.doesNotMatch(html,/data-m26-area="informes" aria-current="page"/u);
  assert.match(nav,/\.m26-client-bottom-nav-menu button\[aria-current="page"\]/u);
});

test('Mensajes stays current while showing its recoverable connection error',()=>{
  const rendered=renderRouteView({
    kind:'communication-unavailable',role:'client',communication:{},title:'Mensajes',
  });
  assert.match(rendered,/data-client-bottom-nav-route="communication-unavailable"/u);
  assert.match(rendered,/m26-client-bottom-nav-more is-active/u);
  assert.match(rendered,/data-m26-area="mensajes" aria-current="page"/u);
  assert.match(rendered,/data-m45-communication-retry/u);
  assert.match(nav,/max-height:\s*min\(24rem,\s*62dvh,\s*calc\(100dvh - 9rem - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\)\)/u);
  assert.match(nav,/overflow-y:auto/u,'short mobile viewports must scroll the popup');
});

test('opening guidance from Más first releases the popup without dismissing or persisting the tip',()=>{
  const guide=fs.readFileSync('src/m26/onboarding/client-contextual-guide.js','utf8');
  assert.ok(guide.includes("closest?.('details.m26-client-bottom-nav-more[open]')"));
  assert.ok(guide.includes('clientMore.open=false'));
  assert.match(guide,/aria-expanded','false'/u);
  assert.ok(guide.includes('show(ctx,tip,{force:true})'));
});

test('Client Más keyboard supports Down, Up, Home and End with stable focus',()=>{
  const f=clientMoreFixture();
  assert.equal(bindShellDisclosureDismissSupport(f.documentLike),true);
  assert.equal(bindShellDisclosureDismissSupport(f.documentLike),false,'no duplicate listeners after re-render');
  assert.equal(f.key('ArrowDown'),1);
  assert.equal(f.documentLike.activeElement,f.items[0]);
  assert.equal(f.key('ArrowUp'),1);
  assert.equal(f.documentLike.activeElement,f.items[5]);
  assert.equal(f.key('Home'),1);
  assert.equal(f.documentLike.activeElement,f.items[0]);
  assert.equal(f.key('End'),1);
  assert.equal(f.documentLike.activeElement,f.items[5]);
  assert.equal(f.details.open,true,'reading the menu must not mutate the route');
});

test('Client Más closes on Escape, outside click and native toggle; unrelated clicks survive',()=>{
  const f=clientMoreFixture();
  bindShellDisclosureDismissSupport(f.documentLike);
  f.documentLike.fire('toggle',{target:f.details});
  assert.equal(f.summary.attributes.get('aria-expanded'),'true');
  assert.equal(f.key('Escape',f.items[2]),1);
  assert.equal(f.details.open,false);
  assert.equal(f.summary.attributes.get('aria-expanded'),'false');
  // queueFocus uses queueMicrotask; confirm the focus target after flushing.
  return Promise.resolve().then(()=>{
    assert.equal(f.documentLike.activeElement,f.summary);
    f.details.open=true;
    const target={};
    f.click(target);
    assert.equal(f.outside,target);
    assert.equal(f.details.open,false);
    assert.equal(f.documentLike.activeElement,f.summary,'outside activation keeps its own focus semantics');
    f.documentLike.fire('toggle',{target:f.details});
    assert.equal(f.summary.attributes.get('aria-expanded'),'false');
  });
});

test('Client Más is scoped: regular Coach/Admin disclosures preserve their own behavior',()=>{
  const f=clientMoreFixture();
  bindShellDisclosureDismissSupport(f.documentLike);
  f.details.open=false;
  assert.equal(f.key('ArrowDown',f.summary),0,'no menu navigation when closed');
  assert.equal(f.key('Escape',f.summary),0,'no accidental focus work without an open disclosure');
});
