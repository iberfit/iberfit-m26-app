function norm(value){return String(value||'').trim().toLocaleLowerCase('es');}

export function isQuadrupedalLocomotion(exercise){
  const pattern=norm(exercise?.pattern);
  const descriptor=norm(`${exercise?.name_es||''} ${exercise?.tags?.join?.(' ')||''}`);
  return pattern==='locomoción'&&/(?:bear\s*crawl|crawl|gateo|cuadrup)/u.test(descriptor);
}

export function movementSupportContract(exercise){
  if(!isQuadrupedalLocomotion(exercise))return'';
  return 'Quadrupedal locomotion support lock: BOTH palms and BOTH forefeet/toes support the athlete on the floor. Knees hover 2-10 cm above the floor and never bear weight. Hips stay approximately level with the shoulders and the torso stays approximately parallel to the floor. No foot may plant beside a hand. Never depict a squat, deep crouch, lunge, kneeling pose or standing transition.';
}

const SUPPORT_SHAPE='{"palms_on_floor":0|1|2,"forefeet_on_floor":0|1|2,"knees_weight_bearing":boolean,"hip_height_relation":"below_shoulders|near_shoulders|above_shoulders|unclear","torso_relation":"approximately_parallel|upright|unclear","lunge_or_squat":boolean}';

export function supportObservationInstruction(exercise){
  if(!isQuadrupedalLocomotion(exercise))return'';
  return `For this quadrupedal locomotion exercise, report support_observation exactly as ${SUPPORT_SHAPE}. Count only clearly visible/defensible contacts; use unclear rather than guessing.`;
}

export function supportPairObservationInstruction(exercise){
  if(!isQuadrupedalLocomotion(exercise))return'';
  return `For this quadrupedal locomotion exercise, report support_observation exactly as {"start":${SUPPORT_SHAPE},"final":${SUPPORT_SHAPE}}. Evaluate each phase independently. Count only clearly visible/defensible contacts; use unclear rather than guessing.`;
}

export function quadrupedSupportObservationPass(exercise,observation){
  if(!isQuadrupedalLocomotion(exercise))return true;
  return Number(observation?.palms_on_floor)===2
    &&Number(observation?.forefeet_on_floor)===2
    &&observation?.knees_weight_bearing===false
    &&observation?.hip_height_relation==='near_shoulders'
    &&observation?.torso_relation==='approximately_parallel'
    &&observation?.lunge_or_squat===false;
}

export function quadrupedPairSupportObservationPass(exercise,observation){
  if(!isQuadrupedalLocomotion(exercise))return true;
  return quadrupedSupportObservationPass(exercise,observation?.start)
    &&quadrupedSupportObservationPass(exercise,observation?.final);
}
