import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('package y gate apuntan a RC29',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  assert.ok(['26.0.0-prepublicacion-infraestructura.29','26.0.0-canary.38-iri-diagnosis-bioimpedance'].includes(pkg.version));
  assert.equal(pkg.scripts.gate,'npm run validate:rc29');
  assert.ok(pkg.scripts['validate:rc29']);
});

test('README y contribución declaran la versión vigente y el repositorio separado',async()=>{
  const [readme,contributing]=await Promise.all([read('README.md'),read('CONTRIBUTING.md')]);
  assert.match(readme,/RC29 · Prepublicación/);
  assert.match(readme,/repositorio.*privado/i);
  assert.match(readme,/52 definiciones remotas/);
  assert.match(contributing,/validate:rc29/);
  assert.doesNotMatch(readme,/Current baseline|RC18 Prelaunch/);
});

test('CI ejecuta RC29 sin caché npm incompatible y no despliega',async()=>{
  const ci=await read('.github/workflows/ci.yml');
  assert.match(ci,/npm run validate:rc29/);
  assert.doesNotMatch(ci,/cache:\s*npm/);
  assert.doesNotMatch(ci,/wrangler|pages deploy|deploy/i);
  assert.match(ci,/RC29_\*\.json/);
});

test('workflow remoto requiere dos clientes QA distintos y evidencia RC29',async()=>{
  const workflow=await read('.github/workflows/remote-gates.yml');
  for(const name of ['M26_QA_CLIENT_A_EMAIL','M26_QA_CLIENT_A_PASSWORD','M26_QA_CLIENT_B_EMAIL','M26_QA_CLIENT_B_PASSWORD'])assert.match(workflow,new RegExp(name));
  assert.match(workflow,/RC29_REMOTE_\*\.json/);
  assert.doesNotMatch(workflow,/RC18_REMOTE/);
});

test('gate autenticado compara exactamente el contrato extendido de 52 comandos',async()=>{
  const gate=await read('scripts/remote-gates/run_authenticated_readonly_gate.mjs');
  assert.match(gate,/M26_EXTENDED_COMMAND_REGISTRY/);
  assert.match(gate,/validateCommandCatalog\(remoteRegistry,M26_EXTENDED_COMMAND_REGISTRY,\{strict:true\}\)/);
  assert.match(gate,/remoteRegistry\.length!==52/);
  assert.match(gate,/domain_command_registry_v26/);
  assert.match(gate,/mutationsPerformed:false/);
});

test('gate autenticado inspecciona privacidad Cliente y exige IDs diferentes',async()=>{
  const gate=await read('scripts/remote-gates/run_authenticated_readonly_gate.mjs');
  assert.match(gate,/inspectClientBootstrap/);
  assert.match(gate,/foreignClientIds/);
  assert.match(gate,/RC29_QA_CLIENTS_NOT_DISTINCT/);
  assert.ok(gate.includes('private.?notes?'));
});

test('preflight SQL consolidado es de solo lectura y usa RPC canónicos',async()=>{
  const sql=await read('backend/RC29_PREFLIGHT_SUPABASE_READONLY.sql');
  assert.match(sql,/begin transaction read only/i);
  assert.match(sql,/iberfit_bootstrap_v26/);
  assert.match(sql,/iberfit_command_preflight_v26/);
  assert.match(sql,/iberfit_execute_command_v26/);
  assert.match(sql,/domain_command_registry_v26/);
  assert.match(sql,/pg_policies/);
  assert.doesNotMatch(sql,/(insert|update|delete|alter|create|drop|truncate)/i);
});

test('preflight de separación RC25 ya no usa nombres RPC incorrectos',async()=>{
  const sql=await read('backend/RC25_ROLE_SEPARATION_PREFLIGHT_READONLY.sql');
  assert.match(sql,/iberfit_bootstrap_v26/);
  assert.doesNotMatch(sql,/'m26_bootstrap_v26'|'m26_execute_command_v26'|'m26_preflight_command_v26'/);
});

