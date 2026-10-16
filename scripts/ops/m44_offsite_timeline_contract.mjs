// M44: measured OFFSITE TRANSPORT timing, not a disaster recovery RTO/RPO.
// Inputs must be captured from GitHub Actions and Google Drive by an
// authorized operator or connector. This module NEVER independently authenticates
// provenance and MUST NOT be consumed as a PROD release gate.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const P='IBERFIT_M44_OFFSITE_TIMELINE_';
export const SCHEMA='iberfit.m44.offsite-timeline.v1';
const HASH64=/^[a-f0-9]{64}$/;
const SHA40=/^[a-f0-9]{40}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const MAX_RUN_MS=60*60*1000;
const MAX_HANDOFF_MS=24*60*60*1000;
const err=s=>{throw Error(P+s);};
function exact(o,names){
 return !!o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.keys(o).length===names.length&&
  Object.keys(o).every(x=>names.includes(x));
}
function utc(s){
 if(typeof s!=='string'||!UTC.test(s))err('TIMESTAMP_INVALID');
 const t=Date.parse(s);
 if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,19)!==s.slice(0,19))
  err('TIMESTAMP_INVALID');
 return t;
}
export function measureOffsiteTimeline(evidence,{nowMs=Date.now()}={}){
 if(!Number.isFinite(nowMs)||nowMs<=0)err('CLOCK_INVALID');
 if(!exact(evidence,['schema','workflow','drive'])||evidence.schema!==SCHEMA)
  err('SCHEMA_INVALID');
 const w=evidence.workflow,d=evidence.drive;
 if(!exact(w,['id','sourceSha','status','conclusion','startedAt','finishedAt','artifactSha256','artifactBytes'])||
    !exact(d,['createdAt','verifiedAt','sha256','bytes','shared','ownerCount']))
  err('SHAPE_INVALID');
 if(!Number.isSafeInteger(w.id)||w.id<=0||!SHA40.test(w.sourceSha)||
    w.status!=='completed'||w.conclusion!=='success'||
    !HASH64.test(w.artifactSha256)||!HASH64.test(d.sha256)||
    !Number.isSafeInteger(w.artifactBytes)||w.artifactBytes<=0||
    !Number.isSafeInteger(d.bytes)||d.bytes<=0||
    w.artifactBytes!==d.bytes||w.artifactSha256!==d.sha256)
  err('SOURCE_DIGEST_OR_STATUS_INVALID');
 if(d.shared!==false||d.ownerCount!==1)err('CLAIMED_PRIVACY_INCORRECT');
 const start=utc(w.startedAt),end=utc(w.finishedAt);
 const created=utc(d.createdAt),verified=utc(d.verifiedAt);
 if(start>nowMs+60000||verified>nowMs+60000)err('EVENT_FROM_FUTURE');
 // Recording an external copy after the workflow is meaningful only with
 // ordered timestamps. Never accept an arbitrary clock or future timestamps.
 if(end<start||created<end||verified<created||
    end-start>MAX_RUN_MS||created-end>MAX_HANDOFF_MS||
    verified-created>MAX_HANDOFF_MS)
  err('EVENT_ORDER_OR_WINDOW_INVALID');
 const seconds=x=>Math.round(x/1000);
 return Object.freeze({
  workflowExecutionSeconds:seconds(end-start),
  externalTransferSeconds:seconds(created-end),
  fromWorkflowStartToOffsiteSeconds:seconds(created-start),
  driveReadbackDelaySeconds:seconds(verified-created),
  digestEqual:true,
  // These inputs are *asserted observations*, not live provider API proofs.
  providerProvenanceAuthenticatedByThisCheck:false,
  operatorKeyRestorationVerified:false,
  sourceDatabaseSnapshotTimestampVerified:false,
  lastDurableWriteTimestampVerified:false,
  exactDatabaseStorageConsistencyVerified:false,
  fullPlatformRestoreMeasured:false,
  rtoSeconds:null,
  rpoSeconds:null,
  rtoCertified:false,
  rpoCertified:false,
  platformRecoveryVerified:false,
 });
}
function safeFile(file){
 if(typeof file!=='string'||!file)err('USAGE');
 let s;try{s=fs.lstatSync(file);}catch{err('FILE_UNAVAILABLE');}
 if(!s.isFile()||s.isSymbolicLink()||s.size<200||s.size>8192)
  err('FILE_INVALID');
 let e;try{e=JSON.parse(fs.readFileSync(file,'utf8'));}catch{err('JSON_INVALID');}
 return e;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)err('USAGE');
  const m=measureOffsiteTimeline(safeFile(process.argv[2]));
  process.stdout.write(P+'OBSERVED_ONLY:workflow_seconds='+
   m.workflowExecutionSeconds+':offsite_seconds='+m.fromWorkflowStartToOffsiteSeconds+
   ':RTO_UNVERIFIED:RPO_UNVERIFIED:platform_NOT_certified\n');
 }catch(e){
  const msg=String(e?.message||'');
  process.stderr.write((msg.startsWith(P)?msg:P+'CHECK_FAILED')+'\n');
  process.exitCode=1;
 }
}
