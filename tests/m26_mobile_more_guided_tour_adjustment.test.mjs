import test from 'node:test';
import assert from 'node:assert/strict';

import {createMobileMoreTouchRetargetBridge} from '../src/m26/shell/navigation.js';

const ADMIN_SHELL_SELECTOR='.m26-shell[data-m26-role="admin"]';
const GUIDED_TOUR_SELECTOR='[data-m26-guided-tour]';

function createFixture(){
  const shell={};
  const details={
    open:true,
    contains(node){return node===button;},
    hasAttribute(name){return name==='open'&&this.open;},
    closest(selector){
      if(selector==='details.m26-mobile-more')return this;
      if(selector===ADMIN_SHELL_SELECTOR)return shell;
      return null;
    },
  };
  const button={
    isConnected:true,
    clicks:0,
    closest(selector){
      if(selector==='[data-m26-area]')return this;
      if(selector==='details.m26-mobile-more')return details;
      if(selector===ADMIN_SHELL_SELECTOR)return shell;
      return null;
    },
    click(){this.clicks+=1;},
  };
  return {details,button};
}

function guidedTourTarget(){
  const tour={
    closest(selector){return selector===GUIDED_TOUR_SELECTOR?tour:null;},
  };
  return tour;
}

function foreignTarget(){
  return {closest(){return null;}};
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
    emit(type,event){for(const handler of [...(listeners.get(type)||[])])handler(event);},
  };
  return documentLike;
}

function pointerEvent({target,pointerId=6}={}){
  return {target,pointerId,pointerType:'touch',isPrimary:true,clientX:224.4,clientY:388.7};
}

function touchEvent({active=0,identifier=0}={}){
  const point={identifier,clientX:224.4,clientY:388.7};
  return {changedTouches:[point],touches:active?[point]:[]};
}

function clickEvent(target){
  const calls={prevented:0,stopped:0};
  return {
    target,
    isTrusted:true,
    preventDefault(){calls.prevented+=1;},
    stopImmediatePropagation(){calls.stopped+=1;},
    calls,
  };
}

function createBridge(documentLike){
  const bridge=createMobileMoreTouchRetargetBridge({
    documentLike,
    setTimeoutFn(){return 1;},
    clearTimeoutFn(){},
  });
  bridge.install();
  return bridge;
}

test('Chromium guided-tour touch adjustment replays the armed physical Admin Más route exactly once',()=>{
  const {button}=createFixture();
  const documentLike=createDocument();
  const bridge=createBridge(documentLike);
  const tour=guidedTourTarget();
  documentLike.hit=button;

  documentLike.emit('pointerdown',pointerEvent({target:tour}));
  documentLike.emit('touchstart',touchEvent({active:1}));
  documentLike.emit('pointerup',pointerEvent({target:tour}));
  documentLike.emit('touchend',touchEvent({active:0}));

  const adjusted=clickEvent(tour);
  documentLike.emit('click',adjusted);

  assert.equal(adjusted.calls.prevented,1,'trusted adjusted click must be cancelled before the guided tour handles it');
  assert.equal(adjusted.calls.stopped,1,'trusted adjusted click must not propagate to the guided tour');
  assert.equal(button.clicks,1,'the physically armed Biblioteca route must be replayed exactly once');
  bridge.destroy();
});

test('armed Admin Más gestures never replay arbitrary trusted targets outside the disclosure',()=>{
  const {button}=createFixture();
  const documentLike=createDocument();
  const bridge=createBridge(documentLike);
  const foreign=foreignTarget();
  documentLike.hit=button;

  documentLike.emit('pointerdown',pointerEvent({target:foreign,pointerId:7}));
  documentLike.emit('pointerup',pointerEvent({target:foreign,pointerId:7}));
  const click=clickEvent(foreign);
  documentLike.emit('click',click);

  assert.equal(click.calls.prevented,0,'unrelated targets must remain untouched');
  assert.equal(click.calls.stopped,0,'unrelated targets must keep normal propagation');
  assert.equal(button.clicks,0,'an unrelated target must never synthesize navigation');
  bridge.destroy();
});

test('guided-tour adjustment fails closed if the physically armed route control is no longer mounted',()=>{
  const {button,details}=createFixture();
  const documentLike=createDocument();
  const bridge=createBridge(documentLike);
  const tour=guidedTourTarget();
  documentLike.hit=button;

  documentLike.emit('pointerdown',pointerEvent({target:tour,pointerId:8}));
  documentLike.emit('pointerup',pointerEvent({target:tour,pointerId:8}));
  button.isConnected=false;
  details.contains=()=>false;

  const adjusted=clickEvent(tour);
  documentLike.emit('click',adjusted);

  assert.equal(adjusted.calls.prevented,0);
  assert.equal(adjusted.calls.stopped,0);
  assert.equal(button.clicks,0,'detached route controls must never be replayed');
  bridge.destroy();
});
