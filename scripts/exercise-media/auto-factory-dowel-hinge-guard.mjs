const normalize=value=>String(value||'').trim().toLocaleLowerCase('es');

function descriptorFor(exercise){
  return `${normalize(exercise?.id)} ${normalize(exercise?.name_es)} ${normalize(exercise?.pattern)} ${normalize(exercise?.equipment)}`;
}

export function isHipHingeDowelExercise(exercise){
  const descriptor=descriptorFor(exercise);
  return normalize(exercise?.id)==='ibf-bisagra-de-cadera-con-palo'
    ||(/\bbisagra(?:\s+de\s+cadera)?\b/u.test(descriptor)&&/(?:\bpalo\b|\bbast[oó]n\b|\bdowel\b)/u.test(descriptor));
}

function hasThreePosteriorContacts(text){
  const n=normalize(text);
  const tool=/(?:palo|bast[oó]n|dowel)/u.test(n);
  const posterior=/(?:espalda|posterior|detr[aá]s|a lo largo de la columna|línea de la columna|linea de la columna)/u.test(n);
  const head=/(?:cabeza|occipital|nuca)/u.test(n);
  const thoracic=/(?:tor[aá]cic|espalda alta|parte alta de la espalda|entre (?:los )?om[oó]platos|dorsal)/u.test(n);
  const sacrum=/(?:sacro|cox[íi]s|c[oó]ccix|pelvis|zona lumbosacra|parte baja de la espalda)/u.test(n);
  const contact=/(?:contact|toca|apoya|pegad|mantiene|conserva)/u.test(n);
  return tool&&posterior&&head&&thoracic&&sacrum&&contact;
}

function hasForbiddenLoadPlacement(text){
  const n=normalize(text);
  return /(?:palo|bast[oó]n|dowel).{0,100}(?:delante|frontal|muslos?|deltoides|sobre los hombros|carga)|(?:delante|frontal|muslos?|deltoides|sobre los hombros|carga).{0,100}(?:palo|bast[oó]n|dowel)/u.test(n);
}

function hasHipHingeFinal(text){
  const n=normalize(text);
  const hipsBack=/(?:cadera|pelvis).{0,100}(?:atr[aá]s|posterior)|(?:atr[aá]s|posterior).{0,100}(?:cadera|pelvis)/u.test(n);
  const trunk=/(?:tronco|torso).{0,100}(?:inclina|inclinado|casi paralelo|aproxima.*paralel)|(?:inclina|inclinado).{0,100}(?:tronco|torso)/u.test(n);
  const neutral=/(?:columna|espalda).{0,100}(?:neutr|estable|recta|alinead)/u.test(n);
  const squatConflict=/(?:sentadilla profunda|cadera.{0,80}debajo.{0,50}rodillas|rodillas.{0,80}muy flexionad)/u.test(n);
  return hipsBack&&trunk&&neutral&&!squatConflict;
}

export function hipHingeDowelPlanIssue(plan){
  if(!hasThreePosteriorContacts(plan?.start)||hasForbiddenLoadPlacement(plan?.start)){
    return 'PLAN_MOVEMENT_EQUIPMENT_INVALID:start:hip-hinge-dowel-three-point-contact';
  }
  if(!hasThreePosteriorContacts(plan?.final)||hasForbiddenLoadPlacement(plan?.final)){
    return 'PLAN_MOVEMENT_EQUIPMENT_INVALID:final:hip-hinge-dowel-three-point-contact';
  }
  if(!hasHipHingeFinal(plan?.final)){
    return 'PLAN_MOVEMENT_PHASE_RELATION_INVALID:hip-hinge-dowel-final';
  }
  return null;
}

export function hipHingeDowelVisualGuard(exercise){
  if(!isHipHingeDowelExercise(exercise))return'';
  return [
    'HIP HINGE WITH DOWEL HARD MOVEMENT LOCK:',
    'The dowel is a posture-feedback tool, NOT a front-loaded weight. Keep one straight dowel aligned along the athlete posterior midline for the entire sequence.',
    'START and FINAL must both preserve three visible/defensible contact points: back of head/occiput, upper thoracic spine between the shoulder blades, and sacrum/lumbosacral pelvis. The dowel must remain behind the athlete and touching all three points.',
    'Do NOT place the dowel in front of the torso, against the thighs, across the shoulders or deltoids, and do NOT treat it like a barbell or external load.',
    'START is tall standing with soft knees, neutral spine and stacked pelvis/ribcage. FINAL is a true hip hinge: hips travel clearly backward, torso inclines forward from the hip while the spine stays neutral, knees remain only softly flexed and the three dowel contacts are maintained.',
    'A squat/crouch, loss of any of the three posterior dowel contacts, front-loaded stick position, or a FINAL that is not visibly hinged must fail movement identity.'
  ].join(' ');
}
