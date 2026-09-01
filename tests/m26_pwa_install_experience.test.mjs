import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPwaInstallController,
  detectPwaInstallPlatform,
  isPwaStandalone,
  manualPwaInstallGuidance,
} from '../src/m26/platform/pwa.js';
import {renderAccessUi} from '../src/m26/app/access-ui.js';

function fakeTarget(){
  const listeners=new Map();
  return {
    addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(handler);},
    removeEventListener(type,handler){listeners.get(type)?.delete(handler);},
    emit(type,event={}){for(const handler of listeners.get(type)||[])handler(event);},
  };
}

test('detecta iPad aunque Safari publique plataforma MacIntel',()=>{
  const platform=detectPwaInstallPlatform({
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    platform:'MacIntel',
    maxTouchPoints:5,
  });
  assert.equal(platform.ios,true);
  assert.equal(platform.mac,false);
  const guidance=manualPwaInstallGuidance({
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    platform:'MacIntel',
    maxTouchPoints:5,
  });
  assert.equal(guidance.platform,'ios');
  assert.match(guidance.instructions,/Añadir a pantalla de inicio/);
});

test('Safari en Mac recibe instrucción de instalación en Dock',()=>{
  const guidance=manualPwaInstallGuidance({
    userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    platform:'MacIntel',
    maxTouchPoints:0,
  });
  assert.equal(guidance.platform,'mac-safari');
  assert.match(guidance.instructions,/Añadir al Dock/);
});

test('standalone oculta cualquier oferta de instalación',()=>{
  assert.equal(isPwaStandalone({navigatorLike:{standalone:true},matchMediaLike:()=>({matches:false})}),true);
  const controller=createPwaInstallController({
    target:fakeTarget(),
    navigatorLike:{standalone:true,userAgent:'',platform:'',maxTouchPoints:0},
    matchMediaLike:()=>({matches:false}),
  });
  controller.mount();
  assert.deepEqual(controller.getState().installed,true);
  assert.equal(controller.getState().available,false);
});

test('Chromium instala sólo tras gesto explícito y conserva cancelación segura',async()=>{
  const target=fakeTarget();
  const changes=[];
  let prevented=false;
  let prompts=0;
  const controller=createPwaInstallController({
    target,
    navigatorLike:{standalone:false,userAgent:'Mozilla/5.0 (Linux; Android 15) Chrome/152.0 Safari/537.36',platform:'Linux armv8l',maxTouchPoints:5},
    matchMediaLike:()=>({matches:false}),
    onChange:(state)=>changes.push(state.kind),
  });
  controller.mount();
  assert.equal(controller.getState().available,false);
  target.emit('beforeinstallprompt',{
    preventDefault(){prevented=true;},
    async prompt(){prompts+=1;},
    userChoice:Promise.resolve({outcome:'accepted'}),
  });
  assert.equal(prevented,true);
  assert.equal(controller.getState().kind,'prompt');
  const result=await controller.install();
  assert.equal(prompts,1);
  assert.equal(result.outcome,'accepted');
  assert.equal(controller.getState().installed,true);
  assert.ok(changes.includes('prompt'));
});

test('la pantalla de acceso ofrece el control PWA sin mezclarlo con autenticación',()=>{
  const html=renderAccessUi({backendReady:true,qaOnly:false,host:'app.iberfit.cl'});
  assert.match(html,/<iberfit-install-control><\/iberfit-install-control>/);
  assert.doesNotMatch(html,/data-auth-action="install-app"/);
  assert.match(html,/data-auth-form="login"/);
  assert.match(html,/Olvidé mi contraseña/);
});

test('manifest productivo es adaptable y conserva iconos normal y maskable',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.resolve('public/m26/manifest.webmanifest'),'utf8'));
  assert.equal(manifest.name.startsWith('IBERFIT'),true);
  assert.equal(manifest.display,'standalone');
  assert.ok(!manifest.orientation||manifest.orientation==='any');
  assert.equal(manifest.scope,'/');
  assert.ok(manifest.icons.some((icon)=>String(icon.purpose||'').split(/\s+/).includes('any')&&icon.sizes==='512x512'));
  assert.ok(manifest.icons.some((icon)=>String(icon.purpose||'').split(/\s+/).includes('maskable')&&icon.sizes==='512x512'));
});
