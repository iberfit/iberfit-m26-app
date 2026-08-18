import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import lighthouse from 'lighthouse';
import {chromium} from '@playwright/test';
import {managedChromiumSandboxArgs} from './chromium-launch-policy.mjs';

const require=createRequire(import.meta.url);
const contract=require('../../lighthouserc.cjs');

function invariant(condition,message){
  if(!condition)throw new Error(message);
}

function median(values){
  const sorted=[...values].sort((a,b)=>a-b);
  invariant(sorted.length>0,'RC64_2A_MEDIAN_EMPTY');
  return sorted[Math.floor(sorted.length/2)];
}

function sleep(ms){
  return new Promise((resolve)=>setTimeout(resolve,ms));
}

async function waitFor(url,server,timeoutMs=15_000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){
    if(server.exitCode!==null){
      throw new Error(`RC64_2A_SERVER_EXITED_EARLY:${server.exitCode}`);
    }
    try{
      const response=await fetch(url,{cache:'no-store'});
      if(response.ok)return;
    }catch{}
    await sleep(150);
  }
  throw new Error(`RC64_2A_SERVER_TIMEOUT:${url}`);
}

async function waitForExit(child,timeoutMs){
  if(child.exitCode!==null)return true;
  return await new Promise((resolve)=>{
    let settled=false;
    const finish=(value)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      child.off('exit',onExit);
      resolve(value);
    };
    const onExit=()=>finish(true);
    const timer=setTimeout(()=>finish(false),timeoutMs);
    child.once('exit',onExit);
  });
}

async function readDevToolsPort(activePortPath){
  try{
    const [portLine]=String(await readFile(activePortPath,'utf8')).trim().split(/\r?\n/u);
    const port=Number(portLine);
    return Number.isInteger(port)&&port>0&&port<=65535 ? port : null;
  }catch(error){
    if(['ENOENT','EBUSY','EPERM','EACCES'].includes(error?.code))return null;
    throw error;
  }
}

