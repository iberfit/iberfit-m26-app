#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fetchWithTransientRetry} from './auto-factory-fetch.mjs';
import {extractStructuredResponse} from './auto-factory-structured-response.mjs';
import {hasHardMovementPlanGuard,movementPlanIssue,movementVisualGuard} from './auto-factory-movement-guard.mjs';

const ALLOWED=new Set(['core','glúteos','aductores','cuádriceps','isquiotibiales','bíceps','dorsal ancho','romboides','tríceps','oblicuos','erectores espinales','deltoides anterior','deltoides posterior','deltoides','serrato','pectoral']);
const GENERIC=new Set(['movilidad','global','músculo objetivo']);
const CAMERAS=new Set(['front','three-quarter-front','side','three-quarter-rear','rear']);
const MAX_CABLE_PLAN_REPAIR_ATTEMPTS=1;
const MAX_MOVEMENT_PLAN_REPAIR_ATTEMPTS=1;
function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}
function exact(v,n){const s=String(v||'').trim();if(!s)throw new Error(`${n}_REQUIRED`);return s;}
function norm(v){return String(v||'').trim().toLocaleLowerCase('es');}
function canonicalList(values){const out=[];for(const v of Array.isArray(values)?values:[]){const n=norm(v);if(!ALLOWED.has(n))throw new Error(`PLAN_ANATOMY_TERM_NOT_ALLOWED:${n}`);if(!out.includes(n))out.push(n);}return out;}
function usesCableEquipment(exercise){return /(?:polea|cable)/u.test(norm(exercise?.equipment));}
function phaseHasCableGripContinuity(text){const n=norm(text);const grip=/(?:agarr|sujet|asa|cabo|manija|handle)/u.test(n);const source=/(?:cable|polea|cabo|asa|manija)/u.test(n);const tension=/(?:tens|conect|resistencia)/u.test(n);return grip&&source&&tension;}
function cablePlanIssue(plan){
  if(!phaseHasCableGripContinuity(plan?.start))return'PLAN_CABLE_GRIP_CONTINUITY_MISSING:start';
  if(!phaseHasCableGripContinuity(plan?.final))return'PLAN_CABLE_GRIP_CONTINUITY_MISSING:final';
  if(/\b(?:brazos?|antebrazos?)\s+cruzad/u.test(norm(plan?.final)))return'PLAN_CABLE_ARM_FOLD_AMBIGUOUS';
  return null;
}
function assertBasicPlanShape(plan){
  if(typeof plan.start!=='string'||plan.start.trim().length<40||plan.start.length>700)throw new Error('PLAN_START_INVALID');
  if(typeof plan.final!=='string'||plan.final.trim().length<40||plan.final.length>700||plan.final.trim()===plan.start.trim())throw new Error('PLAN_FINAL_INVALID');
  if(!CAMERAS.has(plan.camera))throw new Error('PLAN_CAMERA_INVALID');
}
async function main(){
  const claimPath=exact(arg('--claim'),'CLAIM');const outPath=exact(arg('--out'),'OUT');
  const claim=JSON.parse(fs.readFileSync(claimPath,'utf8'));const exercise=claim?.claim?.exercise;if(!exercise?.id)throw new Error('CLAIM_EXERCISE_MISSING');
  const proxy=exact(process.env.IBERFIT_AI_PROXY_URL,'IBERFIT_AI_PROXY_URL').replace(/\/+$/,'')+'/qa';const token=exact(process.env.IBERFIT_AI_PROXY_TOKEN,'IBERFIT_AI_PROXY_TOKEN');
  const primary=(exercise.primary_muscles||[]).map(norm);const secondary=(exercise.secondary_muscles||[]).map(norm);const inferred=primary.some(x=>GENERIC.has(x));const cable=usesCableEquipment(exercise);const hardMovement=hasHardMovementPlanGuard(exercise);const movementGuard=movementVisualGuard(exercise);
  const requestPlan=async(repairAttempt=0,repairReason='')=>{
    const rubric=[
      'You are the movement-visual planner for IBERFIT Exercise Media System v1. Produce a precise image-generation plan from the canonical exercise record. Do not invent a different exercise.',
      `ID=${exercise.id}; name=${exercise.name_es}; pattern=${exercise.pattern}; intent=${exercise.intent}; equipment=${exercise.equipment}; difficulty=${exercise.difficulty}.`,
      `Primary muscles=${primary.join(', ')}; secondary muscles=${secondary.join(', ')}.`,
      `Cues=${(exercise.cues||[]).join(' | ')}. Instructions=${(exercise.instructions_es||[]).join(' | ')}. Precautions=${(exercise.precautions||[]).join(' | ')}.`,
      'Describe one unambiguous START phase and one unambiguous FINAL phase for the exact exercise. Include support points, grip, joint relationships and equipment placement. Keep each phase under 700 characters.',
      hardMovement?movementGuard:'',
      cable?'Cable/pulley continuity is non-negotiable: both hands must remain visibly gripping one cable handle each in START and FINAL, and the cables remain visibly connected and under tension. Hands may cross the body midline, but forearms must never fold across the torso and the athlete must never release the handles. Describe this explicitly in both phases.':'',
      repairAttempt>0?`REPAIR PASS ${repairAttempt}: the previous plan was rejected for ${repairReason}. Rewrite START and FINAL so every required support, floor contact, grip, phase relationship and movement-specific hard lock is explicit, physically possible and visually unambiguous. Preserve the exact exercise and all cable continuity rules when applicable.`:'',
      'Choose one camera from: front, three-quarter-front, side, three-quarter-rear, rear. Instructional clarity outranks cinematic appearance.',
      `For anatomy, use ONLY terms from this closed list: ${[...ALLOWED].join(', ')}.`,
      inferred?'The catalog primary target is generic. Infer the smallest anatomically defensible primary target list from the exercise name, pattern, cues and instructions. If not defensible, return anatomy_primary as an empty array.':'The catalog primary targets are specific. anatomy_primary must include every specific canonical primary target exactly; do not replace them with broader or different muscles.',
      'anatomy_secondary may contain only useful secondary targets. wall_watermark should be true only when an upper-right background plane can safely remain visually empty.',
      'Confidence calibration is mandatory and evidence-based: 0.99-1.00 only when the exact exercise, equipment, START/FINAL relationship and required anatomy are all unambiguous and internally consistent; 0.97-0.98 when the plan remains valid but has only minor non-critical uncertainty; 0.96 only when explicit anatomy is complete but one minor planning detail is uncertain; 0.95 or lower for any material ambiguity, missing evidence or guesswork. Do not default to 0.95.',
      inferred?'For inferred anatomy, planner_confidence may be 0.985 or higher only when the primary target is strongly and uniquely determined by the exercise name, pattern, cues and instructions; otherwise use 0.95 or lower.':'For explicit canonical anatomy, do not reduce confidence merely because you are being conservative; score the plan against the calibration above.',
      'Return only JSON: {"start":"...","final":"...","camera":"front|three-quarter-front|side|three-quarter-rear|rear","anatomy_primary":[string],"anatomy_secondary":[string],"wall_watermark":boolean,"planner_confidence":number,"notes":[string]}. Confidence 0..1.'
    ].filter(Boolean).join('\n');
    const body={messages:[{role:'system',content:'Output exactly one JSON object. Be conservative about real uncertainty, but apply the confidence calibration literally and do not collapse clearly satisfied cases to an arbitrary 0.95.'},{role:'user',content:rubric}],temperature:0,stream:false,max_completion_tokens:3200,chat_template_kwargs:{enable_thinking:false,preserve_thinking:false},response_format:{type:'json_object'}};
    const response=await fetchWithTransientRetry(proxy,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'},{label:`PLAN${repairAttempt?`_REPAIR_${repairAttempt}`:''}`});if(!response.ok)throw new Error(`PLAN_HTTP_${response.status}:${(await response.text()).slice(0,900)}`);
    const payload=await response.json();if(payload?.ok!==true)throw new Error(`PLAN_PROXY_FAILED:${JSON.stringify(payload).slice(0,1200)}`);
    const parsed=extractStructuredResponse(payload,{missingError:'PLAN_RESPONSE_MISSING',invalidError:'PLAN_JSON_INVALID'});assertBasicPlanShape(parsed);return parsed;
  };
  let plan=null;let repairReason='';
  const maxRepair=Math.max(cable?MAX_CABLE_PLAN_REPAIR_ATTEMPTS:0,hardMovement?MAX_MOVEMENT_PLAN_REPAIR_ATTEMPTS:0);
  for(let repairAttempt=0;repairAttempt<=maxRepair;repairAttempt+=1){
    plan=await requestPlan(repairAttempt,repairReason);
    const issues=[];
    if(cable){const issue=cablePlanIssue(plan);if(issue)issues.push(issue);}
    if(hardMovement){const issue=movementPlanIssue(exercise,plan);if(issue)issues.push(issue);}
    if(issues.length===0)break;
    repairReason=issues.join('|');
    if(repairAttempt>=maxRepair)throw new Error(issues[0]);
  }
  assertBasicPlanShape(plan);
  const finalMovementIssue=hardMovement?movementPlanIssue(exercise,plan):null;if(finalMovementIssue)throw new Error(finalMovementIssue);
  const finalCableIssue=cable?cablePlanIssue(plan):null;if(finalCableIssue)throw new Error(finalCableIssue);
  const anatomyPrimary=canonicalList(plan.anatomy_primary),anatomySecondary=canonicalList(plan.anatomy_secondary);
  if(anatomyPrimary.length<1)throw new Error('PLAN_ANATOMY_PRIMARY_EMPTY');
  if(!inferred){for(const muscle of primary){if(GENERIC.has(muscle))continue;if(!anatomyPrimary.includes(muscle))throw new Error(`PLAN_CANONICAL_PRIMARY_MISSING:${muscle}`);}}
  const confidence=Number(plan.planner_confidence);const min=inferred?0.985:0.96;if(!Number.isFinite(confidence)||confidence<min)throw new Error(`PLAN_CONFIDENCE_LOW:${confidence}`);
  const output={schema:'iberfit.exercise.media.auto.plan.v1',exercise_id:exercise.id,start:plan.start.trim(),final:plan.final.trim(),camera:plan.camera,anatomy_primary:anatomyPrimary,anatomy_secondary:anatomySecondary,wall_watermark:plan.wall_watermark===true,anatomy_inferred:inferred,planner_confidence:confidence,notes:Array.isArray(plan.notes)?plan.notes.map(String).slice(0,8):[]};
  fs.mkdirSync(path.dirname(outPath),{recursive:true});
  fs.writeFileSync(outPath,`${JSON.stringify(output,null,2)}\n`);console.log(JSON.stringify(output));
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exit(1);});
