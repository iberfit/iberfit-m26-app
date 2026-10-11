// Independent biomechanical contracts: never derive movement identity from an AI-generated plan.
const normalize=value=>String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export function isCriticalMovement(exercise){
  const id=normalize(exercise?.id),name=normalize(exercise?.name_es);
  return id==='ibf-bottom-up-press-con-kettlebell'||id==='ibf-bound-lateral-controlado'||id==='ibf-buenos-dias-sentado'
    ||(/bottom[ -]?up/.test(name)&&/(press|empuje)/.test(name)&&/(kettlebell|pesa rusa)/.test(name))
    ||(/bound lateral/.test(name)&&/(controlad|controlled)/.test(name))
    ||(/buenos dias sentado/.test(name)&&/barra/.test(normalize(exercise?.equipment)));
}
function kind(exercise){
  const id=normalize(exercise?.id),name=normalize(exercise?.name_es);
  if(id==='ibf-bottom-up-press-con-kettlebell'||(/bottom[ -]?up/.test(name)&&/(press|empuje)/.test(name)&&/(kettlebell|pesa rusa)/.test(name)))return'bottom-up';
  if(id==='ibf-bound-lateral-controlado'||(/bound lateral/.test(name)&&/(controlad|controlled)/.test(name)))return'lateral-bound';
  if(id==='ibf-buenos-dias-sentado'||(/buenos dias sentado/.test(name)&&/barra/.test(normalize(exercise?.equipment))))return'seated-good-morning';
  return null;
}
export function criticalMovementCamera(exercise){
  return kind(exercise)==='bottom-up'?'three-quarter-front':kind(exercise)==='lateral-bound'?'front':kind(exercise)==='seated-good-morning'?'side':null;
}
export function criticalMovementPhases(exercise){
  if(kind(exercise)==='bottom-up')return Object.freeze({
    start:'De pie con una sola kettlebell INVERTIDA en la mano derecha, la esfera arriba del asa y del puno. La mano derecha sostiene el asa junto al hombro derecho en posicion rack; muneca neutra, antebrazo vertical, codo flexionado. La mano izquierda libre no toca la kettlebell. Tronco estable, pies separados a ancho de caderas, agarre unilateral durante todo el ejercicio.',
    final:'De pie con la MISMA kettlebell INVERTIDA sostenida solo con la mano derecha, esfera claramente POR ENCIMA del asa y del puno. El brazo derecho empuja vertical sobre la cabeza hasta codo extendido y muneca neutra; pesa alineada sobre hombro, pelvis y apoyo de pies. La mano izquierda permanece libre y no toca la kettlebell. El movimiento conserva el agarre unilateral y la orientacion invertida.'
  });
  if(kind(exercise)==='lateral-bound')return Object.freeze({
    start:'Atleta de pie en apoyo predominante sobre la pierna derecha, cadera y rodilla derechas ligeramente flexionadas para IMPULSO LATERAL hacia la izquierda. La pierna izquierda esta libre del suelo, brazos preparados para contrabalanceo, tronco estable y cuerpo completo visible. Es la preparacion de un salto lateral, NO una elevacion de rodilla al frente ni un ejercicio estatico de equilibrio.',
    final:'Despues de un SALTO CON DESPLAZAMIENTO LATERAL visible hacia la izquierda, el atleta ATERRIZA sobre la pierna izquierda con cadera y rodilla izquierdas flexionadas, rodilla alineada con el pie y tronco estable ligeramente inclinado. La pierna derecha queda libre atras o al costado, sin apoyar; brazos contrabalancean la recepcion controlada. No es elevacion de rodilla delante ni simple abduccion de pierna sin salto.'
  });
  if(kind(exercise)==='seated-good-morning')return Object.freeze({
    start:'Atleta SENTADO en banco estable, ambos gluteos en contacto con el asiento, ambos pies firmes en el suelo y rodillas flexionadas. Barra horizontal APOYADA SOBRE TRAPECIOS SUPERIORES DETRAS DE LOS HOMBROS, sostenida con ambas manos a los lados. Tronco erguido, columna neutral, cabeza alineada y caderas estables.',
    final:'Atleta permanece SENTADO en el mismo banco con ambos gluteos en contacto con el asiento y pies apoyados. Realiza BISAGRA DE CADERA inclinando el tronco hacia delante con columna neutral y rodillas flexionadas, sin levantarse del banco. La MISMA barra permanece sobre trapecios superiores detras de hombros y se mueve solidaria al tronco, sostenida con ambas manos.'
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
  }else if(type==='seated-good-morning'){
    const bad=/(?:barra.{0,100}(?:deltoides anteriores|pectoral|pecho|delante de los pies)|descenso vertical|de pie con barra)/;
    for(const [phase,text] of [['start',s],['final',f]]){
      if(bad.test(text))return'PLAN_CRITICAL_GEOMETRY_INVALID:'+phase+':seated-good-morning-front-bar';
      if(!/sentad/.test(text)||!/(?:banco|asiento)/.test(text)||!/(?:gluteos|caderas).{0,70}(?:contacto|asiento)/.test(text)||!/(?:pies).{0,70}(?:suelo|apoyad)/.test(text)||!/(?:barra).{0,90}(?:trapecios superiores)/.test(text)||!/(?:detras de (?:los )?hombros)/.test(text)||!/(?:columna neutral)/.test(text))return'PLAN_CRITICAL_GEOMETRY_INVALID:'+phase+':seated-good-morning-support';
    }
    if(!/(?:tronco erguido)/.test(s)||!/(?:bisagra de cadera)/.test(f)||!/(?:inclinando el tronco hacia delante)/.test(f))return'PLAN_CRITICAL_PHASE_INVALID:seated-good-morning-hinge';
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
  if(kind(exercise)==='seated-good-morning')return 'SEATED BARBELL GOOD MORNING INDEPENDENT BIOMECHANICAL LOCK: The athlete stays seated on a stable bench in BOTH phases with buttocks in contact and both feet grounded. The bar rests across upper trapezius on the BACK of the shoulders, NOT on the neck, front deltoids or chest; both hands secure it. START torso upright and neutral. FINAL a forward HIP HINGE at the hips with neutral spine and same bar contact, not a standing good morning, front-loaded squat, barbell row or vertical bar drop in front of feet. Reject any front-bar placement, loss of seated support or spinal collapse even if the generated plan suggests it.';
  return null;
}
const BOTTOM_START='{"kettlebell_count":number,"gripping_hands":number,"bell_above_handle":boolean,"free_hand_off_kettlebell":boolean,"wrist_neutral":boolean,"bell_near_working_shoulder":boolean}';
const BOTTOM_FINAL='{"kettlebell_count":number,"gripping_hands":number,"bell_above_handle":boolean,"free_hand_off_kettlebell":boolean,"wrist_neutral":boolean,"bell_overhead":boolean,"elbow_extended":boolean}';
const BOUND_START='{"support_foot":"right|left|both|unclear","lateral_takeoff_preparation":boolean,"front_knee_raise":boolean}';
const GOOD_START='{"seated":boolean,"buttocks_on_bench":boolean,"feet_grounded":number,"bar_position":"upper_back|front_shoulders|chest|other|unclear","both_hands_on_bar":boolean,"spine_neutral":boolean,"torso_upright":boolean}';
const GOOD_FINAL='{"seated":boolean,"buttocks_on_bench":boolean,"feet_grounded":number,"bar_position":"upper_back|front_shoulders|chest|other|unclear","both_hands_on_bar":boolean,"spine_neutral":boolean,"hip_hinge_forward":boolean}';
const BOUND_FINAL='{"landing_foot":"right|left|both|unclear","lateral_displacement_visible":boolean,"landing_knee_aligned":boolean,"landing_hip_knee_flexed":boolean,"front_knee_raise":boolean}';
export function criticalSupportObservationInstruction(exercise){
  if(kind(exercise)==='bottom-up')return 'For bottom-up press START, report support_observation exactly as '+BOTTOM_START+'. The ball must visibly be ABOVE the handle, with one hand gripping and the free hand off the bell. If unclear, use false.';
  if(kind(exercise)==='lateral-bound')return 'For lateral bound START, report support_observation exactly as '+BOUND_START+'. A static forward knee raise is NOT a lateral takeoff. If unclear, use false or unclear.';
  if(kind(exercise)==='seated-good-morning')return 'For seated barbell good morning START, report support_observation exactly as '+GOOD_START+'. Bar must rest on upper BACK/trapezius behind shoulders. Seated buttocks contact and two grounded feet must be visible; unclear is a failure.';
  return'';
}
export function criticalSupportPairObservationInstruction(exercise){
  if(kind(exercise)==='bottom-up')return 'For bottom-up press, report support_observation exactly as {"start":'+BOTTOM_START+',"final":'+BOTTOM_FINAL+'}. Observe bell orientation and gripping hand count in BOTH panels independently. If the spherical bell is below the handle in either phase, report bell_above_handle=false.';
  if(kind(exercise)==='lateral-bound')return 'For lateral bound, report support_observation exactly as {"start":'+BOUND_START+',"final":'+BOUND_FINAL+'}. Report actual right-leg loading, left-leg landing, lateral displacement and knee alignment. Do not infer a jump from a static leg raise.';
  if(kind(exercise)==='seated-good-morning')return 'For seated barbell good morning, report support_observation exactly as {"start":'+GOOD_START+',"final":'+GOOD_FINAL+'}. Confirm buttocks stay seated, both feet grounded and bar on UPPER BACK in both phases; FINAL shows forward HIP HINGE, not standing or a front-bar drop. If unclear, report false or unclear.';
  return'';
}
function bottomCommon(o){return Number(o?.kettlebell_count)===1&&Number(o?.gripping_hands)===1&&o?.bell_above_handle===true&&o?.free_hand_off_kettlebell===true&&o?.wrist_neutral===true;}
function bottomStart(o){return bottomCommon(o)&&o?.bell_near_working_shoulder===true;}
function bottomFinal(o){return bottomCommon(o)&&o?.bell_overhead===true&&o?.elbow_extended===true;}
function goodCommon(o){return o?.seated===true&&o?.buttocks_on_bench===true&&Number(o?.feet_grounded)===2&&o?.bar_position==='upper_back'&&o?.both_hands_on_bar===true&&o?.spine_neutral===true;}
function goodStart(o){return goodCommon(o)&&o?.torso_upright===true;}
function goodFinal(o){return goodCommon(o)&&o?.hip_hinge_forward===true;}
function boundStart(o){return o?.support_foot==='right'&&o?.lateral_takeoff_preparation===true&&o?.front_knee_raise===false;}
function boundFinal(o){return o?.landing_foot==='left'&&o?.lateral_displacement_visible===true&&o?.landing_knee_aligned===true&&o?.landing_hip_knee_flexed===true&&o?.front_knee_raise===false;}
export function criticalSupportObservationPass(exercise,o){return kind(exercise)==='bottom-up'?bottomStart(o):kind(exercise)==='lateral-bound'?boundStart(o):kind(exercise)==='seated-good-morning'?goodStart(o):false;}
export function criticalSupportPairObservationPass(exercise,o){return kind(exercise)==='bottom-up'?bottomStart(o?.start)&&bottomFinal(o?.final):kind(exercise)==='lateral-bound'?boundStart(o?.start)&&boundFinal(o?.final):kind(exercise)==='seated-good-morning'?goodStart(o?.start)&&goodFinal(o?.final):false;}
