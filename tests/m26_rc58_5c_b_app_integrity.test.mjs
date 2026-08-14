import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

import {
  createM26Application,
  __applicationInternals,
} from '../src/m26/app/application.js';

import {
  createM26Transport,
  resolveM26Runtime,
} from '../src/m26/supabase-transport.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const sha=(path)=>crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');

function response(body,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    headers:{
      get:(name)=>name==='content-type'?'application/json':null,
    },
    json:async()=>body,
    text:async()=>JSON.stringify(body),
  };
}

function createRoot(){
  const listeners=new Map();
  let html='';

  return {
    set innerHTML(value){html=String(value);},
    get innerHTML(){return html;},
    addEventListener(type,listener){listeners.set(type,listener);},
    removeEventListener(type,listener){
      if(listeners.get(type)===listener)listeners.delete(type);
    },
  };
}

function pngSize(path){
  const data=fs.readFileSync(path);

  assert.ok(data.length>=24,`${path} too small`);
  assert.deepEqual(
    [...data.subarray(0,8)],
    [137,80,78,71,13,10,26,10]
  );

  return {
    width:data.readUInt32BE(16),
    height:data.readUInt32BE(20),
  };
}

test('production recovery uses app.iberfit.cl same-host without QA copy',async()=>{
  const config={
    enabled:true,
    projectRef:'pjhmrhejsoofmouedavw',
    url:'https://pjhmrhejsoofmouedavw.supabase.co',
    publishableKey:'publishable-key-for-test',
    qaOnly:false,
  };

  const locationLike={
    hostname:'app.iberfit.cl',
    protocol:'https:',
    port:'',
    pathname:'/',
    search:'',
    hash:'',
  };

  const runtime=resolveM26Runtime(config,locationLike);

  assert.equal(runtime.enabled,true);
  assert.equal(runtime.qaOnly,false);

  assert.equal(
    __applicationInternals.recoveryRedirectForRuntime(
      runtime,
      locationLike
    ),
    'https://app.iberfit.cl/'
  );

  assert.doesNotMatch(
    __applicationInternals.recoveryRequestConfirmation(runtime),
    /\bQA\b/u
  );

  let calls=0;

  const transport=createM26Transport(
    runtime,
    {
      fetchImpl:async()=>{
        calls+=1;
        return response({});
      },
    }
  );

  await transport.requestPasswordRecovery(
    'persona@example.com',
    'https://app.iberfit.cl/'
  );

  assert.equal(calls,1);

  await assert.rejects(
    ()=>transport.requestPasswordRecovery(
      'persona@example.com',
      'https://coach.iberfit.cl/'
    ),
    /M26_RECOVERY_REDIRECT_INVALID/
  );

  await assert.rejects(
    ()=>transport.requestPasswordRecovery(
      'persona@example.com',
      'https://m26-canary.iberfit.cl/'
    ),
    /M26_RECOVERY_REDIRECT_INVALID/
  );
});

test('production recovery fragment is accepted after URL scrub',async()=>{
  const now=Math.floor(Date.now()/1000);
  const root=createRoot();

  const app=await createM26Application({
    root,
    runtimeConfig:{
      enabled:true,
      projectRef:'pjhmrhejsoofmouedavw',
      url:'https://pjhmrhejsoofmouedavw.supabase.co',
      publishableKey:'publishable-key-for-test',
      qaOnly:false,
    },
    locationLike:{
      hostname:'app.iberfit.cl',
      protocol:'https:',
      port:'',
      pathname:'/',
      search:'',
      hash:`#access_token=fake-access&type=recovery&expires_at=${now+3600}`,
    },
    historyLike:{
      replaceState(_state,_title,url){
        assert.equal(url,'/');
      },
    },
  });

  assert.equal(await app.mount(),false);
  assert.match(root.innerHTML,/data-auth-form="update-password"/);
  assert.doesNotMatch(root.innerHTML,/fake-access/);
  app.destroy();
});

test('canary recovery remains QA-only and canary-bound',async()=>{
  const runtime=resolveM26Runtime(
    {
      enabled:true,
      projectRef:'pjhmrhejsoofmouedavw',
      url:'https://pjhmrhejsoofmouedavw.supabase.co',
      publishableKey:'publishable-key-for-test',
      qaOnly:true,
    },
    {
      hostname:'m26-canary.iberfit.cl',
      protocol:'https:',
      port:'',
    }
  );

  let calls=0;

  const transport=createM26Transport(
    runtime,
    {
      fetchImpl:async()=>{
        calls+=1;
        return response({});
      },
    }
  );

  await transport.requestPasswordRecovery(
    'iberfit.cl+qa.coach@gmail.com',
    'https://m26-canary.iberfit.cl/'
  );

  assert.equal(calls,1);

  await assert.rejects(
    ()=>transport.requestPasswordRecovery(
      'persona@example.com',
      'https://m26-canary.iberfit.cl/'
    ),
    /M26_QA_ACCOUNT_REQUIRED/
  );

  await assert.rejects(
    ()=>transport.requestPasswordRecovery(
      'iberfit.cl+qa.coach@gmail.com',
      'https://app.iberfit.cl/'
    ),
    /M26_RECOVERY_REDIRECT_INVALID/
  );
});

