const normalize=value=>String(value||'').trim().toLowerCase();

function descriptorFor(exercise){return `${normalize(exercise?.id)} ${normalize(exercise?.name_es)} ${normalize(exercise?.pattern)} ${normalize(exercise?.equipment)}`;}
function idFor(exercise){return normalize(exercise?.id);}
function nameFor(exercise){return normalize(exercise?.name_es);}
function isBearCrawl(exercise){return /(?:ibf-bear-crawl|\bbear\s+crawl\b)/u.test(descriptorFor(exercise));}
function isBearPlankBase(exercise){
  const id=idFor(exercise);const name=nameFor(exercise);
  return id==='ibf-bear-plank'||['bear plank','plancha bear','plancha del oso'].includes(name);
}
function isBearPlankShoulderTap(exercise){
  const id=idFor(exercise);const name=nameFor(exercise);
  return id==='ibf-bear-plank-shoulder-tap'
    ||/\bbear\s+plank\s+shoulder\s+tap\b/u.test(name)
    ||/\bplancha\s+(?:bear|del\s+oso).{0,40}(?:toque|tap).{0,30}hombro/u.test(name);
}

export function hasHardMovementPlanGuard(exercise){
  return isBearCrawl(exercise)||isBearPlankShoulderTap(exercise);
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

function phaseHasCompactBearPlankSupport(text){
  const n=normalize(text);
  const hands=/(?:manos?|palmas?).{0,100}(?:suelo|piso|apoy)/u.test(n)||/(?:suelo|piso).{0,100}(?:manos?|palmas?)/u.test(n);
  const feet=/(?:pies?|puntas?|antepi[eé]s).{0,120}(?:suelo|piso|apoy|contact)/u.test(n);
  const kneesHover=/(?:rodillas?).{0,120}(?:suspend|elevad|flot|sin contacto|no (?:tocan|apoyan))/u.test(n);
  const kneesFlexed=/(?:rodillas?).{0,100}(?:flex|90|noventa|bajo|debajo|cerca).{0,80}(?:cadera|pelvis|grados?)?/u.test(n);
  return hands&&feet&&kneesHover&&kneesFlexed;
}

function shoulderTapTargetIssue(text){
  const n=normalize(text);
  const contact='(?:toca|toque|contact|tap|touch)';
  const wrongTarget='(?:muñeca|muneca|palma|mano|antebrazo)';
  if(new RegExp(`${contact}.{0,60}${wrongTarget}|${wrongTarget}.{0,60}${contact}`,'u').test(n))return'PLAN_MOVEMENT_PHASE_RELATION_INVALID:bear-plank-shoulder-tap-target';
  const shoulder=new RegExp(`${contact}.{0,80}(?:hombro|deltoide)|(?:hombro|deltoide).{0,80}${contact}`,'u').test(n);
  const liftedHand=/(?:mano|brazo).{0,100}(?:despeg|eleva|levanta|separa|cruza|toca|toque|tap|touch)|(?:despeg|eleva|levanta|separa|cruza|toca|toque|tap|touch).{0,100}(?:mano|brazo)/u.test(n);
  if(!shoulder||!liftedHand)return'PLAN_MOVEMENT_PHASE_RELATION_INVALID:bear-plank-shoulder-tap';
  return null;
}

export function movementPlanIssue(exercise,plan){
  if(isBearCrawl(exercise)){
    if(!phaseHasBearSupport(plan?.start))return'PLAN_MOVEMENT_IDENTITY_INVALID:start:bear-crawl-support';
    if(!phaseHasBearSupport(plan?.final))return'PLAN_MOVEMENT_IDENTITY_INVALID:final:bear-crawl-support';
    const final=normalize(plan?.final);
    const advancesLimb=/(?:mano|pie|pierna).{0,100}(?:avanz|adelant|desplaz)|(?:avanz|adelant|desplaz).{0,100}(?:mano|pie|pierna)/u.test(final);
    if(!advancesLimb)return'PLAN_MOVEMENT_PHASE_RELATION_INVALID:bear-crawl-step';
    return null;
  }
  if(isBearPlankShoulderTap(exercise)){
    if(!phaseHasCompactBearPlankSupport(plan?.start))return'PLAN_MOVEMENT_IDENTITY_INVALID:start:bear-plank-hover-support';
    if(!phaseHasCompactBearPlankSupport(plan?.final))return'PLAN_MOVEMENT_IDENTITY_INVALID:final:bear-plank-hover-support';
    return shoulderTapTargetIssue(plan?.final);
  }
  return null;
}

const SUPPORT_SHAPE='{"palms_on_floor":0|1|2,"forefeet_on_floor":0|1|2,"knees_weight_bearing":boolean,"hip_height_relation":"below_shoulders|near_shoulders|above_shoulders|unclear","torso_relation":"approximately_parallel|upright|unclear","lunge_or_squat":boolean}';
const SHOULDER_TAP_FINAL_SHAPE='{"palms_on_floor":0|1|2,"forefeet_on_floor":0|1|2,"knees_weight_bearing":boolean,"free_hand_target":"opposite_shoulder|other|unclear","hip_height_relation":"below_shoulders|near_shoulders|above_shoulders|unclear","torso_relation":"approximately_parallel|upright|unclear","lunge_or_squat":boolean}';

function compactHoverSupportPass(observation,{palms}){
  return Number(observation?.palms_on_floor)===palms
    &&Number(observation?.forefeet_on_floor)===2
    &&observation?.knees_weight_bearing===false
    &&observation?.hip_height_relation==='near_shoulders'
    &&observation?.torso_relation==='approximately_parallel'
    &&observation?.lunge_or_squat===false;
}

export function supportObservationInstruction(exercise){
  if(isBearCrawl(exercise))return `For Bear Crawl, report support_observation exactly as ${SUPPORT_SHAPE}. Count only clearly visible or defensible contacts; use unclear rather than guessing. A squat, crouch, lunge or kneeling pose is not a crawl.`;
  if(isBearPlankShoulderTap(exercise))return `For Bear Plank Shoulder Tap START, report support_observation exactly as ${SUPPORT_SHAPE}. START requires exactly two palms and two forefeet/toes on the floor, both knees hovering (not weight-bearing), hips near shoulder height and a near-horizontal trunk.`;
  return'';
}

export function supportPairObservationInstruction(exercise){
  if(isBearCrawl(exercise))return `For Bear Crawl, report support_observation exactly as {"start":${SUPPORT_SHAPE},"final":${SUPPORT_SHAPE}}. Evaluate START and FINAL independently. Count only clearly visible or defensible contacts; use unclear rather than guessing. A squat, crouch, lunge or kneeling pose is not a crawl.`;
  if(isBearPlankShoulderTap(exercise))return `For Bear Plank Shoulder Tap, report support_observation exactly as {"start":${SUPPORT_SHAPE},"final":${SHOULDER_TAP_FINAL_SHAPE}}. START requires two supporting palms. FINAL requires exactly one supporting palm while the free hand visibly contacts the opposite shoulder/upper deltoid. Both phases require two forefeet/toes on the floor and both knees hovering.`;
  return'';
}

export function supportObservationPass(exercise,observation){
  if(isBearCrawl(exercise))return compactHoverSupportPass(observation,{palms:2});
  if(isBearPlankShoulderTap(exercise))return compactHoverSupportPass(observation,{palms:2});
  return true;
}

export function supportPairObservationPass(exercise,observation){
  if(isBearCrawl(exercise))return supportObservationPass(exercise,observation?.start)
    &&supportObservationPass(exercise,observation?.final);
  if(isBearPlankShoulderTap(exercise))return compactHoverSupportPass(observation?.start,{palms:2})
    &&compactHoverSupportPass(observation?.final,{palms:1})
    &&observation?.final?.free_hand_target==='opposite_shoulder';
  return true;
}

export function movementVisualGuard(exercise){
  if(isBearCrawl(exercise)){
    return [
      'BEAR CRAWL HARD MOVEMENT LOCK:',
      'The athlete must be unmistakably in quadrupedal locomotion, not a squat, crouch, lunge, sprinter start or resting pose.',
      'Both hands must visibly contact the floor under or near the shoulders; the feet/toes must provide the posterior floor support; both knees must remain visibly off the floor.',
      'The hips must stay approximately level with the shoulders and clearly elevated away from the heels; the trunk must remain long and near-horizontal with a neutral spine, never upright or deeply folded.',
      'START and FINAL must show a real crawl-step relationship: at least one hand/foot position advances while the quadrupedal support strategy, hovering knees, pelvis height and trunk alignment remain consistent.',
      'If the hips collapse into a deep squat/crouch, the torso becomes substantially upright, the knees bear weight on the floor, or the image reads as anything other than a bear crawl, the movement identity check MUST fail.'
    ].join(' ');
  }

  if(isBearPlankShoulderTap(exercise)){
    return [
      'BEAR PLANK SHOULDER TAP HARD MOVEMENT LOCK:',
      'START is already an active compact bear plank: both palms on the floor under the shoulders, both forefeet/toes on the floor, both knees flexed about 90 degrees and hovering only a few centimetres above the floor under or close to the hips. Do NOT place the knees on the floor and do NOT extend the legs backward into a conventional high plank.',
      'FINAL must preserve the compact knees-hover bear-plank geometry while ONE hand clearly leaves the floor and touches the OPPOSITE SHOULDER/upper deltoid. The other palm remains firmly weight-bearing under its shoulder. A touch to the opposite wrist, palm, hand, forearm, chest or floor is NOT a shoulder tap.',
      'The pelvis, ribcage and trunk must remain visibly controlled with minimal rotation; hips stay approximately level with shoulders and both knees remain hovering and flexed.',
      'START and FINAL must be visibly different: START has two palms supporting; FINAL has exactly one supporting palm while the free hand visibly contacts the contralateral shoulder. If both hands remain on the floor in FINAL, movement identity MUST fail.'
    ].join(' ');
  }

  if(isBearPlankBase(exercise)){
    return [
      'BEAR PLANK HARD PHASE LOCK:',
      'Do not default to a conventional straight-leg high plank, long-lever plank, lunge, crouch or bear crawl. The requested phase must override the iconic pose suggested by the exercise name.',
      'For START, show a true four-point tabletop/quadruped setup: both palms flat on the floor under the shoulders and both knees visibly weight-bearing on the floor directly under the hips, with hips over knees, knees flexed about 90 degrees and a neutral near-horizontal trunk. The legs must NOT extend backward into a plank.',
      'For FINAL, keep both palms under the shoulders and both forefeet/toes on the floor while both knees hover only a few centimetres above the floor. The knees remain clearly flexed and positioned under or close to the hips; the hips stay approximately level with the shoulders and the trunk remains neutral and near-horizontal.',
      'START and FINAL are the same compact quadruped geometry except that the knees transition from weight-bearing on the floor to hovering. Never solve the FINAL by straightening the knees and sending the feet far backward.',
      'If START lacks two visible knee contacts, or if either phase reads as a conventional high plank with long straight legs, movement identity MUST fail.'
    ].join(' ');
  }

  return [
    'MOVEMENT IDENTITY LOCK:',
    'Match the planned exercise and phase literally rather than a visually related movement.',
    'All required body supports, floor contacts, grips, handles, resistance connections and joint relationships described by the plan must be visibly present and physically plausible.',
    'A pose that changes the defining support/contact pattern or body orientation of the planned movement must fail even if the athlete, equipment and scene look correct.'
  ].join(' ');
}
