import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SHA_RE=/^[0-9a-f]{40}$/u;
export const CANARY_BRANCH='canary/rc74-4';
export const QA_REF='gjztkdwfmunnzhtvxrsu';
export const QA_URL=`https://${QA_REF}.supabase.co`;
export const PROD_REF='pjhmrhejsoofmouedavw';
export const PROD_URL=`https://${PROD_REF}.supabase.co`;

function required(value,code){
  const normalized=String(value||'').trim();
  if(!normalized)throw new Error(code);
  return normalized;
}

function readText(file){
  if(!fs.existsSync(file))throw new Error(`CANARY_SURFACE_FILE_MISSING:${file}`);
  return fs.readFileSync(file,'utf8').replace(/\r\n?/gu,'\n');
}

function writeText(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,value,'utf8');
}

function extractSwVersion(sw,code){
  const version=(String(sw||'').match(/^const VERSION='([^']+)';/mu)||[])[1];
  if(!version)throw new Error(code);
  return version;
}

function extractSwPreviousVersion(sw,code){
  const version=(String(sw||'').match(/^const PREVIOUS_VERSION='([^']+)';/mu)||[])[1];
  if(!version)throw new Error(code);
  return version;
}

export function sealCanarySurface({
  buildDir,
  sourceSha,
  sourceBranch=CANARY_BRANCH,
  generatedRuntimePath,
  liveSwPath,
  previousLiveSha='',
}={}){
  const root=path.resolve(required(buildDir,'CANARY_SURFACE_BUILD_DIR_MISSING'));
  const sha=required(sourceSha,'CANARY_SURFACE_SOURCE_SHA_MISSING').toLowerCase();
  const branch=required(sourceBranch,'CANARY_SURFACE_SOURCE_BRANCH_MISSING');
  const runtimePath=path.resolve(required(generatedRuntimePath,'CANARY_SURFACE_RUNTIME_PATH_MISSING'));
  const liveSw=path.resolve(required(liveSwPath,'CANARY_SURFACE_LIVE_SW_PATH_MISSING'));

  if(!SHA_RE.test(sha))throw new Error('CANARY_SURFACE_SOURCE_SHA_INVALID');
  if(branch!==CANARY_BRANCH)throw new Error(`CANARY_SURFACE_BRANCH_INVALID:${branch}`);
  if(previousLiveSha&&!SHA_RE.test(String(previousLiveSha).trim().toLowerCase()))throw new Error('CANARY_SURFACE_PREVIOUS_SHA_INVALID');

  const rootIndex=path.join(root,'index.html');
  const m26Root=path.join(root,'m26');
  if(!fs.existsSync(rootIndex))throw new Error('CANARY_SURFACE_ROOT_INDEX_MISSING');
  if(!fs.existsSync(m26Root))throw new Error('CANARY_SURFACE_M26_DIR_MISSING');

  const runtime=readText(runtimePath);
  if(!/"enabled":\s*true/u.test(runtime))throw new Error('CANARY_SURFACE_RUNTIME_DISABLED');
  if(!/"qaOnly":\s*true/u.test(runtime))throw new Error('CANARY_SURFACE_RUNTIME_NOT_QA');
  if(!runtime.includes(QA_REF)||!runtime.includes(QA_URL))throw new Error('CANARY_SURFACE_RUNTIME_QA_IDENTITY_MISSING');
  if(!/sb_publishable_[A-Za-z0-9_-]+/u.test(runtime))throw new Error('CANARY_SURFACE_RUNTIME_PUBLIC_KEY_MISSING');
  if(runtime.includes(PROD_REF)||runtime.includes(PROD_URL))throw new Error('CANARY_SURFACE_RUNTIME_PROD_LEAK');
  if(/service[_-]?role/iu.test(runtime))throw new Error('CANARY_SURFACE_RUNTIME_SERVICE_ROLE_LEAK');
  writeText(path.join(m26Root,'runtime-config.js'),runtime);

  const shortSha=sha.slice(0,12);
  const version=Object.freeze({
    schema:'iberfit.release-identity.v1',
    release:`IBERFIT_M26_CANARY_${shortSha.toUpperCase()}`,
    version:`26.0.0-canary.${shortSha}`,
    sourceSha:sha,
    sourceBranch:branch,
    previousLiveSha:previousLiveSha?String(previousLiveSha).trim().toLowerCase():null,
    environment:'QA',
    projectRef:QA_REF,
    qaOnly:true,
    production:false,
  });
  const versionText=`${JSON.stringify(version,null,2)}\n`;
  writeText(path.join(m26Root,'version.json'),versionText);
  writeText(path.join(root,'version.json'),versionText);

  const sourceHeadersPath=path.join(m26Root,'_headers');
  let headers=readText(sourceHeadersPath);
  headers=headers.replaceAll(PROD_URL,QA_URL).replaceAll(PROD_REF,QA_REF);
  if(headers.includes(PROD_REF)||headers.includes(PROD_URL))throw new Error('CANARY_SURFACE_HEADERS_PROD_LEAK');
  if(!headers.includes(QA_URL))throw new Error('CANARY_SURFACE_HEADERS_QA_ORIGIN_MISSING');
  writeText(sourceHeadersPath,headers);
  writeText(path.join(root,'_headers'),headers);

  const swPath=path.join(m26Root,'sw.js');
  let sw=readText(swPath);
  const currentSourceVersion=extractSwVersion(sw,'CANARY_SURFACE_SOURCE_SW_VERSION_MISSING');
  const liveSwText=readText(liveSw);
  const liveVersion=extractSwVersion(liveSwText,'CANARY_SURFACE_LIVE_SW_VERSION_MISSING');
  const livePreviousVersion=extractSwPreviousVersion(liveSwText,'CANARY_SURFACE_LIVE_SW_PREVIOUS_VERSION_MISSING');
  const releaseVersion=`m26-canary-${shortSha}`;
  const previousVersion=liveVersion===releaseVersion?livePreviousVersion:liveVersion;
  if(previousVersion===releaseVersion)throw new Error('CANARY_SURFACE_SW_LINEAGE_COLLAPSED');
  sw=sw.replace(/^const VERSION='[^']+';/mu,`const VERSION='${releaseVersion}';`);
  sw=sw.replace(/^const PREVIOUS_VERSION='[^']+';/mu,`const PREVIOUS_VERSION='${previousVersion}';`);
  if(!sw.includes('/src/m26/design/auth-native.css'))throw new Error('CANARY_SURFACE_SW_AUTH_NATIVE_MISSING');
  writeText(swPath,sw);

  const evidence={
    schema:'iberfit.canary.deploy-surface.v1',
    sourceSha:sha,
    sourceBranch:branch,
    previousLiveSha:version.previousLiveSha,
    projectRef:QA_REF,
    environment:'QA',
    qaOnly:true,
    production:false,
    runtimeEnabled:true,
    releaseIdentityGenerated:true,
    rootVersionMirrored:true,
    headersQaOnly:true,
    sourceSwVersion:currentSourceVersion,
    releaseSwVersion:releaseVersion,
    previousSwVersion:previousVersion,
  };
  writeText(path.join(root,'CANARY_DEPLOY_SURFACE.json'),`${JSON.stringify(evidence,null,2)}\n`);
  return Object.freeze(evidence);
}

function cli(){
  return sealCanarySurface({
    buildDir:process.env.M26_CANARY_BUILD_DIR||'.tmp/rc64-current-surface',
    sourceSha:process.env.M26_CANARY_SOURCE_SHA,
    sourceBranch:process.env.M26_CANARY_SOURCE_BRANCH||CANARY_BRANCH,
    generatedRuntimePath:process.env.M26_CANARY_GENERATED_RUNTIME||'.tmp/rc64-current-surface/m26/runtime-config.js',
    liveSwPath:process.env.M26_CANARY_LIVE_SW_PATH||'/tmp/m26-canary-live-sw.js',
    previousLiveSha:process.env.M26_CANARY_PREVIOUS_LIVE_SHA||'',
  });
}

const invoked=process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:'';
if(import.meta.url===invoked){
  try{
    console.log(JSON.stringify(cli(),null,2));
  }catch(error){
    console.error(error?.stack||error);
    process.exitCode=1;
  }
}
