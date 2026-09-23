import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createMobileMoreTouchRetargetBridge} from '../src/m26/shell/navigation.js';

const ADMIN_SHELL_SELECTOR='.m26-shell[data-m26-role="admin"]';

function createFixture({role='admin'}={}){
  const shell={role};
  const details={
    open:true,
    parent:shell,
    contains(node){return node===button||node===summary;},
    hasAttribute(name){return name==='open'&&this.open;},
    closest(selector){
      if(selector==='details.m26-mobile-more')return this;
      if(selector===ADMIN_SHELL_SELECTOR)return role==='admin'?shell:null;
      return null;
    },
  };
  const summary={
    parent:details,
    closest(selector){
      if(selector==='details.m26-mobile-more')return details;
      if(selector===ADMIN_SHELL_SELECTOR)return role==='admin'?shell:null;
      return null;
    },
  };
  const button={
    parent:details,
    isConnected:true,
    clicks:0,
    closest(selector){
      if(selector==='[data-m26-area]')return this;
      if(selector==='details.m26-mobile-more')return details;
      if(selector===ADMIN_SHELL_SELECTOR)return role==='admin'?shell:null;
      return null;
    },
    click(){this.clicks+=1;},
  };
  return {shell,details,summary,button};
}

function createDocument(){
  const listeners=new Map();
  const documentLike={
    hit:null,
    addEventListener(type,handler){
      const bucket=listeners.get(type)||[];
      bucket.push(handler);
      listeners.set(type,bucket);
    },
    removeEventListener(type,handler){
      const bucket=listeners.get(type)||[];
      listeners.set(type,bucket.filter((item)=>item!==handler));
    },
    elementFromPoint(){return documentLike.hit;},
    emit(type,event){
      for(const handler of [...(listeners.get(type)||[])])handler(event);
    },
  };
  return documentLike;
}

function pointerEvent({pointerId=1,pointerType='touch',isPrimary=true,target,clientX=24,clientY=24}={}){
  return {pointerId,pointerType,isPrimary,target,clientX,clientY};
}

function touchPoint({identifier=1,clientX=24,clientY=24}={}){
  return {identifier,clientX,clientY};
}

function touchEvent({point=touchPoint(),active=1}={}){
  return {changedTouches:[point],touches:Array.from({length:active},()=>point)};
}

function clickEvent(target,{trusted=true}={}){
  const calls={prevented:0,stopped:0};
  return {
    target,
    isTrusted:trusted,
    preventDefault(){calls.prevented+=1;},
    stopImmediatePropagation(){calls.stopped+=1;},
    calls,
  };
}

function createBridge(documentLike){
  let expiry=null;
  const bridge=createMobileMoreTouchRetargetBridge({
    documentLike,
    setTimeoutFn(fn){expiry=fn;return 1;},
    clearTimeoutFn(){expiry=null;},
  });
  bridge.install();
  return {bridge,expire(){expiry?.();}};
}

test('adjusted trusted pointer click inside Admin mobile Más is rerouted to the physical route button',()=>{
  const {summary,button}=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;

  documentLike.emit('pointerdown',pointerEvent({target:summary}));
  documentLike.emit('pointerup',pointerEvent({target:summary}));

  const adjusted=clickEvent(summary,{trusted:true});
  documentLike.emit('click',adjusted);

  assert.equal(adjusted.calls.prevented,1,'retargeted native click must be cancelled');
  assert.equal(adjusted.calls.stopped,1,'retargeted native click must not reach the summary handler');
  assert.equal(button.clicks,1,'canonical route button click must be replayed exactly once');
  bridge.destroy();
});

test('touch-only Admin tap fallback reroutes a trusted summary click to the physical route button',()=>{
  const {summary,button}=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;
  const point=touchPoint({identifier:11});

  documentLike.emit('touchstart',touchEvent({point,active:1}));
  documentLike.emit('touchend',touchEvent({point,active:0}));
  const adjusted=clickEvent(summary,{trusted:true});
  documentLike.emit('click',adjusted);

  assert.equal(adjusted.calls.prevented,1,'touch-only retargeted native click must be cancelled');
  assert.equal(adjusted.calls.stopped,1,'touch-only retargeted native click must not reach the summary handler');
  assert.equal(button.clicks,1,'touch-only canonical route button click must be replayed exactly once');
  bridge.destroy();
});

