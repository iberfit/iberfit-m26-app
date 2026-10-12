import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function parseAndroidReleaseVersion(source){
  const code=source.match(/^\s*versionCode\s*=\s*(\d+)\s*$/mu);
  const name=source.match(/^\s*versionName\s*=\s*"([^"]+)"\s*$/mu);
  if(!code||!name||!Number.isSafeInteger(Number(code[1]))||
     Number(code[1])<1||Number(code[1])>2100000000||
     !/^\d+\.\d+\.\d+-phone$/u.test(name[1]))
    throw new Error('IBERFIT_ANDROID_RELEASE_VERSION_INVALID');
  return Object.freeze({code:Number(code[1]),name:name[1]});
}
export function assertAndroidReleaseUpgrade(current,previous,sameSource){
  if(!previous)return;
  if(sameSource){
    if(current.code!==previous.code||current.name!==previous.name)
      throw new Error('IBERFIT_ANDROID_SAME_SOURCE_VERSION_DRIFT');
  }else if(current.code<=previous.code||current.name===previous.name){
    throw new Error('IBERFIT_ANDROID_VERSION_CODE_NOT_MONOTONIC');
  }
}
async function main(){
  const manifest=JSON.parse(readFileSync('.iberfit/production-release.json','utf8'));
  const current=parseAndroidReleaseVersion(readFileSync(
    'native/android-host/phone-app/build.gradle.kts','utf8'));
  const repository=process.env.GITHUB_REPOSITORY;
  const token=process.env.GITHUB_TOKEN;
  if(!/^[\w.-]+\/[\w.-]+$/u.test(repository||'')||!token||
    !/^[a-f0-9]{40}$/u.test(manifest.sourceSha||''))
    throw new Error('IBERFIT_ANDROID_VERSION_GUARD_AUTH_OR_SOURCE_MISSING');
  const headers={'Authorization':'Bearer '+token,
    'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  async function get(endpoint){
    const url='https://api.github.com/repos/'+repository+'/'+endpoint;
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('IBERFIT_ANDROID_VERSION_HISTORY_UNAVAILABLE_'+response.status);
    return response.json();
  }
  const history=await get(
    'actions/workflows/connected360-android-production-release.yml/runs?status=success&per_page=100'
  );
  if(!Array.isArray(history.workflow_runs))
    throw new Error('IBERFIT_ANDROID_VERSION_HISTORY_INVALID');
  const prior=history.workflow_runs.find(run=>
    run.conclusion==='success'&&run.status==='completed'&&
    run.head_sha!==process.env.GITHUB_SHA&&
    /^release\/prod-/u.test(run.head_branch||'')&&
    /^[a-f0-9]{40}$/u.test(run.head_sha||'')
  );
  if(prior){
    async function content(path){
      const doc=await get('contents/'+path+'?ref='+prior.head_sha);
      if(doc.encoding!=='base64'||typeof doc.content!=='string')
        throw new Error('IBERFIT_ANDROID_RELEASE_HISTORY_CONTENT_INVALID');
      return Buffer.from(doc.content,'base64').toString('utf8');
    }
    const previousManifest=JSON.parse(await content('.iberfit/production-release.json'));
    const previousVersion=parseAndroidReleaseVersion(
      await content('native/android-host/phone-app/build.gradle.kts'));
    if(!/^[a-f0-9]{40}$/u.test(previousManifest.sourceSha||''))
      throw new Error('IBERFIT_ANDROID_PREVIOUS_SOURCE_INVALID');
    assertAndroidReleaseUpgrade(current,previousVersion,
      previousManifest.sourceSha===manifest.sourceSha);
    console.log('IBERFIT_ANDROID_PREVIOUS_RELEASE',prior.id,
      previousVersion.code,previousVersion.name);
  }
  console.log('IBERFIT_ANDROID_VERSION_VERIFIED',current.code,current.name,
    'source',manifest.sourceSha);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
}
