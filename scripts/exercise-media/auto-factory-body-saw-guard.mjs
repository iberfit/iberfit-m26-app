const normalize=value=>String(value||'')
  .trim()
  .toLocaleLowerCase('es')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'');

function normalizedName(exercise){
  return normalize(exercise?.name_es).replace(/[^a-z0-9]+/g,' ').trim();
}

export function isBodySawExercise(exercise){
  return normalize(exercise?.id)==='ibf-body-saw'||normalizedName(exercise)==='body saw';
}

function hasProneForearmPlank(text){
  const n=normalize(text);
  const prone=/(?:\bprono\b|\bboca abajo\b|\bprone\b|\bplancha\b)/u.test(n);
  const forearms=/(?:antebraz|forearms?|codos?|elbows?)/u.test(n);
  const supported=/(?:apoyad|plantad|fij|suelo|piso|floor|ground|supported|planted)/u.test(n);
  const aligned=/(?:cuerpo|tronco|torso|body).{0,100}(?:rigid|alinead|rect|straight|linea)|(?:rigid|alinead|rect|straight|linea).{0,100}(?:cuerpo|tronco|torso|body)/u.test(n);
  return prone&&forearms&&supported&&aligned;
}

function hasFeetOnSliders(text){
  const n=normalize(text);
  const feet='(?:pies?|puntas? de (?:los )?pies?|feet|toes?)';
  const sliders='(?:deslizadores?|discos? deslizantes?|sliders?|gliders?)';
  return new RegExp(`${feet}.{0,100}${sliders}|${sliders}.{0,100}${feet}`,'u').test(n);
}

function hasAnchoredForearms(text){
  const n=normalize(text);
  const support='(?:antebrazos?|codos?|forearms?|elbows?)';
  const anchored='(?:fij|plantad|apoyad|anclad|no se desplazan|permanecen|stay planted|remain planted|fixed|anchored)';
  return new RegExp(`${support}.{0,100}${anchored}|${anchored}.{0,100}${support}`,'u').test(n);
}

function hasWholeBodyTravel(text){
  const n=normalize(text);
  const body='(?:cuerpo|tronco|torso|hombros?|body|shoulders?)';
  const travel='(?:desplaz|desliz|traslad|oscila|mueve|shift|glid|travel|move)';
  const direction='(?:adelante|atras|hacia delante|hacia atras|forward|backward|back)';
  const directedTravel=new RegExp(`${body}.{0,120}${travel}.{0,80}${direction}|${body}.{0,120}${direction}.{0,80}${travel}|${travel}.{0,80}${body}.{0,80}${direction}`,'u').test(n);
  const shoulderRelation=/(?:hombros?|shoulders?).{0,100}(?:delante|atras|forward|behind|beyond).{0,80}(?:codos?|antebrazos?|elbows?|forearms?)/u.test(n);
  return directedTravel||shoulderRelation;
}

function hasFeetSliding(text){
  const n=normalize(text);
  const feet='(?:pies?|puntas? de (?:los )?pies?|feet|toes?)';
  const motion='(?:desliz|glid|slide|travel|desplaz)';
  return new RegExp(`${feet}.{0,100}${motion}|${motion}.{0,100}${feet}`,'u').test(n);
}

function hasWrongMovementIdentity(text){
  const n=normalize(text);
  const supine=/(?:decubito supino|boca arriba|supine|lying on (?:the )?back)/u.test(n);
  const bridge=/(?:puente de gluteos?|glute bridge|hip bridge)/u.test(n);
  const curl=/(?:curl (?:femoral|isquiotibial|de piernas?)|hamstring curl|heel slides?|leg slides?)/u.test(n);
  const kneeTuck=/(?:rodillas?|knees?).{0,100}(?:hacia|towards?|toward).{0,60}(?:pecho|gluteos?|chest|glutes?)|(?:talones?|heels?).{0,100}(?:hacia|towards?|toward).{0,60}(?:gluteos?|butt|glutes?)/u.test(n);
  const activeKneeFlexion=/(?:flexiona(?:r|ndo)?|dobla(?:r|ndo)?).{0,50}(?:las )?rodillas?|(?:knees?).{0,50}(?:flex|bend)/u.test(n);
  const handSliders=/(?:manos?|hands?).{0,100}(?:deslizadores?|sliders?|gliders?)|(?:deslizadores?|sliders?|gliders?).{0,100}(?:manos?|hands?)/u.test(n);
  return supine||bridge||curl||kneeTuck||activeKneeFlexion||handSliders;
}

export function bodySawPlanIssue(plan){
  if(!hasProneForearmPlank(plan?.start)||!hasFeetOnSliders(plan?.start)||hasWrongMovementIdentity(plan?.start)){
    return 'PLAN_MOVEMENT_IDENTITY_INVALID:start:body-saw-prone-forearm-plank';
  }
  if(!hasProneForearmPlank(plan?.final)||!hasFeetOnSliders(plan?.final)||hasWrongMovementIdentity(plan?.final)){
    return 'PLAN_MOVEMENT_IDENTITY_INVALID:final:body-saw-prone-forearm-plank';
  }
  if(!hasAnchoredForearms(plan?.final)||!hasWholeBodyTravel(plan?.final)||!hasFeetSliding(plan?.final)){
    return 'PLAN_MOVEMENT_PHASE_RELATION_INVALID:body-saw-whole-body-travel';
  }
  return null;
}

export function bodySawVisualGuard(exercise){
  if(!isBodySawExercise(exercise))return'';
  return [
    'BODY SAW HARD MOVEMENT LOCK:',
    'This is the prone forearm-plank Body Saw, not a supine slider leg exercise. START and FINAL must both show the athlete face down in a rigid forearm plank with forearms/elbows planted on the floor and feet/toes on sliders.',
    'The forearms stay anchored while the rigid body translates as one unit forward/back relative to the elbows; the shoulders visibly change position relative to the elbows and the feet slide with the body.',
    'Keep hips, trunk and legs aligned in anti-extension. Knees remain mostly extended and are not the primary mover.',
    'Do NOT depict lying supine, heel slides, leg slides, hamstring curls, glute bridges, knee tucks, active knee flexion toward the chest/glutes, or sliders under the hands.',
    'A phase that loses prone forearm-plank support, places sliders anywhere other than the feet, or moves mainly by bending the knees must fail movement identity.'
  ].join(' ');
}