test('coexisting pointer and touch streams replay adjusted Admin navigation only once',()=>{
  const {summary,button}=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;
  const point=touchPoint({identifier:22});

  documentLike.emit('pointerdown',pointerEvent({target:summary,pointerId:22}));
  documentLike.emit('touchstart',touchEvent({point,active:1}));
  documentLike.emit('pointerup',pointerEvent({target:summary,pointerId:22}));
  documentLike.emit('touchend',touchEvent({point,active:0}));
  const adjusted=clickEvent(summary,{trusted:true});
  documentLike.emit('click',adjusted);

  assert.equal(adjusted.calls.prevented,1);
  assert.equal(adjusted.calls.stopped,1);
  assert.equal(button.clicks,1,'mixed pointer/touch delivery must never duplicate route replay');
  bridge.destroy();
});

test('direct trusted click on the same Admin mobile Más route remains untouched',()=>{
  const {button}=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;

  documentLike.emit('pointerdown',pointerEvent({target:button}));
  documentLike.emit('pointerup',pointerEvent({target:button}));

  const direct=clickEvent(button,{trusted:true});
  documentLike.emit('click',direct);

  assert.equal(direct.calls.prevented,0);
  assert.equal(direct.calls.stopped,0);
  assert.equal(button.clicks,0,'bridge must not duplicate a correct native route click');
  bridge.destroy();
});

test('residual trusted click is suppressed after canonical Admin navigation unmounts the route button',()=>{
  const {summary,button,details}=createFixture();
  const replacement=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;

  documentLike.emit('pointerdown',pointerEvent({target:summary}));
  documentLike.emit('pointerup',pointerEvent({target:summary}));

  button.isConnected=false;
  details.contains=()=>false;
  const residual=clickEvent(replacement.summary,{trusted:true});
  documentLike.emit('click',residual);

  assert.equal(residual.calls.prevented,1,'residual native click must not reopen the replacement Más disclosure');
  assert.equal(residual.calls.stopped,1,'residual native click must be consumed before shell summary handling');
  assert.equal(button.clicks,0,'detached route controls must never be replayed');
  bridge.destroy();
});

test('Coach mobile Más remains completely outside the Admin touch bridge',()=>{
  const {summary,button}=createFixture({role:'coach'});
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;
  const point=touchPoint({identifier:33});

  documentLike.emit('pointerdown',pointerEvent({target:summary}));
  documentLike.emit('pointerup',pointerEvent({target:summary}));
  documentLike.emit('touchstart',touchEvent({point,active:1}));
  documentLike.emit('touchend',touchEvent({point,active:0}));
  const trusted=clickEvent(summary,{trusted:true});
  documentLike.emit('click',trusted);

  assert.equal(trusted.calls.prevented,0,'Coach trusted clicks must remain untouched');
  assert.equal(trusted.calls.stopped,0,'Coach event propagation must remain untouched');
  assert.equal(button.clicks,0,'Admin bridge must never synthesize Coach navigation');
  bridge.destroy();
});

test('mouse, mismatched pointer release and cancelled pointer gestures never synthesize navigation',()=>{
  const first=createFixture();
  const second=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);

  documentLike.hit=first.button;
  documentLike.emit('pointerdown',pointerEvent({target:first.summary,pointerType:'mouse'}));
  documentLike.emit('pointerup',pointerEvent({target:first.summary,pointerType:'mouse'}));
  documentLike.emit('click',clickEvent(first.summary,{trusted:true}));
  assert.equal(first.button.clicks,0,'mouse must stay on the normal click path');

  documentLike.emit('pointerdown',pointerEvent({target:first.summary,pointerId:7}));
  documentLike.hit=second.button;
  documentLike.emit('pointerup',pointerEvent({target:second.summary,pointerId:7}));
  documentLike.emit('click',clickEvent(first.summary,{trusted:true}));
  assert.equal(first.button.clicks,0,'pointerup on a different physical route must fail closed');

  documentLike.hit=first.button;
  documentLike.emit('pointerdown',pointerEvent({target:first.summary,pointerId:8}));
  documentLike.emit('pointercancel',{pointerId:8});
  documentLike.emit('click',clickEvent(first.summary,{trusted:true}));
  assert.equal(first.button.clicks,0,'cancelled pointer gestures must fail closed');

  bridge.destroy();
});

