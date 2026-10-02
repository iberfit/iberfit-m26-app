import { EVIDENCE_REGISTRY, NORM_SEX, REFERENCE_PERCENTILES } from './evidence-registry.js';

function finiteNumber(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function normalizeSex(value){const v=String(value||'').trim().toLowerCase();return v===NORM_SEX.FEMALE||v===NORM_SEX.MALE?v:NORM_SEX.UNSPECIFIED;}
function ageBand(age,{wblt=false}={}){
  if(age>=18&&age<=29)return '18-29';
  if(age<=39)return '30-39';
  if(age<=49)return '40-49';
  if(age<=59)return '50-59';
  if(age<=69)return '60-69';
  if(wblt&&age<=79)return '70-79';
  if(wblt&&age>=80&&age<=100)return '80+';
  if(!wblt&&age<=80)return '70-80';
  return null;
}
function resultBase(testId,rawValue,context){return {testId,rawValue,sexForNorms:normalizeSex(context.sexForNorms),ageYears:finiteNumber(context.ageYears),scored:false,score:null,grade10:null,category:null,percentileEstimate:null,percentileLabel:null,evidence:null,warnings:[]};}

export function validateNormContext(context={}){
  const errors=[];const sex=normalizeSex(context.sexForNorms);const age=finiteNumber(context.ageYears);
  if(sex===NORM_SEX.UNSPECIFIED)errors.push('sexForNorms');
  if(age===null||age<18||age>100)errors.push('ageYears');
  return {ok:errors.length===0,errors,sexForNorms:sex,ageYears:age};
}

function interpolatePercentile(raw,quantiles,percentiles=REFERENCE_PERCENTILES){
  if(!Array.isArray(quantiles)||quantiles.length!==percentiles.length)return null;
  if(raw<=quantiles[0])return {estimate:percentiles[0],label:`≤P${percentiles[0]}`,band:'below_p2_5'};
  const last=quantiles.length-1;
  if(raw>=quantiles[last])return {estimate:percentiles[last],label:`≥P${percentiles[last]}`,band:'p97_5_plus'};
  for(let index=0;index<last;index+=1){
    const low=Number(quantiles[index]),high=Number(quantiles[index+1]);
    if(raw<low||raw>high)continue;
    if(high===low)return {estimate:percentiles[index+1],label:`≈P${Math.round(percentiles[index+1])}`,band:`p${String(percentiles[index]).replace('.','_')}_p${String(percentiles[index+1]).replace('.','_')}`};
    const ratio=(raw-low)/(high-low);
    const estimate=percentiles[index]+ratio*(percentiles[index+1]-percentiles[index]);
    return {estimate:Number(estimate.toFixed(1)),label:`≈P${Math.round(estimate)}`,band:`p${String(percentiles[index]).replace('.','_')}_p${String(percentiles[index+1]).replace('.','_')}`};
  }
  return null;
}
function percentileCategory(percentile){
  const p=Number(percentile);
  if(!Number.isFinite(p))return null;
  if(p<25)return {key:'below_p25',label:'Por debajo de P25'};
  if(p<50)return {key:'p25_p49',label:'P25–P49'};
  if(p<75)return {key:'p50_p74',label:'P50–P74'};
  if(p<97.5)return {key:'p75_p97',label:'P75–P97,5'};
  return {key:'p97_5_plus',label:'P97,5 o superior'};
}
function percentileEvidence(norm,quantiles){
  return {
    sourceId:norm.sourceId,
    confidence:norm.confidence,
    percentileAnchors:{p2_5:quantiles[0],p25:quantiles[1],p50:quantiles[2],p75:quantiles[3],p97_5:quantiles[4]},
  };
}
function scorePercentileReference(out,norm,ctx,raw){
  const band=ageBand(ctx.ageYears);const q=band&&norm.bands?.[ctx.sexForNorms]?.[band];
  if(!q){out.warnings.push('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE');return out;}
  const percentile=interpolatePercentile(raw,q,norm.percentileKeys||REFERENCE_PERCENTILES);
  if(!percentile){out.warnings.push('NORM_REFERENCE_INTERPOLATION_FAILED');return out;}
  const score=Number(Math.max(0,Math.min(100,percentile.estimate)).toFixed(1));
  const category=percentileCategory(percentile.estimate);
  return {...out,scored:true,score,grade10:Number((score/10).toFixed(1)),category,percentileEstimate:percentile.estimate,percentileLabel:percentile.label,evidence:percentileEvidence(norm,q),warnings:[]};
}
function scoreWblt(out,norm,ctx,raw){
  const band=ageBand(ctx.ageYears,{wblt:true});const thresholds=band&&norm.bands?.[ctx.sexForNorms]?.[band];
  if(!thresholds){out.warnings.push('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE');return out;}
  let index=thresholds.findIndex((limit)=>raw<Number(limit));
  if(index<0)index=norm.categoryKeys.length-1;
  const key=norm.categoryKeys[index],label=norm.categoryLabels[key],score=Number(norm.iberfitScores[key]);
  const percentileRanges=[
    '<P2,3','P2,3–P15,9','P15,9–P25','P25–P75','P75–P84,1','P84,1–P97,7','>P97,7'
  ];
  return {...out,scored:true,score,grade10:Number((score/10).toFixed(1)),category:{key,label},percentileEstimate:null,percentileLabel:percentileRanges[index],evidence:{sourceId:norm.sourceId,confidence:norm.confidence,ageBand:band,categoryThresholds:[...thresholds]},warnings:[]};
}

export function scoreNormedTest({testId,value,context={},protocolId=null}){
  const raw=finiteNumber(value);const out=resultBase(testId,raw,context);const norm=EVIDENCE_REGISTRY[testId];
  if(!norm){out.warnings.push('NORM_TEST_UNKNOWN');return out;}
  if(raw===null||raw<0){out.warnings.push('NORM_VALUE_INVALID');return out;}
  const ctx=validateNormContext(context);if(!ctx.ok){out.warnings.push(...ctx.errors.map((x)=>`NORM_CONTEXT_${x.toUpperCase()}_REQUIRED`));return out;}
  if(norm.status==='reference_import_required'){out.evidence={sourceId:norm.sourceId,confidence:norm.confidence,status:norm.status};out.warnings.push('NORM_REFERENCE_TABLE_PENDING');return out;}
  if(testId==='push_up_standard'){
    if(protocolId&&protocolId!=='standard_max_valid_reps'){out.warnings.push('NORM_PROTOCOL_MISMATCH');return out;}
    const table=norm.tables.find((item)=>item.sex===ctx.sexForNorms&&ctx.ageYears>=item.minAge&&ctx.ageYears<=item.maxAge);
    if(!table){out.warnings.push('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE');return out;}
    const category=table.categories.find((item)=>raw>=item.min&&raw<=item.max);
    if(!category){out.warnings.push('NORM_REFERENCE_CATEGORY_MISSING');return out;}
    return {...out,scored:true,score:category.score,grade10:Number((category.score/10).toFixed(1)),category:{key:category.key,label:category.label},evidence:{sourceId:table.sourceId,confidence:table.confidence,population:table.population},warnings:table.confidence==='low_legacy'?['NORM_LEGACY_REFERENCE_REVIEW_REQUIRED']:[]};
  }
  if(testId==='chair_stand_30s'){
    if(protocolId&&protocolId!=='chair_stand_30s_standard'){out.warnings.push('NORM_PROTOCOL_MISMATCH');return out;}
    return scorePercentileReference(out,norm,ctx,raw);
  }
  if(testId==='one_minute_sit_to_stand'){
    if(protocolId&&protocolId!=='1msts_standard_60s'){out.warnings.push('NORM_PROTOCOL_MISMATCH');return out;}
    return scorePercentileReference(out,norm,ctx,raw);
  }
  if(testId==='weight_bearing_lunge'){
    if(protocolId&&protocolId!=='wblt_distance_cm'){out.warnings.push('NORM_PROTOCOL_MISMATCH');return out;}
    return scoreWblt(out,norm,ctx,raw);
  }
  out.warnings.push('NORM_SCORER_NOT_IMPLEMENTED');return out;
}

export function explainSexSpecificDifference(testId,value,ageYears){
  const protocolId=testId==='push_up_standard'?'standard_max_valid_reps':testId==='chair_stand_30s'?'chair_stand_30s_standard':testId==='one_minute_sit_to_stand'?'1msts_standard_60s':testId==='weight_bearing_lunge'?'wblt_distance_cm':null;
  const female=scoreNormedTest({testId,value,context:{sexForNorms:'female',ageYears},protocolId});
  const male=scoreNormedTest({testId,value,context:{sexForNorms:'male',ageYears},protocolId});
  return {testId,value,ageYears,female,male,sameClassification:female.category?.key===male.category?.key};
}

export const __normsInternals=Object.freeze({finiteNumber,normalizeSex,ageBand,interpolatePercentile,percentileCategory});
