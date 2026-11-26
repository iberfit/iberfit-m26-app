// A published planning intention is not a measured outcome.
// Reuse the current-cycle selector and never publish a draft, private note,
// contradictory owner, unsynced record, or undated legacy objective.
import {selectCurrentTrainingCycle} from './planning-workflow.js';
import {parseCivilDate,reportCivilDate,isWithinCivilPeriod} from '../domain/civil-date.js';
import {evidenceNumber} from '../domain/evidence-signal.js';
const clean=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max):'';
const publicStatus=new Set(['published','publicado','active','activo']);
export function buildReportCycleObjective(state,clientId,{start,end,now=new Date()}={}){
 const owner=String(clientId||'').trim();
 if(!owner||!parseCivilDate(start)||!parseCivilDate(end)||start>end||end!==reportCivilDate(now))return null;
 const record=selectCurrentTrainingCycle(state?.collections?.trainingCycles,{clientId:owner,now});
 if(!record)return null;
 const body=record.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
 const values=(...keys)=>[record,body].flatMap(r=>keys.map(k=>r[k])).filter(v=>v!=null&&v!=='');
 const all=(...keys)=>values(...keys).map(v=>String(v).trim());
 const statuses=all('status','estado').map(v=>v.toLowerCase());
 if(!statuses.length||statuses.some(v=>!publicStatus.has(v)))return null;
 const sync=all('syncStatus','sync_status').map(v=>v.toLowerCase());
 if(!sync.length||sync.some(v=>v!=='clean')||record.serverConfirmed===false||body.serverConfirmed===false)return null;
 const publication=all('publishedAt','published_at');
 if(!publication.length||new Set(publication).size!==1||!isWithinCivilPeriod(publication[0],'0001-01-01',end,now))return null;
 const starts=all('startDate','start_date'),ends=all('endDate','end_date');
 if(new Set(starts).size!==1||new Set(ends).size!==1||!parseCivilDate(starts[0])||!parseCivilDate(ends[0])||starts[0]>end||ends[0]<end)return null;
 const goals=values('goal','objetivo').map(v=>clean(v,500));
 if(new Set(goals).size!==1||!goals[0])return null;
 const ids=all('id','entityId','entity_id');if(!ids.length||new Set(ids).size!==1)return null;
 // Pending/rejected/conflicting local commands cannot supply the goal.
 const id=ids[0];
 for(const list of [state?.pendingOperations,state?.conflicts,state?.rejectedOperations]){
  if(!Array.isArray(list))continue;
  if(list.some(r=>[r?.entityId,r?.entity_id,r?.command?.entityId,r?.command?.entity_id,r?.operation?.entityId].some(v=>String(v??'')===id)))return null;
 }
 const frequency=values('weeklyFrequency','weekly_frequency').map(v=>evidenceNumber(v,{min:1,max:14,integer:true}));
 const agreed=frequency.length&&frequency.every(v=>v!==null&&v===frequency[0])?frequency[0]:null;
 return Object.freeze({goal:goals[0],cycleName:clean(body.name??record.name??body.nombre??record.nombre,120)||'Ciclo de entrenamiento',start:starts[0],end:ends[0],weeklyFrequency:agreed});
}
export function cycleObjectiveEvidence(objective){
 if(!objective)return null;
 const suffix=' · Ciclo: '+objective.start+' a '+objective.end+(objective.weeklyFrequency!==null?' · Frecuencia acordada: '+objective.weeklyFrequency+'/semana':'')+'. Intención de planificación; logro no evaluado.';
 return Object.freeze({label:'Objetivo del ciclo vigente',text:objective.goal.slice(0,500-suffix.length)+suffix,source:'trainingCycles',quality:'planificación publicada'});
}