test('multitouch and cancelled touch gestures fail closed',()=>{
  const {summary,button}=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;
  const point=touchPoint({identifier:44});
  const second=touchPoint({identifier:45,clientX:40,clientY:40});

  documentLike.emit('touchstart',{changedTouches:[point],touches:[point,second]});
  documentLike.emit('touchend',touchEvent({point,active:0}));
  documentLike.emit('click',clickEvent(summary,{trusted:true}));
  assert.equal(button.clicks,0,'multitouch must never arm navigation replay');

  documentLike.emit('touchstart',touchEvent({point,active:1}));
  documentLike.emit('touchcancel',{changedTouches:[point],touches:[]});
  documentLike.emit('click',clickEvent(summary,{trusted:true}));
  assert.equal(button.clicks,0,'cancelled touch gestures must fail closed');
  bridge.destroy();
});

test('synthetic controller clicks are never intercepted by the Admin retarget bridge',()=>{
  const {summary,button}=createFixture();
  const documentLike=createDocument();
  const {bridge}=createBridge(documentLike);
  documentLike.hit=button;

  documentLike.emit('pointerdown',pointerEvent({target:summary}));
  documentLike.emit('pointerup',pointerEvent({target:summary}));
  const synthetic=clickEvent(summary,{trusted:false});
  documentLike.emit('click',synthetic);

  assert.equal(synthetic.calls.prevented,0);
  assert.equal(synthetic.calls.stopped,0);
  assert.equal(button.clicks,0,'bridge must not recurse into synthetic click paths');
  bridge.destroy();
});

test('expired physical gestures cannot retarget a later trusted click',()=>{
  const {summary,button}=createFixture();
  const documentLike=createDocument();
  const {bridge,expire}=createBridge(documentLike);
  documentLike.hit=button;
  const point=touchPoint({identifier:55});

  documentLike.emit('touchstart',touchEvent({point,active:1}));
  documentLike.emit('touchend',touchEvent({point,active:0}));
  expire();
  const late=clickEvent(summary,{trusted:true});
  documentLike.emit('click',late);

  assert.equal(late.calls.prevented,0);
  assert.equal(late.calls.stopped,0);
  assert.equal(button.clicks,0,'expired gestures must never replay navigation');
  bridge.destroy();
});

test('canonical shell module graph loads navigation before the controller can handle routes',()=>{
  const routeGuard=fs.readFileSync(new URL('../src/m26/shell/route-guard.js',import.meta.url),'utf8');
  const controller=fs.readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
  const navigation=fs.readFileSync(new URL('../src/m26/shell/navigation.js',import.meta.url),'utf8');

  assert.match(routeGuard,/from '\.\/navigation\.js'/u,'route guard must load the canonical navigation module');
  assert.match(controller,/from '\.\/route-guard\.js'/u,'shell controller must load route guard before mounting');
  assert.match(navigation,/installMobileMoreTouchRetargetBridge\(\);/u,'navigation module must install the bridge as a guarded side effect');
  assert.match(navigation,/\.m26-shell\[data-m26-role="admin"\]/u,'retarget bridge must stay scoped to Admin');
  assert.match(navigation,/addEventListener\('touchstart'/u,'touch-only browsers must arm the Admin retarget bridge');
  assert.match(navigation,/addEventListener\('touchend'/u,'touch-only browsers must commit the physical gesture before click compatibility events');
});