test('Cloudflare apunta exclusivamente al candidato y canario RC29',async()=>{
  const [toml,docs]=await Promise.all([read('cloudflare/wrangler.toml.example'),read('cloudflare/README.md')]);
  assert.match(toml,/m26-prepublicacion-infraestructura-candidate/);
  assert.match(toml,/M26_RELEASE = "RC29"/);
  assert.match(toml,/M26_QA_ONLY = "true"/);
  assert.match(docs,/m26-canary\.iberfit\.cl/);
  assert.match(docs,/nunca.*iberfit\.cl/i);
});

test('runtime del repositorio permanece desactivado y sin credenciales',async()=>{
  const runtime=await read('public/m26/runtime-config.js');
  assert.match(runtime,/enabled:\s*false/);
  assert.match(runtime,/publishableKey:\s*''/);
  assert.match(runtime,/qaOnly:\s*true/);
  assert.match(runtime,/26\.0\.0-prepublicacion-infraestructura\.29/);
});

test('generador runtime exige QA, proyecto exacto y rechaza service role',async()=>{
  const generator=await read('scripts/generate_rc29_runtime_config.mjs');
  assert.match(generator,/RC29_RUNTIME_QA_ONLY_REQUIRED/);
  assert.match(generator,/RC29_RUNTIME_PROJECT_MISMATCH/);
  assert.match(generator,/RC29_RUNTIME_SERVICE_ROLE_FORBIDDEN/);
  assert.match(generator,/iberfit_bootstrap_v26/);
});

test('archivos canónicos actuales no contienen instrucciones RC18 obsoletas',async()=>{
  const paths=['README.md','CONTRIBUTING.md','.github/pull_request_template.md','.github/workflows/ci.yml','.github/workflows/remote-gates.yml','cloudflare/README.md','cloudflare/wrangler.toml.example'];
  for(const path of paths)assert.doesNotMatch(await read(path),/RC18|m26-resilience-candidate/,path);
});

test('el repositorio de aplicación se documenta como privado y separado',async()=>{
  const docs=await read('docs/RC29_PREPUBLICACION_INFRAESTRUCTURA.md');
  assert.match(docs,/privado y vacío/);
  assert.match(docs,/iberfit-app-m26/);
  assert.match(docs,/No utilizar `iberfitweb`/);
});

test('no se incorpora ninguna dependencia de ejecución',async()=>{
  const pkg=JSON.parse(await read('package.json'));
  assert.equal(Object.keys(pkg.dependencies||{}).length,0);
  assert.equal(Object.keys(pkg.devDependencies||{}).length,0);
});


test('generador runtime produce un artefacto QA habilitado solo con clave publicable',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'iberfit-rc29-'));
  try{
    await mkdir(path.join(dir,'m26'),{recursive:true});
    const result=spawnSync(process.execPath,['scripts/generate_rc29_runtime_config.mjs'],{
      cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,M26_SUPABASE_URL:'https://pjhmrhejsoofmouedavw.supabase.co',M26_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_prueba_local_no_real',M26_QA_ONLY:'true',M26_BUILD_DIR:dir},
    });
    assert.equal(result.status,0,result.stderr);
    const generated=await readFile(path.join(dir,'m26','runtime-config.js'),'utf8');
    assert.match(generated,/"enabled": true/);
    assert.match(generated,/"qaOnly": true/);
    assert.match(generated,/sb_publishable_prueba_local_no_real/);
    assert.doesNotMatch(generated,/service_role/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('generador runtime rechaza un JWT con rol service_role',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'iberfit-rc29-'));
  try{
    await mkdir(path.join(dir,'m26'),{recursive:true});
    const enc=(value)=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const serviceKey=`${enc({alg:'none'})}.${enc({role:'service_role'})}.x`;
    const result=spawnSync(process.execPath,['scripts/generate_rc29_runtime_config.mjs'],{
      cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,M26_SUPABASE_URL:'https://pjhmrhejsoofmouedavw.supabase.co',M26_SUPABASE_PUBLISHABLE_KEY:serviceKey,M26_QA_ONLY:'true',M26_BUILD_DIR:dir},
    });
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/RC29_RUNTIME_SERVICE_ROLE_FORBIDDEN/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
