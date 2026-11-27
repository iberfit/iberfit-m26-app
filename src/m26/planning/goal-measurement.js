// One optional measurable coaching intention per existing training cycle.
// A definition or baseline entered by a coach is not a verified achievement.
import {parseCivilDate,reportCivilDate} from '../domain/civil-date.js';
import {evidenceNumber,stableEvidenceJson} from '../domain/evidence-signal.js';

export const GOAL_UNITS=Object.freeze({kg:'kg',reps:'repeticiones',m:'m',km:'km',s:'s',min:'min',bpm:'lpm',w:'W',cm:'cm',percent:'%',points:'puntos',sessions:'sesiones'});
const INTEGER_UNITS=new Set(['reps','bpm','sessions']);
const FIELDS=Object.freeze({goalMetric:'metric',goalUnit:'unit',goalDirection:'direction',goalBaseline:'baseline',goalBaselineDate:'baselineDate',goalTarget:'target',goalDeadline:'deadline',goalProtocol:'protocol'});
export const GOAL_FORM_FIELDS=Object.freeze([...Object.keys(FIELDS),'goalEvidenceRef']);
// Stable reference to one explicitly selected assessment revision and metric.
// It is an identifier, not a claim that the source exists or is comparable.
export function parseGoalEvidenceRef(raw){
 if(typeof raw!=='string'||raw.length>300)return null;
 const parts=raw.split('|');if(parts.length!==3)return null;
 const [assessmentId,revision,metricId]=parts;
 if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(assessmentId)||!/^(?:0|[1-9][0-9]*)$/u.test(revision)||!Number.isSafeInteger(Number(revision))||!/^[a-z0-9-]+:(?:left|right|bilateral|not-applicable):[A-Za-z][A-Za-z0-9]*$/u.test(metricId))return null;
 return Object.freeze({assessmentId,revision:Number(revision),metricId});
}
const own=(x,k)=>Boolean(x&&Object.hasOwn(x,k));
const object=x=>Boolean(x&&typeof x==='object'&&!Array.isArray(x));
const blank=x=>x==null||(typeof x==='string'&&!x.trim());
const validText=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max&&!/[\u0000-\u001f\u007f]/u.test(v)?v.trim().replace(/\s+/gu,' '):null;
const civil=v=>typeof v==='string'&&parseCivilDate(v)?.iso===v?v:null;
const measured=(v,unit)=>evidenceNumber(typeof v==='string'?v.trim().replace(',','.'):v,{min:0,max:unit==='percent'?100:1000000,integer:INTEGER_UNITS.has(unit)});

