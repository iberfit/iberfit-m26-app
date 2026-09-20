import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const script=path.join(root,'scripts','build_rc74_4_canary.mjs');
const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_URL=`https://${QA_REF}.supabase.co`;
const PROD_REF='pjhmrhejsoofmouedavw';
const BRANCH='canary/rc74-4';
const SHA='1234567890abcdef1234567890abcdef12345678';

function execute(overrides={}){
  const buildDir=overrides.M26_BUILD_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-rc74-4-build-'));
  const env={
    ...process.env,
    M26_BUILD_DIR:buildDir,
    CF_PAGES_COMMIT_SHA:SHA,
    CF_PAGES_BRANCH:BRANCH,
    M26_PROJECT_REF:QA_REF,
    M26_QA_ONLY:'true',
    M26_SUPABASE_URL:QA_URL,
    M26_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_rc74_build_test',
    M26_RUNTIME_VALIDATION_ONLY:'true',
    ...overrides,
  };
  const result=spawnSync(process.execPath,[script],{
    cwd:root,
    env,
    encoding:'utf8',
    shell:false,
  });
  return {buildDir,result};
}

function cleanup(directory){
  fs.rmSync(directory,{recursive:true,force:true});
}

test('RC74.4 Canary build seals exact Cloudflare identity in root and m26',()=>{
  const {buildDir,result}=execute();
  try{
    assert.equal(result.status,0,result.stderr||result.stdout);
    const rootVersion=JSON.parse(fs.readFileSync(path.join(buildDir,'version.json'),'utf8'));
    const m26Version=JSON.parse(fs.readFileSync(path.join(buildDir,'m26','version.json'),'utf8'));
    assert.deepEqual(m26Version,rootVersion);
    assert.equal(rootVersion.sourceSha,SHA);
    assert.equal(rootVersion.sourceBranch,BRANCH);
    assert.equal(rootVersion.projectRef,QA_REF);
    assert.equal(rootVersion.environment,'QA');
    assert.equal(rootVersion.qaOnly,true);
    assert.equal(rootVersion.production,false);

    const runtime=fs.readFileSync(path.join(buildDir,'m26','runtime-config.js'),'utf8');
    assert.match(runtime,new RegExp(QA_REF));
    assert.doesNotMatch(runtime,new RegExp(PROD_REF));
    assert.match(runtime,/"enabled": true/u);
    assert.match(runtime,/"qaOnly": true/u);
  }finally{
    cleanup(buildDir);
  }
});

test('RC74.4 Canary build fails closed on a non-Canary branch',()=>{
  const {buildDir,result}=execute({CF_PAGES_BRANCH:'main'});
  try{
    assert.notEqual(result.status,0);
    assert.match(`${result.stderr}\n${result.stdout}`,/RC74_4_CANARY_SOURCE_BRANCH_MISMATCH:main/u);
    assert.equal(fs.existsSync(path.join(buildDir,'version.json')),false);
  }finally{
    cleanup(buildDir);
  }
});

test('RC74.4 Canary build fails closed without an exact 40-char source SHA',()=>{
  const {buildDir,result}=execute({CF_PAGES_COMMIT_SHA:'bad-sha'});
  try{
    assert.notEqual(result.status,0);
    assert.match(`${result.stderr}\n${result.stdout}`,/RC74_4_CANARY_SOURCE_SHA_INVALID/u);
    assert.equal(fs.existsSync(path.join(buildDir,'version.json')),false);
  }finally{
    cleanup(buildDir);
  }
});
