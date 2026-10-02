import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {access,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {buildHostedAuthPatch,__hostedAuthEmailInternals} from '../scripts/auth/sync-hosted-auth-emails.mjs';
import {inspectImagePayload,verifyEmailAsset} from '../scripts/auth/verify-hosted-auth-email-assets.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const templatesDir=path.join(repoRoot,'supabase','templates');
const manifestPath=path.join(templatesDir,'iberfit-hosted-auth-email-manifest.json');
const distDir=path.join(repoRoot,'.tmp',`email-contract-${process.pid}`);

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

async function assertEmailImage(file,label){
  const bytes=new Uint8Array(await readFile(file));
  const extension=path.extname(file).toLowerCase();
  const contentType=extension==='.png'?'image/png':extension==='.jpg'||extension==='.jpeg'?'image/jpeg':'application/octet-stream';
  const info=inspectImagePayload(bytes,{url:`https://app.iberfit.cl/${path.basename(file)}`,contentType});
  assert.ok(info.bytes>0,`${label}: image payload must not be empty`);
  assert.ok(info.bytes<=500_000,`${label}: email image payload must remain proxy-friendly`);
  return info;
}

test('Hosted Auth remote asset verifier accepts omitted Content-Length only when GET bytes are valid',async()=>{
  const hero=new Uint8Array(await readFile(path.join(repoRoot,'public','iberfit-email-access-hero.jpg')));
  const methods=[];
  const fetchImpl=async(_url,options={})=>{
    methods.push(options.method);
    if(options.method==='HEAD'){
      return new Response(null,{status:200,headers:{'content-type':'image/jpeg'}});
    }
    return new Response(hero,{status:200,headers:{'content-type':'image/jpeg'}});
  };

  const result=await verifyEmailAsset(
    'https://app.iberfit.cl/public/iberfit/email/access-hero-v3-c3a8345b.jpg',
    {baseUrl:'https://preview.example.test',fetchImpl},
  );

  assert.deepEqual(methods,['HEAD','GET']);
  assert.equal(result.declaredLength,null,'omitted Content-Length must remain unknown, never coerce to zero');
  assert.equal(result.bytes,hero.length,'GET body bytes remain the source of truth');
  assert.equal(result.format,'jpeg','GET payload must still pass binary JPEG validation');
  assert.equal(result.sha256,__hostedAuthEmailInternals.APPROVED_HERO_SHA256,'GET payload must expose the approved hero checksum');
});

test('Hosted Auth remote asset verifier rejects an explicit zero Content-Length',async()=>{
  const fetchImpl=async()=>new Response(null,{
    status:200,
    headers:{'content-type':'image/jpeg','content-length':'0'},
  });
  await assert.rejects(
    ()=>verifyEmailAsset(
      'https://app.iberfit.cl/public/iberfit/email/access-hero-v3-c3a8345b.jpg',
      {baseUrl:'https://preview.example.test',fetchImpl},
    ),
    /IBERFIT_AUTH_EMAIL_ASSET_HEAD_LENGTH_INVALID/,
  );
});

test('Hosted Auth email templates preserve variables, safe structure, canonical sync and deployed public assets',async()=>{
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  assert.equal(manifest.schema,'iberfit.auth-email-hosted.v1','Hosted Auth manifest schema must stay canonical');
  assert.ok(Array.isArray(manifest.templates),'Hosted Auth manifest templates must be an array');
  assert.equal(manifest.templates.length,13,'Hosted Auth must keep all 13 managed email templates');

  const publicAssets=new Set();
  const expectedLayouts={
    confirmation:'action',
    invite:'editorial',
    magic_link:'code',
    recovery:'action',
    reauthentication:'code',
    email_change:'action',
    password_changed:'notice',
    email_changed:'notice',
    phone_changed:'notice',
    mfa_factor_enrolled:'notice',
    mfa_factor_unenrolled:'notice',
    identity_linked:'notice',
    identity_unlinked:'notice',
  };
  for(const entry of manifest.templates){
    const type=String(entry.id||'unknown');
    const filename=String(entry.file||'').trim();
    assert.ok(filename,`${type}: missing template filename`);
    const html=await readFile(path.join(repoRoot,filename),'utf8');

    assert.match(html,/<!doctype html>/i,`${type}: missing HTML doctype`);
    assert.match(html,/<html\b[^>]*lang=["']es["']/i,`${type}: missing Spanish language declaration`);
    assert.match(html,/<table\b[^>]*role=["']presentation["']/i,type+': missing email-safe presentation table');
    assert.match(html,/data-iberfit-email=["']v2["']/i,type+': must use the canonical IBERFIT email system v2');
    assert.match(html,new RegExp('data-iberfit-layout=["\\\']'+expectedLayouts[type]+'["\\\']','i'),type+': wrong email density/layout');
    assert.match(html,/font-family:Georgia,'Times New Roman',serif/i,type+': editorial heading fallback stack missing');
    assert.match(html,/font-family:Arial,Helvetica,sans-serif/i,type+': UI/body fallback stack missing');
    assert.ok(html.includes('#0B1310'),type+': canonical forest token missing');
    assert.ok(html.includes('#C5A059'),type+': canonical gold token missing');
    assert.ok(html.includes('#FFFDF8'),type+': canonical paper token missing');
    assert.doesNotMatch(html,/\b(?:src|href)=["']\s*(?:javascript|data|vbscript):/i,type+': unsafe URL scheme');
    assert.doesNotMatch(html,/\bon(?:error|load|click|mouseover)\s*=/i,`${type}: inline event handler is not allowed`);

    for(const variable of entry.requires||[]){
      assert.ok(html.includes(variable),`${type}: required Supabase variable missing: ${variable}`);
    }

    for(const reference of referencesFrom(html)){
      if(reference.includes('{{')) continue;
      if(/^https?:\/\//i.test(reference)) assert.doesNotThrow(()=>new URL(reference),`${type}: malformed absolute URL ${reference}`);
      const local=localPublicPath(reference);
      if(!local) continue;
      publicAssets.add(local);
      const sourceAsset=path.join(repoRoot,local);
      await assertExists(sourceAsset,`${type}: referenced source asset does not exist: ${local}`);
      await assertEmailImage(sourceAsset,`${type}: referenced source asset is not a valid email-safe image: ${local}`);
    }
  }

  const inviteEntry=manifest.templates.find((entry)=>entry.id==='invite');
  assert.ok(inviteEntry,'invite: manifest entry missing');
  const invite=await readFile(path.join(repoRoot,inviteEntry.file),'utf8');
  assert.ok(invite.includes('/public/iberfit-email-isotipo.png'),'invite: dedicated email isotipo must be used');
  assert.ok(invite.includes('/public/iberfit/email/access-hero-v3-c3a8345b.jpg'),'invite: approved immutable access hero must be used');
  assert.ok(!invite.includes('/public/iberfit-email-access-hero.jpg'),'invite: mutable legacy hero URL must never return');
  assert.match(invite,/bgcolor=["']#C5A059["'][^>]*>[\s\S]*?<a\b[^>]*color:#15271E/i,'invite: primary CTA must use canonical gold with dark-green ink');
  assert.match(invite,/alt=["']Material de entrenamiento IBERFIT["']/i,'invite: hero alt text must describe the approved brand material');
  assert.equal((invite.match(/width=["']50%["']/g)||[]).length,4,'invite: methodology must use a robust 2x2 grid');
  assert.equal((invite.match(/width=["']25%["']/g)||[]).length,0,'invite: fragile 4-column methodology layout must not return');

  for(const entry of manifest.templates.filter((item)=>item.id!=='invite')){
    const html=await readFile(path.join(repoRoot,entry.file),'utf8');
    assert.ok(html.includes('/public/iberfit-email-isotipo.png'),entry.id+': official IBERFIT isotipo must remain in the header');
    assert.ok(!html.includes('/public/iberfit/email/access-hero-v3-c3a8345b.jpg'),entry.id+': hero must stay exclusive to editorial invitation email');
    assert.ok(!html.includes('/public/iberfit-email-access-hero.jpg'),entry.id+': mutable legacy hero must stay absent');
  }

  const built=await buildHostedAuthPatch({root:repoRoot,manifestPath});
  const syncedInvite=built.patch[inviteEntry.contentKey];
  assert.ok(syncedInvite.includes(__hostedAuthEmailInternals.PUBLIC_EMAIL_ISOTYPE_URL),'invite: sync must emit the dedicated absolute isotipo URL');
  assert.ok(syncedInvite.includes(__hostedAuthEmailInternals.PUBLIC_HERO_URL),'invite: sync must emit the absolute hero URL');
  for(const entry of manifest.templates){
    const synced=built.patch[entry.contentKey];
    assert.equal(typeof synced,'string',`${entry.id}: synced HTML missing`);
    assert.doesNotMatch(synced,/\b(?:src|href)=["']\/public\//i,`${entry.id}: relative public asset URL escaped canonical sync`);
    if(/<img\b/i.test(synced)){
      assert.ok(
        synced.includes(__hostedAuthEmailInternals.PUBLIC_EMAIL_ISOTYPE_URL)||synced.includes(__hostedAuthEmailInternals.PUBLIC_HERO_URL),
        `${entry.id}: image-bearing template must use canonical absolute email assets`,
      );
    }
  }

  const build=spawnSync(process.execPath,[path.join(repoRoot,'qa','rc64','build-current-surface.mjs')],{
    cwd:repoRoot,
    env:{...process.env,M26_BUILD_DIR:distDir},
    encoding:'utf8',
  });
  try{
    assert.equal(build.status,0,`canonical surface build failed:\n${build.stdout}\n${build.stderr}`);
    assert.ok(publicAssets.has('public/iberfit-email-isotipo.png'),'contract must observe the dedicated email isotipo');
    assert.ok(publicAssets.has('public/iberfit/email/access-hero-v3-c3a8345b.jpg'),'contract must observe the immutable access hero');
    for(const asset of publicAssets){
      const builtAsset=path.join(distDir,asset);
      await assertExists(builtAsset,`referenced public asset is missing from canonical build: ${asset}`);
      const info=await assertEmailImage(builtAsset,`built email asset is invalid: ${asset}`);
      if(asset.endsWith('iberfit-email-access-hero.jpg')){
        assert.equal(info.format,'jpeg','hero must remain a real JPEG');
        const approvedBytes=await readFile(builtAsset);
        assert.equal(crypto.createHash('sha256').update(approvedBytes).digest('hex'),__hostedAuthEmailInternals.APPROVED_HERO_SHA256,'hero bytes must stay pinned to the approved artwork');
        assert.equal(info.progressive,false,'hero must remain baseline JPEG for broad mail-client compatibility');
        assert.ok(info.width>=620&&info.width<=1240,'hero width must remain email-efficient and sharp');
        assert.ok(info.height>=140&&info.height<=220,'hero must remain a subtle low-profile banner');
        const ratio=info.width/info.height;
        assert.ok(ratio>=3.2&&ratio<=4.2,'hero aspect ratio must remain a refined horizontal email banner');
      }
    }
  }finally{
    await rm(distDir,{recursive:true,force:true});
  }
});
