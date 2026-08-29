import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const QA_REF='gjztkdwfmunnzhtvxrsu';
const PROD_REF='pjhmrhejsoofmouedavw';
const QA_ORIGIN=`https://${QA_REF}.supabase.co`;
const PROD_ORIGIN=`https://${PROD_REF}.supabase.co`;
const count=(text,needle)=>String(text).split(needle).length-1;

test('RC65-C1 canary CSP is generated QA-only without mutating the production header template',()=>{
  const templatePath=path.join(root,'public','m26','_headers');
  const before=fs.readFileSync(templatePath,'utf8');
  assert.equal(count(before,PROD_ORIGIN),3);
  assert.equal(count(before,QA_ORIGIN),0);
  assert.doesNotMatch(before,/https:\/\/\*\.supabase\.co/iu);

  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-rc65c1-csp-'));
  const buildDir=path.join(temp,'build');
  fs.mkdirSync(path.join(buildDir,'m26'),{recursive:true});
  try{
    const result=spawnSync(process.execPath,['scripts/generate_rc74_4_runtime_config.mjs'],{
      cwd:root,
      encoding:'utf8',
      env:{
        ...process.env,
        M26_SUPABASE_URL:QA_ORIGIN,
        M26_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_local_validation_rc65c1_csp',
        M26_PROJECT_REF:QA_REF,
        M26_QA_ONLY:'true',
        M26_RUNTIME_VALIDATION_ONLY:'true',
        M26_BUILD_DIR:buildDir,
        CF_PAGES_BRANCH:'canary/rc74-4',
      },
    });
    assert.equal(result.status,0,result.stderr||result.stdout);

    const generatedRoot=fs.readFileSync(path.join(buildDir,'_headers'),'utf8');
    const generatedNested=fs.readFileSync(path.join(buildDir,'m26','_headers'),'utf8');
    const runtime=fs.readFileSync(path.join(buildDir,'m26','runtime-config.js'),'utf8');
    assert.equal(generatedRoot,generatedNested);
    for(const generated of [generatedRoot,generatedNested]){
      assert.equal(count(generated,QA_ORIGIN),3);
      assert.equal(count(generated,PROD_ORIGIN),0);
      assert.doesNotMatch(generated,/https:\/\/\*\.supabase\.co/iu);
      assert.match(generated,new RegExp(`connect-src 'self' ${QA_ORIGIN.replaceAll('.','\\.')};`,'u'));
      assert.match(generated,new RegExp(`img-src 'self' data: blob: ${QA_ORIGIN.replaceAll('.','\\.')};`,'u'));
      assert.match(generated,new RegExp(`frame-src 'self' ${QA_ORIGIN.replaceAll('.','\\.')};`,'u'));
    }
    assert.match(runtime,new RegExp(QA_REF,'u'));
    assert.doesNotMatch(runtime,new RegExp(PROD_REF,'u'));
    assert.match(runtime,/"qaOnly": true/u);
    assert.equal(fs.readFileSync(templatePath,'utf8'),before);
  }finally{
    fs.rmSync(temp,{recursive:true,force:true});
  }
});

test('RC65-C1 canary header generator fails closed on template drift contracts',()=>{
  const source=fs.readFileSync(path.join(root,'scripts','generate_rc74_4_runtime_config.mjs'),'utf8');
  for(const guard of [
    'RC74_4_HEADERS_TEMPLATE_MISSING',
    'RC74_4_HEADERS_PRODUCTION_ORIGIN_INVALID',
    'RC74_4_HEADERS_PRODUCTION_ORIGIN_COUNT',
    'RC74_4_HEADERS_TEMPLATE_ALREADY_QA',
    'RC74_4_HEADERS_WILDCARD_FORBIDDEN',
    'RC74_4_HEADERS_PRODUCTION_ORIGIN_LEAK',
    'RC74_4_HEADERS_QA_DIRECTIVE_MISSING',
  ]) assert.ok(source.includes(guard),guard);
  assert.doesNotMatch(source,new RegExp(PROD_REF,'u'));
});
