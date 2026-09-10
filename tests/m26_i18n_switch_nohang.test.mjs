import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installIberfitLanguageSwitchRuntimeGuard} from '../src/m26/ui/i18n-runtime-guard.js';

function fakeControl(kind='language'){
  const attributes=new Map();
  return {
    kind,
    closest(selector){
      if(kind==='language'&&selector.includes('[data-m26-ui-language]'))return this;
      if(kind==='locale'&&selector.includes('[data-m26-ui-locale]'))return this;
      return null;
    },
    setAttribute(name,value){attributes.set(name,String(value));},
    removeAttribute(name){attributes.delete(name);},
    getAttribute(name){return attributes.get(name)??null;},
  };
}

function fakeRoot(initialControls=[]){
  const listeners=new Map();
  const root={
    dataset:{},
    controls:[...initialControls],
    addEventListener(type,handler,capture=false){listeners.set(`${type}:${Boolean(capture)}`,handler);},
    removeEventListener(type,handler,capture=false){
      const key=`${type}:${Boolean(capture)}`;
      if(listeners.get(key)===handler)listeners.delete(key);
    },
    querySelectorAll(){return this.controls;},
    dispatchEvent(){return true;},
    listener(type,capture=false){return listeners.get(`${type}:${Boolean(capture)}`);},
  };
  return root;
}

function manualScheduler(){
  const queue=[];
  return {
    schedule(callback){queue.push(callback);return queue.length;},
    flush(){while(queue.length)queue.shift()();},
    get pending(){return queue.length;},
  };
}

function surfaceInstallerLog(){
  const log=[];
  let installs=0;
  return {
    install(){
      installs+=1;
      const id=installs;
      log.push(`install:${id}`);
      return {
        disconnect(){log.push(`disconnect:${id}`);},
      };
    },
    log,
    get installs(){return installs;},
  };
}

test('language switch suspends reactive translation before shell render and reconciles once after it',()=>{
  const oldControl=fakeControl('language');
  const root=fakeRoot([oldControl]);
  const scheduler=manualScheduler();
  const surface=surfaceInstallerLog();

  const guard=installIberfitLanguageSwitchRuntimeGuard(root,{
    installSurfaceI18n:()=>surface.install(),
    schedule:callback=>scheduler.schedule(callback),
  });

  assert.deepEqual(surface.log,['install:1']);
  const onChange=root.listener('change',true);
  assert.equal(typeof onChange,'function');

  onChange({target:oldControl});
  assert.deepEqual(surface.log,['install:1','disconnect:1']);
  assert.equal(root.dataset.m26I18nSwitching,'true');
  assert.equal(oldControl.getAttribute('aria-busy'),'true');
  assert.equal(scheduler.pending,1);

  const renderedControl=fakeControl('language');
  root.controls=[renderedControl];
  scheduler.flush();

  assert.deepEqual(surface.log,['install:1','disconnect:1','install:2']);
  assert.equal(surface.installs,2);
  assert.equal(root.dataset.m26I18nSwitching,undefined);
  assert.equal(renderedControl.getAttribute('aria-busy'),null);

  guard.disconnect();
});

test('rapid language changes coalesce stale reconciliation work instead of multiplying full DOM walks',()=>{
  const control=fakeControl('language');
  const root=fakeRoot([control]);
  const scheduler=manualScheduler();
  const surface=surfaceInstallerLog();

  installIberfitLanguageSwitchRuntimeGuard(root,{
    installSurfaceI18n:()=>surface.install(),
    schedule:callback=>scheduler.schedule(callback),
  });

  const onChange=root.listener('change',true);
  onChange({target:control});
  onChange({target:control});

  assert.equal(scheduler.pending,2);
  assert.deepEqual(surface.log,['install:1','disconnect:1']);

  scheduler.flush();
  assert.equal(surface.installs,2);
  assert.deepEqual(surface.log,['install:1','disconnect:1','install:2']);
  assert.equal(root.dataset.m26I18nSwitching,undefined);
  assert.equal(control.getAttribute('aria-busy'),null);
});

test('locale changes use the same bounded path and unrelated controls remain untouched',()=>{
  const locale=fakeControl('locale');
  const unrelated=fakeControl('other');
  const root=fakeRoot([locale]);
  const scheduler=manualScheduler();
  const surface=surfaceInstallerLog();

  installIberfitLanguageSwitchRuntimeGuard(root,{
    installSurfaceI18n:()=>surface.install(),
    schedule:callback=>scheduler.schedule(callback),
  });

  const onChange=root.listener('change',true);
  onChange({target:unrelated});
  assert.deepEqual(surface.log,['install:1']);
  assert.equal(scheduler.pending,0);

  onChange({target:locale});
  assert.deepEqual(surface.log,['install:1','disconnect:1']);
  scheduler.flush();
  assert.deepEqual(surface.log,['install:1','disconnect:1','install:2']);
});

test('runtime guard is loaded through the existing backward-compatible locale bridge',()=>{
  const source=fs.readFileSync('src/m26/ui/castellano.js','utf8');
  assert.match(source,/import '\.\/i18n-runtime-guard\.js';/u);
  assert.match(source,/Backward-compatible bridge/u);
});
