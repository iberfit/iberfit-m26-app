import { EVIDENCE_SOURCES } from './evidence-registry.js';
import { scoreNormedTest, validateNormContext } from './norms-engine.js';

export const IRI_SCORING_VERSION='iri-scoring-2026.10-v2';
export const IRI_SCORING_DOMAINS=Object.freeze(['mobility','strength','cardio']);
export const WBLT_ASYMMETRY_MDC_CM=1.9;

function finite(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
function dateAgeYears(birthDate,assessmentDate){
  const birth=String(birthDate||'').match(/^(\d{4})-(\d{2})-(\d{2})/u),assessment=String(assessmentDate||'').match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if(!birth||!assessment)return null;
  let age=Number(assessment[1])-Number(birth[1]);
  if(Number(assessment[2])<Number(birth[2])||(Number(assessment[2])===Number(birth[2])&&Number(assessment[3])<Number(birth[3])))age-=1;
  return age>=0&&age<=120?age:null;
}
function contextFrom(draft={}){
  const profile=draft.personProfile||{};
  return {
    sexForNorms:draft.sexForNorms??profile.sexForNorms,
    ageYears:finite(draft.ageYears)??dateAgeYears(draft.birthDate??profile.birthDate,draft.assessmentDate),
  };
}
function protocolRecordValid(draft={},testId,side=null){
  const records=Array.isArray(draft.protocolRecords)?draft.protocolRecords:Array.isArray(draft.protocol_records)?draft.protocol_records:[];
  const matched=records.filter((record)=>String(record?.testId??record?.test_id??'')===testId&&(side===null||String(record?.side??'')===side));
  if(!matched.length)return null;
  return matched.every((record)=>record?.valid===true);
}
function sourceSnapshot(sourceId){
  const source=EVIDENCE_SOURCES[sourceId];
  return source?Object.freeze({sourceId,...source}):Object.freeze({sourceId});
}
function scoredTest({key,domain,testId,value,context,protocolId,valid=true,side=null}){
  if(valid!==true||value===null||value===undefined||value==='')return Object.freeze({key,domain,testId,side,available:value!==null&&value!==undefined&&value!=='',valid:Boolean(valid),scored:false,score:null,grade10:null,category:null,percentileLabel:null,warnings:valid===true?['IRI_SCORE_VALUE_MISSING']:['IRI_SCORE_PROTOCOL_INVALID']});
  const result=scoreNormedTest({testId,value,context,protocolId});
  return Object.freeze({key,domain,side,available:true,valid:true,...result});
}
function mobilityDomain(draft,context){
  const ankle=draft.mobility?.ankle||{};
  const leftValue=ankle.leftBest??draft.weightBearingLungeLeft;
  const rightValue=ankle.rightBest??draft.weightBearingLungeRight;
  const legacyAverage=draft.weightBearingLunge;
  const legacyBilateral=leftValue===undefined&&rightValue===undefined;
  const leftValidity=protocolRecordValid(draft,'weight-bearing-lunge',legacyBilateral?null:'left');
  const rightValidity=legacyBilateral?null:protocolRecordValid(draft,'weight-bearing-lunge','right');
  const left=scoredTest({key:'ankle_left',domain:'mobility',testId:'weight_bearing_lunge',value:leftValue??legacyAverage,context,protocolId:'wblt_distance_cm',valid:leftValidity!==false,side:legacyBilateral?'bilateral':'left'});
  const right=legacyBilateral
    ?null
    :scoredTest({key:'ankle_right',domain:'mobility',testId:'weight_bearing_lunge',value:rightValue,context,protocolId:'wblt_distance_cm',valid:rightValidity!==false,side:'right'});
  const sides=[left,right].filter(Boolean),scored=sides.filter((item)=>item.scored);
  const score=scored.length?Math.min(...scored.map((item)=>Number(item.score))):null;
  const leftRaw=finite(leftValue),rightRaw=finite(rightValue);
  const asymmetryCm=leftRaw!==null&&rightRaw!==null?Number(Math.abs(leftRaw-rightRaw).toFixed(1)):null;
  const exceedsMdc=asymmetryCm!==null&&asymmetryCm>WBLT_ASYMMETRY_MDC_CM;
  return Object.freeze({
    domain:'mobility',label:'Movilidad',score100:score,score10:score===null?null:Number((score/10).toFixed(1)),
    scored:score!==null,tests:Object.freeze(sides),
    signal:Object.freeze({kind:'wblt_asymmetry',differenceCm:asymmetryCm,thresholdCm:WBLT_ASYMMETRY_MDC_CM,exceedsTypicalMdc:exceedsMdc,source:sourceSnapshot('powden-2015-wblt-reliability'),message:asymmetryCm===null?'Sin comparación bilateral':exceedsMdc?'La diferencia entre lados supera el MDC intraevaluador típico de 1,9 cm; confirmar técnica y seguirla en reevaluación.':'La diferencia entre lados no supera el MDC intraevaluador típico de 1,9 cm.'}),
    aggregation:'limiting_side',warnings:Object.freeze(scored.flatMap((item)=>item.warnings||[])),
  });
}
function strengthDomain(draft,context){
  const chair=draft.strength?.chairStand??draft.strengthAssessment?.chairStand??draft.strengthPatterns?.chairStand??{};
  const value=chair.repetitions??draft.chairStand30s;
  const valid=chair.valid===undefined?true:chair.valid===true;
  const test=scoredTest({key:'chair_stand_30s',domain:'strength',testId:'chair_stand_30s',value,context,protocolId:'chair_stand_30s_standard',valid});
  const fieldSquat=draft.strength?.squat60s??draft.strengthAssessment?.squat60s??{};
  const note=!test.scored&&fieldSquat.valid===true&&finite(fieldSquat.repetitions)!==null
    ?'Sentadilla libre de 1 minuto registrada como baseline individual; no utiliza baremo automático.'
    :null;
  return Object.freeze({domain:'strength',label:'Fuerza funcional',score100:test.scored?test.score:null,score10:test.scored?test.grade10:null,scored:test.scored,tests:Object.freeze([test]),aggregation:'chair_stand_reference',warnings:Object.freeze(test.warnings||[]),note});
}
function cardioDomain(draft,context){
  const cardio=draft.cardio||{};
  const protocol=String(cardio.protocol??draft.cardioProtocol??'');
  const repetitions=cardio.repetitions??draft.oneMinuteSitToStandRepetitions;
  const valid=(cardio.valid??draft.cardioValid)===true;
  if(protocol!=='1msts-standard'){
    const note=protocol==='ymca-3min-standard'
      ?'YMCA se conserva como resultado descriptivo; no utiliza baremos 1MSTS.'
      :protocol==='treadmill-3min-field'
        ?'Cinta 3 min registrada como baseline individual con recuperación de FC; no utiliza baremo automático ni se interpreta como YMCA.'
        :protocol==='iberfit-3min-adapted'
          ?'Step adaptado histórico: sólo continuidad individual, sin baremo YMCA.'
          :'No hay un 1MSTS estándar válido para puntuar.';
    return Object.freeze({domain:'cardio',label:'Capacidad funcional',score100:null,score10:null,scored:false,tests:Object.freeze([]),aggregation:'protocol_specific',warnings:Object.freeze(protocol?['IRI_SCORE_CARDIO_PROTOCOL_NOT_NORMED']:['IRI_SCORE_CARDIO_MISSING']),note});
  }
  const test=scoredTest({key:'one_minute_sit_to_stand',domain:'cardio',testId:'one_minute_sit_to_stand',value:repetitions,context,protocolId:'1msts_standard_60s',valid:valid&&Number(cardio.durationSeconds??60)===60});
  return Object.freeze({domain:'cardio',label:'Capacidad funcional',score100:test.scored?test.score:null,score10:test.scored?test.grade10:null,scored:test.scored,tests:Object.freeze([test]),aggregation:'1msts_reference',warnings:Object.freeze(test.warnings||[])});
}
function globalScore(domains){
  const scored=domains.filter((domain)=>domain.scored&&Number.isFinite(Number(domain.score100)));
  const coverage={eligibleDomains:IRI_SCORING_DOMAINS.length,scoredDomains:scored.length,percent:Math.round(scored.length/IRI_SCORING_DOMAINS.length*100)};
  if(scored.length<2)return Object.freeze({available:false,score100:null,score10:null,label:'Cobertura insuficiente para nota global',coverage,confidence:'insufficient',aggregation:'equal_weight_available_domains'});
  const score100=Number((scored.reduce((sum,item)=>sum+Number(item.score100),0)/scored.length).toFixed(1));
  const confidence=scored.length===3&&domains.every((item)=>(item.warnings||[]).length===0)?'high':'moderate';
  return Object.freeze({available:true,score100,score10:Number((score100/10).toFixed(1)),label:`Puntuación funcional IRI · ${scored.length}/3 dominios puntuables`,coverage,confidence,aggregation:'equal_weight_available_domains'});
}

function actionableInsights(domains){
  const strengths=[];const priorities=[];
  const mobility=domains.find((item)=>item.domain==='mobility');
  const strength=domains.find((item)=>item.domain==='strength');
  const cardio=domains.find((item)=>item.domain==='cardio');
  if(mobility?.scored&&mobility.score100>=100)strengths.push('Movilidad de tobillo dentro o por encima del rango central de referencia en el lado limitante.');
  if(mobility?.scored&&mobility.score100<75)priorities.push('Priorizar movilidad de tobillo del lado limitante y repetir WBLT con el mismo protocolo.');
  if(mobility?.signal?.exceedsTypicalMdc)priorities.push('Confirmar y seguir la diferencia bilateral de tobillo; supera el MDC intraevaluador típico de 1,9 cm.');
  if(strength?.scored&&strength.score100>=75)strengths.push('Fuerza funcional de tren inferior situada en P75 o superior para la referencia compatible.');
  if(strength?.scored&&strength.score100<25)priorities.push('Priorizar fuerza funcional de tren inferior y controlar la respuesta con silla 30 s comparable.');
  if(cardio?.scored&&cardio.score100>=75)strengths.push('Capacidad funcional 1MSTS situada en P75 o superior para la referencia compatible.');
  if(cardio?.scored&&cardio.score100<25)priorities.push('Priorizar capacidad funcional y repetir 1MSTS con la misma configuración.');
  return Object.freeze({
    strengths:Object.freeze(strengths.slice(0,3)),
    priorities:Object.freeze(priorities.slice(0,3)),
    note:'Sugerencias automáticas para revisión del Coach; no sustituyen la interpretación profesional ni se aplican como prescripción automática.',
  });
}

export function scoreIriPerformance(draft={}){
  const context=contextFrom(draft);const ctx=validateNormContext(context);
  const mobility=mobilityDomain(draft,context),strength=strengthDomain(draft,context),cardio=cardioDomain(draft,context);
  const domains=Object.freeze([mobility,strength,cardio]);const global=globalScore(domains);
  const legacyResults=[];
  const pushVariant=draft.strength?.push?.variant??draft.strengthAssessment?.push?.variant;
  const pushValid=draft.strength?.push?.valid??draft.strengthAssessment?.push?.valid;
  const pushValue=draft.strength?.push?.repetitions??draft.strengthAssessment?.push?.repetitions??draft.pushUps;
  if(pushValue!==undefined&&pushValue!==null&&pushValue!==''&&(pushVariant===undefined||pushVariant==='standard')&&(pushValid===undefined||pushValid===true))legacyResults.push(scoreNormedTest({testId:'push_up_standard',value:pushValue,context,protocolId:'standard_max_valid_reps'}));
  const chair=domains.find((item)=>item.domain==='strength')?.tests?.[0];if(chair?.available)legacyResults.push({...chair});
  return Object.freeze({
    schema:'iberfit-iri-scoring-v2',
    engineVersion:IRI_SCORING_VERSION,
    context:Object.freeze({...ctx}),
    domains,
    domainScores:Object.freeze(Object.fromEntries(domains.map((item)=>[item.domain,item]))),
    global,
    compositeScore:null,
    aggregation:'per_test_only',
    domainAggregation:'equal_weight_available_domains',
    results:Object.freeze(legacyResults),
    coverage:global.coverage,
    composition:Object.freeze({scored:false,label:'Composición corporal descriptiva',reason:'La bioimpedancia depende del método y las condiciones; no participa en la nota funcional global.'}),
    reviewRequired:!ctx.ok||domains.some((item)=>(item.warnings||[]).length>0),
    evidenceSources:Object.freeze(['mcbride-2026-wblt','powden-2015-wblt-reliability','barros-poblete-2025-chile','otto-yanez-2025-chile-1msts'].map(sourceSnapshot)),
    insights:actionableInsights(domains),
  });
}

export const scoreIriFirstSession=scoreIriPerformance;
export const __iriScoringInternals=Object.freeze({finite,dateAgeYears,contextFrom,protocolRecordValid,mobilityDomain,strengthDomain,cardioDomain,globalScore});
