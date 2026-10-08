const normalize=value=>String(value||'').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function isBottomUpKettlebellPress(exercise){
  const id=normalize(exercise?.id);
  const name=normalize(exercise?.name_es);
  return id==='ibf-bottom-up-press-con-kettlebell'
    ||(/bottom[ -]?up/u.test(name)&&/(?:press|pres|empuje)/u.test(name)&&/(?:kettlebell|pesa rusa)/u.test(name));
}
export function bottomUpCanonicalPhases(){
  return Object.freeze({
    start:'De pie, cuerpo estable y pies al ancho de caderas. UNA SOLA kettlebell invertida se sostiene EXCLUSIVAMENTE con la mano derecha: la esfera está claramente POR ENCIMA del asa y del puño derecho; el asa queda POR DEBAJO de la esfera. Muñeca derecha neutra y vertical, codo derecho flexionado aproximadamente 90 grados y junto al hombro derecho. Mano izquierda vacía y libre, sin tocar la kettlebell. Ninguna segunda pesa.',
    final:'De pie, costillas sobre pelvis y sin arquear la zona lumbar. La MISMA y ÚNICA kettlebell permanece invertida EXCLUSIVAMENTE en la mano derecha: esfera claramente POR ENCIMA del asa y del puño, asa POR DEBAJO de la esfera. Brazo derecho elevado verticalmente sobre la cabeza con codo derecho extendido y muñeca neutra. Mano izquierda vacía y libre, sin tocar la pesa. Ninguna segunda kettlebell.'
  });
}
function phaseValid(text,phase){
  const n=normalize(text);
  return /una sola|unica/u.test(n)
    &&/mano derecha/u.test(n)
    &&/mano izquierda.{0,35}(?:vacia|libre)/u.test(n)
    &&/esfera.{0,45}por encima/u.test(n)
    &&/asa.{0,40}por debajo/u.test(n)
    &&/muneca.{0,40}neutra/u.test(n)
    &&(phase==='start'?/codo derecho flexionado/u.test(n):/codo derecho extendido/u.test(n));
}
export function bottomUpPlanIssue(plan){
  if(!phaseValid(plan?.start,'start'))return'PLAN_BOTTOM_UP_GEOMETRY_INVALID:start';
  if(!phaseValid(plan?.final,'final'))return'PLAN_BOTTOM_UP_GEOMETRY_INVALID:final';
  return null;
}
export function bottomUpVisualGuard(exercise){
  if(!isBottomUpKettlebellPress(exercise))return'';
  return [
    'BOTTOM-UP KETTLEBELL PRESS HARD GEOMETRY LOCK, independent of any generated plan:',
    'Use exactly ONE kettlebell in exactly ONE working hand (right hand). The other hand must be empty and must never grip or steady the kettlebell.',
    'The heavy spherical BELL MUST be ABOVE the handle and ABOVE the fist, inverted against gravity, in BOTH phases. The handle is BELOW the sphere. A normally hanging kettlebell with bell below handle is NEVER bottom-up.',
    'START: right elbow flexed with the inverted kettlebell at right shoulder level. FINAL: same right arm overhead with elbow extended, bell STILL above the fist. Keep right wrist neutral and torso stable.',
    'Do NOT depict a two-hand goblet hold, two-hand press, ordinary kettlebell rack, bell hanging below the handle, second kettlebell, or ambiguous grip. If orientation is unclear or hidden, reject movement identity.'
  ].join(' ');
}
export function bottomUpObservationInstruction(exercise,{pair=false}={}){
  if(!isBottomUpKettlebellPress(exercise))return'';
  const shape='{"working_hand_count":1|2|0,"bell_orientation":"bell_above_handle|bell_below_handle|unclear","handle_below_bell":boolean,"free_hand_empty":boolean,"wrist_neutral":boolean,"arm_phase":"shoulder_elbow_flexed|overhead_elbow_extended|other|unclear","extra_kettlebell":boolean}';
  return pair
    ?'Report bottom_up_observation as {"start":'+shape+',"final":'+shape+'}. Judge the ACTUAL PIXELS separately from the plan. If the sphere is below the handle, or the second hand touches the kettlebell, or the geometry cannot be seen, do NOT infer compliance.'
    :'Report bottom_up_observation as '+shape+'. Judge ACTUAL PIXELS independently of the plan. If the sphere is below the handle, if both hands grip it, or the orientation is hidden, do NOT infer compliance.';
}
export function bottomUpObservationPass(observation,phase){
  return Number(observation?.working_hand_count)===1
    &&observation?.bell_orientation==='bell_above_handle'
    &&observation?.handle_below_bell===true
    &&observation?.free_hand_empty===true
    &&observation?.wrist_neutral===true
    &&observation?.extra_kettlebell===false
    &&observation?.arm_phase===(phase==='start'?'shoulder_elbow_flexed':'overhead_elbow_extended');
}
export function bottomUpPairObservationPass(observation){
  return bottomUpObservationPass(observation?.start,'start')&&bottomUpObservationPass(observation?.final,'final');
}