test('generated PWA shell covers every CSS linked by index and excludes runtime config',()=>{
  const check=spawnSync(
    process.execPath,
    ['scripts/generate_rc58_app_shell.mjs','--check'],
    {encoding:'utf8'}
  );

  assert.equal(
    check.status,
    0,
    `${check.stdout}\n${check.stderr}`
  );

  const index=read('public/m26/index.html');
  const sw=read('public/m26/sw.js');

  const styles=[
    ...index.matchAll(/href=["']([^"']+\.css)["']/giu),
  ].map((match)=>match[1]);

  assert.ok(styles.length>0);

  for(const style of styles){
    assert.equal(
      sw.includes(`"${style}"`) ||
      sw.includes(`'${style}'`),
      true,
      style
    );
  }

  assert.doesNotMatch(
    sw,
    /RC58_GENERATED_APP_SHELL[^;\n]*runtime-config\.js/u
  );

  assert.match(sw,/m26-rc58-5c-b/);
  assert.match(sw,/redirect:'error'/);
});

test('PWA identity derives from Brand Truth with expected icon dimensions',()=>{
  const truth=JSON.parse(
    read('src/m26/design/brand-truth.json')
  );

  assert.equal(truth.version,'58.5.2');
  assert.equal(
    truth.propagation.appIcons,
    'native-and-pwa-derived-from-official-asset'
  );
  assert.equal(truth.propagation.pwaIdentity.status,'aligned');
  assert.equal(truth.propagation.pwaIdentity.recolored,false);

  assert.equal(
    sha(truth.officialAsset.path),
    'd4707b688db39e11fee7d027bf9d3f2514225dfc806797ae3f9379d710ef07aa'
  );

  assert.deepEqual(
    pngSize('public/m26/icons/icon-192.png'),
    {width:192,height:192}
  );

  assert.deepEqual(
    pngSize('public/m26/icons/icon-512.png'),
    {width:512,height:512}
  );

  assert.deepEqual(
    pngSize('public/m26/icons/icon-maskable-192.png'),
    {width:192,height:192}
  );

  assert.deepEqual(
    pngSize('public/m26/icons/icon-maskable-512.png'),
    {width:512,height:512}
  );

  assert.deepEqual(
    pngSize('public/m26/icons/apple-touch-icon-180.png'),
    {width:180,height:180}
  );

  const index=read('public/m26/index.html');

  assert.match(
    index,
    /\/m26\/icons\/apple-touch-icon-180\.png/
  );
});

test('offline fallback uses Brand Truth and RC58 design tokens',()=>{
  const html=read('public/m26/offline.html');
  const css=read('public/m26/offline.css');

  assert.match(html,/\/public\/isotipo-iberfit\.png/);
  assert.match(html,/\/src\/m26\/design\/tokens\.css/);
  assert.match(html,/\/src\/m26\/design\/typography\.css/);
  assert.match(css,/var\(--iberfit-color-canvas\)/);
  assert.match(css,/var\(--iberfit-font-family-editorial\)/);
  assert.match(css,/focus-visible/);
  assert.doesNotMatch(css,/font:\s*16px\s+system-ui/);
});

test('RC58 CI branch has a dedicated current-app integrity gate',()=>{
  const ci=read('.github/workflows/ci.yml');

  assert.match(ci,/feature\/rc58-design-system/);
  assert.match(ci,/Validar RC58 app integrity/);
  assert.match(ci,/check_utf8_mojibake\.mjs/);
  assert.match(ci,/generate_rc58_app_shell\.mjs --check/);
  assert.match(ci,/npm test/);
});

test('commercial work is deferred while preserving its backlog',()=>{
  const roadmap=read('docs/ROADMAP_RC58_RC64_PREMIUM.md');
  const rc58b=read('docs/RC58_5B_NATIVE_IDENTITY_ALIGNMENT.md');

  assert.match(
    roadmap,
    /COMMERCIAL_WEB_PHASE=DEFERRED_UNTIL_APP_COMPLETE/
  );

  assert.doesNotMatch(
    roadmap,
    /Avanza en paralelo desde RC58\./
  );

  assert.match(roadmap,/hero con producto real/);

  assert.match(
    rc58b,
    /NEXT_ACTION=RC58_5C_APP_INTEGRITY_AND_CROSS_SURFACE/
  );
});