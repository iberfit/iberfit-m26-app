const SHA_PATTERN=/^[0-9a-f]{40}$/u;
const VERSION_PATTERN=/^m26-(?:prod|canary)-[A-Za-z0-9._:-]{1,80}$/u;
const WRAPPER_MARKER=/^const IBERFIT_SERVICE_WORKER_RELEASE='([^']+)';\n?/mu;
const VERSION_LINE=/^const VERSION='([^']+)';$/mu;
const PREVIOUS_VERSION_LINE=/^const PREVIOUS_VERSION='([^']+)';$/mu;
const CANONICAL_IMPORT="importScripts('/m26/sw.js');";

function fail(code){
  const error=new Error(code);
  error.code=code;
  throw error;
}

function exactSha(value){
  const sha=String(value||'').trim().toLowerCase();
  if(!SHA_PATTERN.test(sha))fail('SERVICE_WORKER_SOURCE_SHA_INVALID');
  return sha;
}

function exactVersion(value){
  const version=String(value||'').trim();
  if(!VERSION_PATTERN.test(version))fail('SERVICE_WORKER_VERSION_INVALID');
  return version;
}

export function productionServiceWorkerVersion(sourceSha){
  return `m26-prod-${exactSha(sourceSha).slice(0,12)}`;
}

export function canaryServiceWorkerVersion(sourceSha){
  return `m26-canary-${exactSha(sourceSha).slice(0,12)}`;
}

export function stampServiceWorkerSource(source,{version,previousVersion}){
  const text=String(source||'').replace(/\r\n?/gu,'\n');
  const current=exactVersion(version);
  const previous=exactVersion(previousVersion);
  if(current===previous)fail('SERVICE_WORKER_LINEAGE_COLLAPSED');
  if((text.match(new RegExp(VERSION_LINE.source,'gmu'))||[]).length!==1)fail('SERVICE_WORKER_VERSION_LINE_INVALID');
  if((text.match(new RegExp(PREVIOUS_VERSION_LINE.source,'gmu'))||[]).length!==1)fail('SERVICE_WORKER_PREVIOUS_VERSION_LINE_INVALID');
  return text
    .replace(VERSION_LINE,`const VERSION='${current}';`)
    .replace(PREVIOUS_VERSION_LINE,`const PREVIOUS_VERSION='${previous}';`);
}

export function stampCanonicalWorkerWrapper(source,{version}){
  let text=String(source||'').replace(/\r\n?/gu,'\n');
  const release=exactVersion(version);
  if((text.match(/importScripts\('\/m26\/sw\.js'\);/gu)||[]).length!==1){
    fail('SERVICE_WORKER_CANONICAL_IMPORT_INVALID');
  }
  text=text.replace(WRAPPER_MARKER,'');
  return `const IBERFIT_SERVICE_WORKER_RELEASE='${release}';\n${text}`;
}

export function readServiceWorkerReleaseIdentity({swSource,wrapperSource}){
  const sw=String(swSource||'').replace(/\r\n?/gu,'\n');
  const wrapper=String(wrapperSource||'').replace(/\r\n?/gu,'\n');
  const versionMatches=[...sw.matchAll(new RegExp(VERSION_LINE.source,'gmu'))];
  const previousMatches=[...sw.matchAll(new RegExp(PREVIOUS_VERSION_LINE.source,'gmu'))];
  const wrapperMatches=[...wrapper.matchAll(new RegExp(WRAPPER_MARKER.source,'gmu'))];
  if(versionMatches.length!==1)fail('SERVICE_WORKER_VERSION_LINE_INVALID');
  if(previousMatches.length!==1)fail('SERVICE_WORKER_PREVIOUS_VERSION_LINE_INVALID');
  if(wrapperMatches.length!==1)fail('SERVICE_WORKER_WRAPPER_MARKER_INVALID');
  if((wrapper.match(/importScripts\('\/m26\/sw\.js'\);/gu)||[]).length!==1){
    fail('SERVICE_WORKER_CANONICAL_IMPORT_INVALID');
  }
  return {
    version:versionMatches[0][1],
    previousVersion:previousMatches[0][1],
    wrapperVersion:wrapperMatches[0][1],
  };
}

export function validateServiceWorkerReleaseIdentity({swSource,wrapperSource,expectedVersion}){
  const expected=expectedVersion===undefined?null:exactVersion(expectedVersion);
  const identity=readServiceWorkerReleaseIdentity({swSource,wrapperSource});
  exactVersion(identity.version);
  exactVersion(identity.previousVersion);
  exactVersion(identity.wrapperVersion);
  if(identity.wrapperVersion!==identity.version)fail('SERVICE_WORKER_WRAPPER_VERSION_MISMATCH');
  if(expected&&identity.version!==expected)fail('SERVICE_WORKER_RELEASE_VERSION_MISMATCH');
  if(identity.previousVersion===identity.version)fail('SERVICE_WORKER_LINEAGE_COLLAPSED');
  return {version:identity.version,previousVersion:identity.previousVersion};
}

export const SERVICE_WORKER_CANONICAL_IMPORT=CANONICAL_IMPORT;
