// QA-only. Read ALREADY RECEIVED Playwright response bodies for size only.
// No HTTP calls, payload persistence, URL, identity, header, or JWT logging.
// Decoded response length does not equal Supabase billable Egress.
import {SUPABASE_ORIGIN} from './secure-current-source-auth.mjs';

const KNOWN=new Set([
 'iberfit_bootstrap_v26','iberfit_privileged_assurance_context_v65d',
 'iberfit_authorized_application_roles_v13','iberfit_application_context_v14',
 'iberfit_communication_bootstrap_v14','iberfit_appointment_change_requests_v13',
 'iberfit_notification_preferences_status_v1','iberfit_exercise_catalog_public_v1',
 'iberfit_exercise_measurement_profiles_public_v1','iberfit_exercise_media_manifest_v1',
 'iberfit_privileged_history_page_u38_qa','m26_backend_bootstrap_v43',
 'm26_wearable_bootstrap_v44',
]);
function fixedGroup(input){
  try{
    const url=new URL(input);
    if(url.origin!==SUPABASE_ORIGIN)return null;
    const p=url.pathname;
    if(p.startsWith('/rest/v1/rpc/')){
      const rpc=p.slice('/rest/v1/rpc/'.length);
      return KNOWN.has(rpc)?'rpc:'+rpc:'rpc:other';
    }
    if(p==='/rest/v1/domain_command_registry_v26')return 'rest:command-registry';
    if(p.startsWith('/rest/v1/'))return 'rest:other';
    if(p.startsWith('/auth/v1/'))return 'auth';
    if(p.startsWith('/storage/v1/object/authenticated/iberfit-profile-avatars/'))return 'storage:private-avatar';
    if(p.startsWith('/storage/v1/object/'))return 'storage:other-object';
    if(p.startsWith('/functions/v1/'))return 'edge:function';
    return 'other';
  }catch{return null;}
}


// Fixed labels only; neither array contents nor arbitrary keys leave this scope.
// One successful bootstrap sample per QA browser context is enough to rank
// collections, keeping CPU and privacy exposure bounded.
const BOOTSTRAP_SECTIONS=Object.freeze([
 'sessions','sessionExecutions','m26Entities','checkins','reports',
 'trainingCycles','iriAssessments','clientProfiles','domainEvents',
 'appointments','clients','habits','habitLogs','privateNotes',
]);
const BOOTSTRAP_MAX_PARSE_BYTES=4_000_000;
function bootstrapCollectionFootprint(bytes){
  try{
    if(!bytes||!Number.isSafeInteger(bytes.byteLength)
       ||bytes.byteLength>BOOTSTRAP_MAX_PARSE_BYTES)return null;
    const parsed=JSON.parse(new TextDecoder().decode(bytes));
    const data=parsed?.data;
    if(!data||typeof data!=='object'||Array.isArray(data))return null;
    const dataJsonBytes=Buffer.byteLength(JSON.stringify(data),'utf8');
    let knownJsonBytes=0;
    const sections=[];
    for(const name of BOOTSTRAP_SECTIONS){
      const rows=data[name];
      if(!Array.isArray(rows))continue;
      const jsonBytes=Buffer.byteLength(JSON.stringify(rows),'utf8');
      knownJsonBytes+=jsonBytes;
      sections.push({section:name,records:rows.length,jsonBytes});
    }
    sections.sort((a,b)=>b.jsonBytes-a.jsonBytes||a.section.localeCompare(b.section));
    const revisions=parsed?.remoteRevisions;
    const revisionBytes=revisions&&typeof revisions==='object'&&!Array.isArray(revisions)
      ?Buffer.byteLength(JSON.stringify(revisions),'utf8'):0;
    const revisionCount=revisions&&typeof revisions==='object'&&!Array.isArray(revisions)
      ?Object.keys(revisions).length:0;
    return {
      dataJsonBytes,knownSectionJsonBytes:knownJsonBytes,
      otherDataJsonBytes:Math.max(0,dataJsonBytes-knownJsonBytes),
      remoteRevisionJsonBytes:revisionBytes,remoteRevisionCount:revisionCount,
      sections,
    };
  }catch{return null;}
}

export function createQaSupabasePayloadFootprint(){
  const groups=new Map(),pending=new Set(),contexts=[];
  let closed=false;
  const onResponse=(response)=>{
    if(closed)return;
    const group=fixedGroup(response.url?.());
    if(!group)return;
    if(!groups.has(group)){
      if(groups.size>=28)return;
      groups.set(group,{group,requests:0,httpErrors:0,sampledResponses:0,
        sampledDecodedBytes:0,maxDecodedBytes:0,unreadableSamples:0,inFlightSamples:0});
    }
    const row=groups.get(group);
    row.requests++;
    if(Number(response.status?.())>=400)row.httpErrors++;
    if(row.sampledResponses+row.unreadableSamples+row.inFlightSamples>=3)return;
    row.inFlightSamples++;
    const work=Promise.resolve().then(()=>response.body()).then(bytes=>{
      const count=Number(bytes?.byteLength);
      if(!Number.isSafeInteger(count)||count<0)throw Error('UNREADABLE_QA_RESPONSE_SIZE');
      row.sampledDecodedBytes+=count;
      row.maxDecodedBytes=Math.max(row.maxDecodedBytes,count);
      row.sampledResponses++;
      // Existing response only; once per collector, never more network I/O.
      if(group==='rpc:iberfit_bootstrap_v26'
         &&Number(response.status?.())===200
         &&row.bootstrapParsedSamples!==1){
        const footprint=bootstrapCollectionFootprint(bytes);
        if(footprint){
          row.bootstrapParsedSamples=1;
          row.bootstrapDataJsonBytes=footprint.dataJsonBytes;
          row.bootstrapKnownSectionJsonBytes=footprint.knownSectionJsonBytes;
          row.bootstrapOtherDataJsonBytes=footprint.otherDataJsonBytes;
          row.bootstrapRemoteRevisionJsonBytes=footprint.remoteRevisionJsonBytes;
          row.bootstrapRemoteRevisionCount=footprint.remoteRevisionCount;
          row.bootstrapSections=footprint.sections;
        }
      }
    }).catch(()=>{row.unreadableSamples++;}).finally(()=>{
      row.inFlightSamples--;pending.delete(work);
    });
    pending.add(work);
  };
  return Object.freeze({
    attach(context){
      if(closed||typeof context?.on!=='function')throw Error('QA_EGRESS_CONTEXT_REQUIRED');
      context.on('response',onResponse);
      contexts.push(context);
    },
    async flush(){
      closed=true;
      for(const context of contexts)context.off?.('response',onResponse);
      await Promise.allSettled([...pending]);
      const endpoints=[...groups.values()].map(({inFlightSamples,...row})=>({
        ...row,
        meanSampledDecodedBytes:row.sampledResponses
          ?Math.round(row.sampledDecodedBytes/row.sampledResponses):null,
      })).sort((a,b)=>b.sampledDecodedBytes-a.sampledDecodedBytes||b.requests-a.requests);
      return {
        schema:'iberfit.qa.supabase.payload-footprint.v1',
        measurement:'sampled_decoded_payload_bytes_not_billable_egress',
        privacy:'aggregate_fixed_endpoint_labels_only',
        responseBodyPersisted:false,
        requestsIssuedByObserver:0,
        endpoints,
      };
    },
  });
}