// Reject unknown keys instead of forwarding arbitrary nested data to the server.
export function validateGoalMeasurement(input,{startDate,endDate,now=new Date()}={}){
 if(input===null||input===undefined)return {ok:true,value:null,errors:[]};
 if(!object(input))return {ok:false,value:null,errors:['goalMeasurement']};
 const errors=[];
 const allowed=new Set(['schemaVersion','evidenceRef',...Object.values(FIELDS)]);
 const evidenceRef=own(input,'evidenceRef')?input.evidenceRef:null;
 if(own(input,'evidenceRef')&&!parseGoalEvidenceRef(evidenceRef))errors.push('goalEvidenceRef');
 if(input.schemaVersion!==1||Object.keys(input).some(k=>!allowed.has(k)))errors.push('goalMeasurement');
 const metric=validText(input.metric,80),protocol=validText(input.protocol,180);
 const unit=typeof input.unit==='string'&&own(GOAL_UNITS,input.unit)?input.unit:null;
 const direction=['increase','decrease'].includes(input.direction)?input.direction:null;
 const baseline=unit?measured(input.baseline,unit):null,target=unit?measured(input.target,unit):null;
 const baselineDate=civil(input.baselineDate),deadline=civil(input.deadline),start=civil(startDate),end=civil(endDate),today=reportCivilDate(now);
 if(!metric)errors.push('goalMetric');if(!protocol)errors.push('goalProtocol');if(!unit)errors.push('goalUnit');if(!direction)errors.push('goalDirection');
 if(baseline===null)errors.push('goalBaseline');if(target===null)errors.push('goalTarget');
 if(!baselineDate||!today||baselineDate>today)errors.push('goalBaselineDate');
 if(!deadline||!start||!end||start>end||deadline<start||deadline>end||!baselineDate||deadline<baselineDate)errors.push('goalDeadline');
 if(baseline!==null&&target!==null&&direction&&((direction==='increase'&&target<=baseline)||(direction==='decrease'&&target>=baseline)))errors.push('goalTarget');
 return errors.length?{ok:false,value:null,errors:[...new Set(errors)]}:{ok:true,value:Object.freeze({schemaVersion:1,metric,unit,direction,baseline,baselineDate,target,deadline,protocol,...(evidenceRef?{evidenceRef}:{})}),errors:[]};
}
// Local drafts use the same flat field names as the existing form. Missing fields
// in older drafts restore as empty, rather than inheriting another cycle's goal.
export function goalMeasurementFormFields(source={}){
 const nested=object(source?.goalMeasurement)?source.goalMeasurement:{};
 return Object.fromEntries([...Object.entries(FIELDS),['goalEvidenceRef','evidenceRef']].map(([field,key])=>{
  const raw=own(source,field)?source[field]:nested[key];
  return [field,typeof raw==='number'&&Number.isFinite(raw)||typeof raw==='string'?String(raw):''];
 }));
}
export function goalMeasurementFromForm(raw={},options={}){
 if(!GOAL_FORM_FIELDS.some(k=>own(raw,k)))return undefined;
 const fields=goalMeasurementFormFields(raw);
 if(Object.values(fields).every(blank))return null;
 const value={schemaVersion:1,...Object.fromEntries(Object.entries(FIELDS).map(([k,v])=>[v,fields[k]])),...(fields.goalEvidenceRef?{evidenceRef:fields.goalEvidenceRef}:{})};
 const result=validateGoalMeasurement(value,options);
 if(!result.ok){const error=new Error('M26_GOAL_MEASUREMENT_INVALID:'+result.errors.join(','));error.userMessage='Completa la meta medible: indicador, unidad, dirección, línea base, fecha de medición, valor objetivo, plazo dentro del ciclo y protocolo. El objetivo debe avanzar en la dirección elegida. Conservamos el borrador.';throw error;}
 return result.value;
}
// Only read an explicit canonical definition. Wrapper/body disagreements and
// owner/date aliases never resolve by choosing the most convenient version.
export function readGoalMeasurement(record,{clientId,now=new Date()}={}){
 const rows=[record,record?.body].filter(object);
 const values=(keys)=>rows.flatMap(r=>keys.filter(k=>own(r,k)).map(k=>r[k]));
 const owners=values(['clientId','client_id','clienteId','cliente_id']).filter(x=>x!=null&&x!=='');
 if(!owners.length||owners.some(x=>typeof x!=='string'||!x.trim()||x!==owners[0])||(clientId!==undefined&&owners[0]!==clientId))return null;
 const unique=keys=>{const v=values(keys).filter(x=>x!=null&&x!=='');return v.length&&v.every(x=>x===v[0])?v[0]:null;};
 const declared=values(['goalMeasurement']);
 if(!declared.length||declared.some(x=>stableEvidenceJson(x)!==stableEvidenceJson(declared[0])))return null;
 const result=validateGoalMeasurement(declared[0],{startDate:unique(['startDate','start_date']),endDate:unique(['endDate','end_date']),now});
 return result.ok?result.value:null;
}
export function sameGoalMeasurement(existing,draft){
 if(!own(draft,'goalMeasurement'))return true; // historical form/command did not edit this field
 const raw=existing?.goalMeasurement;
 if(raw==null&&draft.goalMeasurement===null)return true;
 const valid=validateGoalMeasurement(raw,{startDate:existing?.startDate,endDate:existing?.endDate});
 return Boolean(valid.ok&&stableEvidenceJson(valid.value)===stableEvidenceJson(draft.goalMeasurement));
}
export function goalMeasurementText(goal){
 if(!goal||!own(GOAL_UNITS,goal.unit))return '';
 const unit=GOAL_UNITS[goal.unit];
 return goal.metric+': '+goal.baseline+' '+unit+' ('+goal.baselineDate+') → '+goal.target+' '+unit+' · '+(goal.direction==='increase'?'Aumentar':'Reducir')+' · plazo '+goal.deadline+'. Protocolo: '+goal.protocol+'. Línea base declarada; logro pendiente de revisión profesional.';
}
