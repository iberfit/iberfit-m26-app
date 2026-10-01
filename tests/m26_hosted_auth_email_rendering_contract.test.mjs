import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {normalizeHostedAuthAssets} from '../scripts/auth/sync-hosted-auth-emails.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifestPath=path.join(root,'supabase/templates/iberfit-hosted-auth-email-manifest.json');
const invitePath=path.join(root,'supabase/templates/iberfit-invite.html');
const publicOrigin='https://app.iberfit.cl/public/';

function hostedTemplateHtml(){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.schema,'iberfit.auth-email-hosted.v1');
  assert.equal(manifest.templates.length,13);
  return manifest.templates.map((entry)=>({
    id:entry.id,
    html:normalizeHostedAuthAssets(fs.readFileSync(path.join(root,entry.file),'utf8')),
  }));
}

function referencedPublicAssets(html){
  const urls=html.match(/https:\/\/app\.iberfit\.cl\/public\/[A-Za-z0-9._/-]+/gu)||[];
  return [...new Set(urls)].map((value)=>new URL(value));
}

test('Hosted Auth public image assets are present in the canonical deploy surface',()=>{
  const output=fs.mkdtempSync(path.join(os.tmpdir(),'iberfit-email-surface-'));
  try{
    const build=spawnSync(process.execPath,['qa/rc64/build-current-surface.mjs'],{
      cwd:root,
      env:{...process.env,M26_BUILD_DIR:output},
      encoding:'utf8',
    });
    assert.equal(build.status,0,`${build.stdout}\n${build.stderr}`);

    const seen=new Set();
    for(const {id,html} of hostedTemplateHtml()){
      assert.doesNotMatch(html,/https:\/\/app\.iberfit\.cl\/(?:isotipo-iberfit\.png|iberfit-email-access-hero\.jpg)/u,`${id} must not use legacy email asset URLs`);
      for(const url of referencedPublicAssets(html)){
        const relative=url.pathname.replace(/^\//u,'');
        seen.add(relative);
        assert.ok(fs.existsSync(path.join(root,relative)),`${id} references missing source asset ${relative}`);
        assert.ok(fs.existsSync(path.join(output,relative)),`${id} references asset omitted from deploy surface ${relative}`);
      }
    }

    assert.ok(seen.has('public/isotipo-iberfit.png'),'Hosted Auth must keep the canonical IBERFIT isotipo');
    assert.ok(seen.has('public/iberfit-email-access-hero.jpg'),'Hosted Auth must package the access hero');
  }finally{
    fs.rmSync(output,{recursive:true,force:true});
  }
});

test('Invite keeps premium, robust email hierarchy without fragile four-column layout',()=>{
  const html=fs.readFileSync(invitePath,'utf8');
  assert.match(html,/src="https:\/\/app\.iberfit\.cl\/public\/iberfit-email-access-hero\.jpg"/u);
  assert.match(html,/width="620" height="278" alt="Planificación y entrenamiento IBERFIT"/u);
  assert.match(html,/bgcolor="#c8a24a"/u);
  assert.match(html,/color:#0d3328;text-decoration:none/u);
  assert.match(html,/href="\{\{ \.ConfirmationURL \}\}"/u);
  assert.doesNotMatch(html,/width="25%"/u);
  assert.equal((html.match(/width="50%"/gu)||[]).length,4);
  for(const label of ['DIAGNÓSTICO','PLANIFICACIÓN','CONTROL','SEGUIMIENTO'])assert.match(html,new RegExp(label,'u'));
  assert.match(html,/supported-color-schemes" content="light"/u);
});
