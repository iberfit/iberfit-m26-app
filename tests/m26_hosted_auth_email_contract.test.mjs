import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const templatesDir=path.join(repoRoot,'supabase','templates');
const manifestPath=path.join(templatesDir,'iberfit-hosted-auth-email-manifest.json');
const distRelative=`.tmp-email-contract-${process.pid}`;
const distDir=path.join(repoRoot,distRelative);

const requiredVariables=Object.freeze({
  invite:['{{ .ConfirmationURL }}','{{ .SiteURL }}','{{ .InviterName }}'],
  signup:['{{ .ConfirmationURL }}','{{ .SiteURL }}'],
  magic_link:['{{ .ConfirmationURL }}','{{ .SiteURL }}'],
  recovery:['{{ .ConfirmationURL }}','{{ .SiteURL }}'],
  reauthentication:['{{ .Token }}'],
  email_change:['{{ .ConfirmationURL }}','{{ .SiteURL }}','{{ .NewEmail }}'],
  password_changed:['{{ .SiteURL }}','{{ .Email }}'],
  email_changed:['{{ .SiteURL }}','{{ .Email }}'],
  phone_changed:['{{ .SiteURL }}','{{ .Phone }}'],
  identity_linked:['{{ .SiteURL }}','{{ .Email }}'],
  identity_unlinked:['{{ .SiteURL }}','{{ .Email }}'],
  mfa_factor_enrolled:['{{ .SiteURL }}','{{ .Email }}'],
  mfa_factor_unenrolled:['{{ .SiteURL }}','{{ .Email }}'],
});

function localPublicPath(reference){
  if(reference.startsWith('/public/')) return reference.slice(1);
  try{
    const url=new URL(reference);
    if(url.hostname==='app.iberfit.cl'&&url.pathname.startsWith('/public/')) return url.pathname.slice(1);
  }catch{}
  return null;
}

function referencesFrom(html){
  return [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map((match)=>match[1]);
}

async function assertExists(file,label){
  await assert.doesNotReject(()=>access(file),label);
}

test('Hosted Auth email templates preserve variables, safe structure and deployed public assets',async()=>{
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  const managed=Object.entries(manifest.templates||{}).filter(([,entry])=>entry?.managed!==false);
  assert.equal(managed.length,13,'Hosted Auth must keep all 13 managed email templates');

  const publicAssets=new Set();
  for(const [type,entry] of managed){
    const filename=String(entry.template||'').trim();
    assert.ok(filename,`${type}: missing template filename`);
    const html=await readFile(path.join(templatesDir,filename),'utf8');

    assert.match(html,/<!doctype html>/i,`${type}: missing HTML doctype`);
    assert.match(html,/<html\b[^>]*lang=["']es["']/i,`${type}: missing Spanish language declaration`);
    assert.match(html,/<table\b[^>]*role=["']presentation["']/i,`${type}: missing email-safe presentation table`);
    assert.doesNotMatch(html,/\b(?:src|href)=["']\s*(?:javascript|data|vbscript):/i,`${type}: unsafe URL scheme`);
    assert.doesNotMatch(html,/\bon(?:error|load|click|mouseover)\s*=/i,`${type}: inline event handler is not allowed`);

    for(const variable of requiredVariables[type]||[]){
      assert.ok(html.includes(variable),`${type}: required Supabase variable missing: ${variable}`);
    }

    for(const reference of referencesFrom(html)){
      if(reference.includes('{{')) continue;
      if(/^https?:\/\//i.test(reference)) assert.doesNotThrow(()=>new URL(reference),`${type}: malformed absolute URL ${reference}`);
      const local=localPublicPath(reference);
      if(!local) continue;
      publicAssets.add(local);
      await assertExists(path.join(repoRoot,local),`${type}: referenced source asset does not exist: ${local}`);
    }
  }

  const inviteEntry=manifest.templates.invite;
  const invite=await readFile(path.join(templatesDir,inviteEntry.template),'utf8');
  assert.ok(invite.includes('/public/iberfit-email-isotipo.png'),'invite: dedicated email isotipo must be used');
  assert.ok(invite.includes('/public/iberfit-email-access-hero.jpg'),'invite: access hero must be used');
  assert.match(invite,/bgcolor=["']#c8a24a["'][^>]*>[\s\S]*?<a\b[^>]*color:#0d3328/i,'invite: primary CTA must be gold with dark-green text');
  assert.equal((invite.match(/width=["']50%["']/g)||[]).length,4,'invite: methodology must use a robust 2x2 grid');
  assert.equal((invite.match(/width=["']25%["']/g)||[]).length,0,'invite: fragile 4-column methodology layout must not return');

  const build=spawnSync(process.execPath,[path.join(repoRoot,'qa','rc64','build-current-surface.mjs'),distRelative],{
    cwd:repoRoot,
    env:{...process.env,GITHUB_SHA:'email-contract'},
    encoding:'utf8',
  });
  try{
    assert.equal(build.status,0,`canonical surface build failed:\n${build.stdout}\n${build.stderr}`);
    assert.ok(publicAssets.has('public/iberfit-email-isotipo.png'),'contract must observe the dedicated email isotipo');
    assert.ok(publicAssets.has('public/iberfit-email-access-hero.jpg'),'contract must observe the access hero');
    for(const asset of publicAssets){
      await assertExists(path.join(distDir,asset),`referenced public asset is missing from canonical build: ${asset}`);
    }
  }finally{
    await rm(distDir,{recursive:true,force:true});
    await rm(`${distDir}.tmp-${process.pid}`,{recursive:true,force:true});
  }
});