async function launchManagedChromium(profileDir,chromePath){
  await rm(profileDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  await mkdir(profileDir,{recursive:true});

  const chrome=spawn(
    chromePath,
    [
      '--headless=new',
      ...managedChromiumSandboxArgs({host:contract.host}),
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      'about:blank',
    ],
    {cwd:process.cwd(),stdio:['ignore','ignore','pipe'],windowsHide:true},
  );

  let stderr='';
  chrome.stderr.on('data',(chunk)=>{stderr+=String(chunk);});

  const activePortPath=path.join(profileDir,'DevToolsActivePort');
  const started=Date.now();
  while(Date.now()-started<15_000){
    if(chrome.exitCode!==null){
      throw new Error(`RC64_2A_CHROME_EXITED_EARLY:${chrome.exitCode}:${stderr.trim()}`);
    }

    const port=await readDevToolsPort(activePortPath);
    if(port!==null){
      return Object.freeze({chrome,port,profileDir,getStderr:()=>stderr});
    }

    await sleep(100);
  }

  chrome.kill('SIGTERM');
  throw new Error(`RC64_2A_CHROME_DEBUG_PORT_TIMEOUT:${stderr.trim()}`);
}

async function stopManagedChromium(session){
  const {chrome,profileDir}=session;

  if(chrome.exitCode===null){
    chrome.kill('SIGTERM');
    const graceful=await waitForExit(chrome,3_000);
    if(!graceful&&chrome.exitCode===null){
      chrome.kill('SIGKILL');
      await waitForExit(chrome,3_000);
    }
  }

  try{
    await rm(profileDir,{recursive:true,force:true,maxRetries:8,retryDelay:250});
  }catch(error){
    console.warn(`RC64_2A_PROFILE_CLEANUP_DEFERRED=${error?.code||error?.name||'UNKNOWN'}:${profileDir}`);
  }
}

const root=process.cwd();
const candidate=path.resolve(root,contract.target);
const staticServer=path.resolve(root,'qa','rc64','static-server.mjs');
const chromePath=chromium.executablePath();
const outputDir=path.resolve(root,'.lighthouseci','rc64-2a');
const profileRoot=path.join(os.tmpdir(),'iberfit-rc64-lighthouse-profiles');

invariant(existsSync(candidate),'RC64_2A_CANDIDATE_MISSING');
invariant(existsSync(staticServer),'RC64_2A_STATIC_SERVER_MISSING');
invariant(chromePath&&existsSync(chromePath),'RC64_2A_CHROMIUM_MISSING');
invariant(contract.schema==='iberfit.rc64.2a.lighthouse-budget.v1','RC64_2A_BUDGET_SCHEMA_INVALID');
invariant(contract.host==='127.0.0.1','RC64_2A_LIGHTHOUSE_HOST_MUST_BE_IPV4_LOOPBACK');
invariant(contract.runs===3,'RC64_2A_RUN_COUNT_INVALID');

await rm(outputDir,{recursive:true,force:true});
await mkdir(outputDir,{recursive:true});
await mkdir(profileRoot,{recursive:true});

const server=spawn(
  process.execPath,
  [staticServer,String(contract.port),contract.host],
  {cwd:candidate,stdio:['ignore','pipe','pipe'],windowsHide:true},
);
let serverStdout='';
let serverStderr='';
server.stdout.on('data',(chunk)=>{serverStdout+=String(chunk);});
server.stderr.on('data',(chunk)=>{serverStderr+=String(chunk);});

const url=`http://${contract.host}:${contract.port}/`;
const runs=[];

try{
  await waitFor(url,server);

  for(let index=1;index<=contract.runs;index+=1){
    const outputPath=path.join(outputDir,`run-${index}.json`);
    const profileDir=path.join(profileRoot,`run-${index}-${process.pid}-${Date.now()}`);
    const session=await launchManagedChromium(profileDir,chromePath);

    try{
      const result=await lighthouse(url,{
        port:session.port,
        hostname:'127.0.0.1',
        logLevel:'silent',
        output:'json',
        onlyCategories:['performance'],
        formFactor:'mobile',
      });

      invariant(result?.lhr,'RC64_2A_LIGHTHOUSE_RESULT_MISSING');
      const lhr=result.lhr;
      await writeFile(outputPath,`${JSON.stringify(lhr,null,2)}\n`,'utf8');

      const run=Object.freeze({
        performanceScore:Number(lhr.categories?.performance?.score),
        lcpMs:Number(lhr.audits?.['largest-contentful-paint']?.numericValue),
        cls:Number(lhr.audits?.['cumulative-layout-shift']?.numericValue),
        tbtMs:Number(lhr.audits?.['total-blocking-time']?.numericValue),
      });

      for(const [key,value] of Object.entries(run)){
        invariant(Number.isFinite(value),`RC64_2A_METRIC_INVALID:${key}:${value}`);
      }
      runs.push(run);
    }catch(error){
      const chromeStderr=session.getStderr().trim();
      if(chromeStderr)console.error(`RC64_2A_CHROME_STDERR=${chromeStderr}`);
      throw error;
    }finally{
      await stopManagedChromium(session);
    }
  }

  const summary=Object.freeze({
    schema:'iberfit.rc64.2a.lighthouse-result.v1',
    target:contract.target,
    aggregation:'median',
    runCount:runs.length,
    performanceScore:median(runs.map((item)=>item.performanceScore)),
    lcpMs:median(runs.map((item)=>item.lcpMs)),
    cls:median(runs.map((item)=>item.cls)),
    tbtMs:median(runs.map((item)=>item.tbtMs)),
    budgets:contract.budgets,
  });

  const summaryPath=path.join(outputDir,'summary.json');
  await writeFile(summaryPath,`${JSON.stringify(summary,null,2)}\n`,'utf8');
  console.log(`RC64_2A_LIGHTHOUSE_SUMMARY=${JSON.stringify(summary)}`);

  const failures=[];
  if(summary.performanceScore<contract.budgets.performanceScoreMin){
    failures.push(`performanceScore:${summary.performanceScore}<${contract.budgets.performanceScoreMin}`);
  }
  if(summary.lcpMs>contract.budgets.lcpMaxMs){
    failures.push(`lcpMs:${summary.lcpMs}>${contract.budgets.lcpMaxMs}`);
  }
  if(summary.cls>contract.budgets.clsMax){
    failures.push(`cls:${summary.cls}>${contract.budgets.clsMax}`);
  }
  if(summary.tbtMs>contract.budgets.tbtMaxMs){
    failures.push(`tbtMs:${summary.tbtMs}>${contract.budgets.tbtMaxMs}`);
  }

  if(failures.length){
    throw new Error(`RC64_2A_LIGHTHOUSE_BUDGET_FAILED:${failures.join(',')}`);
  }

  console.log('RC64_2A_LIGHTHOUSE_BUDGET=PASS');
}catch(error){
  if(serverStdout.trim())console.error(`RC64_2A_SERVER_STDOUT=${serverStdout.trim()}`);
  if(serverStderr.trim())console.error(`RC64_2A_SERVER_STDERR=${serverStderr.trim()}`);
  throw error;
}finally{
  if(server.exitCode===null){
    server.kill('SIGTERM');
    await waitForExit(server,2_000);
  }
}
