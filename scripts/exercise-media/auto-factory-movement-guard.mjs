const normalize=value=>String(value||'').trim().toLowerCase();

function descriptorFor(exercise){return `${normalize(exercise?.id)} ${normalize(exercise?.name_es)} ${normalize(exercise?.pattern)} ${normalize(exercise?.equipment)}`;}

export function hasHardMovementPlanGuard(exercise){
  return /(?:ibf-bear-crawl|\bbear\s+crawl\b)/u.test(descriptorFor(exercise));
}

function phaseHasBearSupport(text){
  const n=normalize(text);
  const hands=/(?:manos?.{0,80}(?:suelo|piso)|(?:suelo|piso).{0,80}manos?)/u.test(n);
  const feet=/(?:pies?|puntas?|antepi[eé]s).{0,100}(?:apoy|contact|suelo|piso)/u.test(n);
  const knees=/(?:rodillas?).{0,120}(?:suspend|elevad|sin contacto|no (?:tocan|apoyan)|fuera del (?:suelo|piso))/u.test(n);
  const hips=/(?:(?:cadera|pelvis).{0,100}(?:altura|nivel).{0,50}hombros?|hombros?.{0,50}(?:altura|nivel).{0,50}(?:cadera|pelvis))/u.test(n);
  const trunk=/(?:tronco|espalda|columna).{0,100}(?:horizontal|neutr|rect|larga|alinead)/u.test(n);
  const feetFlat=/\bpies?\s+planos?\b/u.test(n);
  return hands&&feet&&knees&&hips&&trunk&&!feetFlat;
}

export function movementPlanIssue(exercise,plan){
  if(!hasHardMovementPlanGuard(exercise))return null;
  if(!phaseHasBearSupport(plan?.start))return'PLAN_MOVEMENT_IDENTITY_INVALID:start:bear-crawl-support';
  if(!phaseHasBearSupport(plan?.final))return'PLAN_MOVEMENT_IDENTITY_INVALID:final:bear-crawl-support';
  const final=normalize(plan?.final);
  const advancesLimb=/(?:mano|pie|pierna).{0,100}(?:avanz|adelant|desplaz)|(?:avanz|adelant|desplaz).{0,100}(?:mano|pie|pierna)/u.test(final);
  if(!advancesLimb)return'PLAN_MOVEMENT_PHASE_RELATION_INVALID:bear-crawl-step';
  return null;
}

const SUPPORT_SHAPE='{"palms_on_floor":0|1|2,"forefeet_on_floor":0|1|2,"knees_weight_bearing":boolean,"hip_height_relation":"below_shoulders|near_shoulders|above_shoulders|unclear","torso_relation":"approximately_parallel|upright|unclear","lunge_or_squat":boolean}';

export function supportObservationInstruction(exercise){
  if(!hasHardMovementPlanGuard(exercise))return'';
  return `For Bear Crawl, report support_observation exactly as ${SUPPORT_SHAPE}. Count only clearly visible or defensible contacts; use unclear rather than guessing. A squat, crouch, lunge or kneeling pose is not a crawl.`;
}

export function supportPairObservationInstruction(exercise){
  if(!hasHardMovementPlanGuard(exercise))return'';
  return `For Bear Crawl, report support_observation exactly as {"start":${SUPPORT_SHAPE},"final":${SUPPORT_SHAPE}}. Evaluate START and FINAL independently. Count only clearly visible or defensible contacts; use unclear rather than guessing. A squat, crouch, lunge or kneeling pose is not a crawl.`;
}

export function supportObservationPass(exercise,observation){
  if(!hasHardMovementPlanGuard(exercise))return true;
  return Number(observation?.palms_on_floor)===2
    &&Number(observation?.forefeet_on_floor)===2
    &&observation?.knees_weight_bearing===false
    &&observation?.hip_height_relation==='near_shoulders'
    &&observation?.torso_relation==='approximately_parallel'
    &&observation?.lunge_or_squat===false;
}

export function supportPairObservationPass(exercise,observation){
  if(!hasHardMovementPlanGuard(exercise))return true;
  return supportObservationPass(exercise,observation?.start)
    &&supportObservationPass(exercise,observation?.final);
}

export function movementVisualGuard(exercise){
  const descriptor=descriptorFor(exercise);

  if(/(?:ibf-bear-crawl|\bbear\s+crawl\b)/u.test(descriptor)){
    return [
      'BEAR CRAWL HARD MOVEMENT LOCK:',
      'The athlete must be unmistakably in quadrupedal locomotion, not a squat, crouch, lunge, sprinter start or resting pose.',
      'Both hands must visibly contact the floor under or near the shoulders; the feet/toes must provide the posterior floor support; both knees must remain visibly off the floor.',
      'The hips must stay approximately level with the shoulders and clearly elevated away from the heels; the trunk must remain long and near-horizontal with a neutral spine, never upright or deeply folded.',
      'START and FINAL must show a real crawl-step relationship: at least one hand/foot position advances while the quadrupedal support strategy, hovering knees, pelvis height and trunk alignment remain consistent.',
      'If the hips collapse into a deep squat/crouch, the torso becomes substantially upright, the knees bear weight on the floor, or the image reads as anything other than a bear crawl, the movement identity check MUST fail.'
    ].join(' ');
  }

  return [
    'MOVEMENT IDENTITY LOCK:',
    'Match the planned exercise and phase literally rather than a visually related movement.',
    'All required body supports, floor contacts, grips, handles, resistance connections and joint relationships described by the plan must be visibly present and physically plausible.',
    'A pose that changes the defining support/contact pattern or body orientation of the planned movement must fail even if the athlete, equipment and scene look correct.'
  ].join(' ');
}
