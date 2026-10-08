// Independent biomechanical contracts: never derive movement identity from an AI-generated plan.
const normalize=value=>String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export function isCriticalMovement(exercise){
  const id=normalize(exercise?.id),name=normalize(exercise?.name_es);
  return id==='ibf-bottom-up-press-con-kettlebell'||id==='ibf-bound-lateral-controlado'
    ||(/bottom[ -]?up/.test(name)&&/(press|empuje)/.test(name)&&/(kettlebell|pesa rusa)/.test(name))
    ||(/bound lateral/.test(name)&&/(controlad|controlled)/.test(name));
}
function kind(exercise){
  const id=normalize(exercise?.id),name=normalize(exercise?.name_es);
  if(id==='ibf-bottom-up-press-con-kettlebell'||(/bottom[ -]?up/.test(name)&&/(press|empuje)/.test(name)&&/(kettlebell|pesa rusa)/.test(name)))return'bottom-up';
  if(id==='ibf-bound-lateral-controlado'||(/bound lateral/.test(name)&&/(controlad|controlled)/.test(name)))return'lateral-bound';
  return null;
}
export function criticalMovementCamera(exercise){
  return kind(exercise)==='bottom-up'?'three-quarter-front':kind(exercise)==='lateral-bound'?'front':null;
}
export function criticalMovementPhases(exercise){
  if(kind(exercise)==='bottom-up')return Object.freeze({
    start:'De pie con una sola kettlebell INVERTIDA en la mano derecha, la esfera arriba del asa y del puno, nunca colgando debajo. La mano derecha sostiene el asa junto al hombro derecho en posicion rack; muneca neutra, antebrazo vertical, codo flexionado. La mano izquierda libre no toca la kettlebell. Tronco estable, pies separados a ancho de caderas, agarre unilateral durante todo el ejercicio.',
    final:'De pie con la MISMA kettlebell INVERTIDA sostenida solo con la mano derecha, esfera claramente POR ENCIMA del asa y del puno. El brazo derecho empuja vertical sobre la cabeza hasta codo extendido y muneca neutra; pesa alineada sobre hombro, pelvis y apoyo de pies. La mano izquierda permanece libre y no toca la kettlebell. No es un press bilateral ni una kettlebell colgando del asa.'
  });
  if(kind(exercise)==='lateral-bound')return Object.freeze({
    start:'Atleta de pie en apoyo predominante sobre la pierna derecha, cadera y rodilla derechas ligeramente flexionadas para IMPULSO LATERAL hacia la izquierda. La pierna izquierda esta libre del suelo, brazos preparados para contrabalanceo, tronco estable y cuerpo completo visible. Es la preparacion de un salto lateral, NO una elevacion de rodilla al frente ni un ejercicio estatico de equilibrio.',
    final:'Despues de un SALTO CON DESPLAZAMIENTO LATERAL visible hacia la izquierda, el atleta ATERRIZA sobre la pierna izquierda con cadera y rodilla izquierdas flexionadas, rodilla alineada con el pie y tronco estable ligeramente inclinado. La pierna derecha queda libre atras o al costado, sin apoyar; brazos contrabalancean la recepcion controlada. No es elevacion de rodilla delante ni simple abduccion de pierna sin salto.'
  });
  return null;
}
export function criticalMovementPlanIssue(exercise,plan){
  const type=kind(exercise);if(!type)return null;
  const s=normalize(plan?.start),f=normalize(plan?.final);
  if(type==='bottom-up'){
    const forbidden=/(?:ambas|dos) manos|agarre bilateral|esfera.{0,50}(?:debajo|cuelga)|(?:debajo|colgando).{0,50}(?:esfera|asa)/;
    for(const [phase,text] of [['start',s],['final',f]]){
      if(forbidden.test(text))return'PLAN_CRITICAL_GEOMETRY_INVALID:'+phase+':bottom-up-bilateral-or-inverted';
      if(!/(?:kettlebell|pesa rusa)/.test(text)||!/(?:invertid|esfera.{0,70}(?:encima|arriba))/.test(text)||!/(?:una sola|solo con la mano|unilateral)/.test(text)||!/(?:muneca neutra)/.test(text))return'PLAN_CRITICAL_GEOMETRY_INVALID:'+phase+':bottom-up-grip';
    }
    if(!/(?:hombro|rack)/.test(s)||!/(?:codo flexionad)/.test(s))return'PLAN_CRITICAL_PHASE_INVALID:bottom-up-start';
    if(!/(?:sobre la cabeza|encima de la cabeza)/.test(f)||!/(?:codo extendid)/.test(f))return'PLAN_CRITICAL_PHASE_INVALID:bottom-up-final';
  }else{
    const forbidden=/(?:elevacion de rodilla al frente|simple abduccion de pierna sin salto|ejercicio estatico de equilibrio)/;
    // Negated descriptions in canonical phases are instructional; the defining positive cues remain mandatory.
    if(!/(?:pierna derecha)/.test(s)||!/(?:impulso lateral)/.test(s)||!/(?:rodilla derech)/.test(s))return'PLAN_CRITICAL_PHASE_INVALID:lateral-bound-takeoff';
    if(!/(?:salto con desplazamiento lateral|salto lateral)/.test(f)||!/(?:aterriza|recepcion)/.test(f)||!/(?:pierna izquierda)/.test(f)||!/(?:rodilla alineada)/.test(f))return'PLAN_CRITICAL_PHASE_INVALID:lateral-bound-landing';
    if(/^(?!.*\bno\b).*\b(?:elevacion de rodilla al frente|simple abduccion de pierna sin salto)\b/.test(f))return'PLAN_CRITICAL_IDENTITY_INVALID:lateral-bound-static';
  }
  return null;
}
export function criticalMovementVisualGuard(exercise){
  if(kind(exercise)==='bottom-up')return 'BOTTOM-UP PRESS INDEPENDENT BIOMECHANICAL LOCK: One inverted kettlebell held by ONE hand only in both phases. The heavy spherical bell MUST visibly sit ABOVE the handle and fist, not hang below the handle. START is a unilateral rack near the working shoulder with flexed elbow; FINAL is the same inverted bell overhead with extended elbow, neutral wrist and no assistance from the free hand. Reject bilateral grip, conventional hanging kettlebell, goblet hold, front-loaded squat, hidden bell orientation or unstable wrist even if the generated plan calls it a bottom-up press.';
  if(kind(exercise)==='lateral-bound')return 'LATERAL BOUND INDEPENDENT BIOMECHANICAL LOCK: START prepares a real lateral jump from the right support leg with hip and knee loaded. FINAL must visibly land on the opposite left support leg after lateral displacement with hip/knee flexion, knee aligned with foot and controlled balance. Reject static side-leg raises, forward knee raises, standing balance, squat, lateral lunge without flight or two nearly identical phases. Movement identity must be judged against the canonical exercise, not merely the AI-generated plan.';
  return null;
}
const BOTTOM_START='{"kettlebell_count":number,"gripping_hands":number,"bell_above_handle":boolean,"free_hand_off_kettlebell":boolean,"wrist_neutral":boolean,"bell_near_working_shoulder":boolean}';
const BOTTOM_FINAL='{"kettlebell_count":number,"gripping_hands":number,"bell_above_handle":boolean,"free_hand_off_kettlebell":boolean,"wrist_neutral":boolean,"bell_overhead":boolean,"elbow_extended":boolean}';
const BOUND_START='{"support_foot":"right|left|both|unclear","lateral_takeoff_preparation":boolean,"front_knee_raise":boolean}';
const BOUND_FINAL='{"landing_foot":"right|left|both|unclear","lateral_displacement_visible":boolean,"landing_knee_aligned":boolean,"landing_hip_knee_flexed":boolean,"front_knee_raise":boolean}';
export function criticalSupportObservationInstruction(exercise){
  if(kind(exercise)==='bottom-up')return 'For bottom-up press START, report support_observation exactly as '+BOTTOM_START+'. The ball must visibly be ABOVE the handle, with one hand gripping and the free hand off the bell. If unclear, use false.';
  if(kind(exercise)==='lateral-bound')return 'For lateral bound START, report support_observation exactly as '+BOUND_START+'. A static forward knee raise is NOT a lateral takeoff. If unclear, use false or unclear.';
  return'';
}
export function criticalSupportPairObservationInstruction(exercise){
  if(kind(exercise)==='bottom-up')return 'For bottom-up press, report support_observation exactly as {"start":'+BOTTOM_START+',"final":'+BOTTOM_FINAL+'}. Observe bell orientation and gripping hand count in BOTH panels independently. If the spherical bell is below the handle in either phase, report bell_above_handle=false.';
  if(kind(exercise)==='lateral-bound')return 'For lateral bound, report support_observation exactly as {"start":'+BOUND_START+',"final":'+BOUND_FINAL+'}. Report actual right-leg loading, left-leg landing, lateral displacement and knee alignment. Do not infer a jump from a static leg raise.';
  return'';
}
function bottomCommon(o){return Number(o?.kettlebell_count)===1&&Number(o?.gripping_hands)===1&&o?.bell_above_handle===true&&o?.free_hand_off_kettlebell===true&&o?.wrist_neutral===true;}
function bottomStart(o){return bottomCommon(o)&&o?.bell_near_working_shoulder===true;}
function bottomFinal(o){return bottomCommon(o)&&o?.bell_overhead===true&&o?.elbow_extended===true;}
function boundStart(o){return o?.support_foot==='right'&&o?.lateral_takeoff_preparation===true&&o?.front_knee_raise===false;}
function boundFinal(o){return o?.landing_foot==='left'&&o?.lateral_displacement_visible===true&&o?.landing_knee_aligned===true&&o?.landing_hip_knee_flexed===true&&o?.front_knee_raise===false;}
export function criticalSupportObservationPass(exercise,o){return kind(exercise)==='bottom-up'?bottomStart(o):kind(exercise)==='lateral-bound'?boundStart(o):false;}
export function criticalSupportPairObservationPass(exercise,o){return kind(exercise)==='bottom-up'?bottomStart(o?.start)&&bottomFinal(o?.final):kind(exercise)==='lateral-bound'?boundStart(o?.start)&&boundFinal(o?.final):false;}
