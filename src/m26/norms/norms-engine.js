import { EVIDENCE_REGISTRY, NORM_SEX } from './evidence-registry.js';

function finiteNumber(value){ const n=Number(value); return Number.isFinite(n)?n:null; }
function normalizeSex(value){ const v=String(value||'').trim().toLowerCase(); return v===NORM_SEX.FEMALE||v===NORM_SEX.MALE?v:NORM_SEX.UNSPECIFIED; }
function ageBand(age){
  if(age>=18&&age<=29) return '18-29'; if(age<=39) return '30-39'; if(age<=49) return '40-49';
  if(age<=59) return '50-59'; if(age<=69) return '60-69'; if(age<=80) return '70-80'; return null;
}
function resultBase(testId, rawValue, context){ return {testId,rawValue,sexForNorms:normalizeSex(context.sexForNorms),ageYears:finiteNumber(context.ageYears),scored:false,score:null,category:null,evidence:null,warnings:[]}; }

export function validateNormContext(context={}){
  const errors=[]; const sex=normalizeSex(context.sexForNorms); const age=finiteNumber(context.ageYears);
  if(sex===NORM_SEX.UNSPECIFIED) errors.push('sexForNorms');
  if(age===null||age<18||age>100) errors.push('ageYears');
  return {ok:errors.length===0,errors,sexForNorms:sex,ageYears:age};
}

export function scoreNormedTest({testId,value,context={},protocolId=null}){
  const raw=finiteNumber(value); const out=resultBase(testId,raw,context); const norm=EVIDENCE_REGISTRY[testId];
  if(!norm){ out.warnings.push('NORM_TEST_UNKNOWN'); return out; }
  if(raw===null||raw<0){ out.warnings.push('NORM_VALUE_INVALID'); return out; }
  const ctx=validateNormContext(context); if(!ctx.ok){ out.warnings.push(...ctx.errors.map(x=>`NORM_CONTEXT_${x.toUpperCase()}_REQUIRED`)); return out; }
  if(norm.status==='reference_import_required'){ out.evidence={sourceId:norm.sourceId,confidence:norm.confidence,status:norm.status}; out.warnings.push('NORM_REFERENCE_TABLE_PENDING'); return out; }
  if(testId==='push_up_standard'){
    if(protocolId && protocolId!=='standard_max_valid_reps'){ out.warnings.push('NORM_PROTOCOL_MISMATCH'); return out; }
    const table=norm.tables.find(t=>t.sex===ctx.sexForNorms&&ctx.ageYears>=t.minAge&&ctx.ageYears<=t.maxAge);
    if(!table){ out.warnings.push('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE'); return out; }
    const category=table.categories.find(c=>raw>=c.min&&raw<=c.max);
    return {...out,scored:true,score:category.score,category:{key:category.key,label:category.label},evidence:{sourceId:table.sourceId,confidence:table.confidence,population:table.population},warnings:table.confidence==='low_legacy'?['NORM_LEGACY_REFERENCE_REVIEW_REQUIRED']:[]};
  }
  if(testId==='chair_stand_30s'){
    if(protocolId && protocolId!=='chair_stand_30s_standard'){ out.warnings.push('NORM_PROTOCOL_MISMATCH'); return out; }
    const band=ageBand(ctx.ageYears); const q=band&&norm.bands[ctx.sexForNorms]?.[band];
    if(!q){ out.warnings.push('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE'); return out; }
    const [p25,p50,p75]=q; let category,score;
    if(raw<p25){ category={key:'below_p25',label:'Bajo P25'}; score=20; }
    else if(raw<p50){ category={key:'p25_p49',label:'P25–P49'}; score=40; }
    else if(raw<p75){ category={key:'p50_p74',label:'P50–P74'}; score=60; }
    else { category={key:'p75_plus',label:'P75 o superior'}; score=80; }
    return {...out,scored:true,score,category,evidence:{sourceId:norm.sourceId,confidence:norm.confidence,percentileAnchors:{p25,p50,p75}},warnings:[]};
  }
  out.warnings.push('NORM_SCORER_NOT_IMPLEMENTED'); return out;
}

export function explainSexSpecificDifference(testId,value,ageYears){
  const female=scoreNormedTest({testId,value,context:{sexForNorms:'female',ageYears},protocolId:testId==='push_up_standard'?'standard_max_valid_reps':'chair_stand_30s_standard'});
  const male=scoreNormedTest({testId,value,context:{sexForNorms:'male',ageYears},protocolId:testId==='push_up_standard'?'standard_max_valid_reps':'chair_stand_30s_standard'});
  return {testId,value,ageYears,female,male,sameClassification:female.category?.key===male.category?.key};
}
