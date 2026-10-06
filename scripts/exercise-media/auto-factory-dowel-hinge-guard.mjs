const normalize=value=>String(value||'').trim().toLocaleLowerCase('es');

function descriptorFor(exercise){
  return `${normalize(exercise?.id)} ${normalize(exercise?.name_es)} ${normalize(exercise?.pattern)} ${normalize(exercise?.equipment)}`;
}

export function isHipHingeDowelExercise(exercise){
  const descriptor=descriptorFor(exercise);
  return normalize(exercise?.id)==='ibf-bisagra-de-cadera-con-palo'
    ||(/\bbisagra(?:\s+de\s+cadera)?\b/u.test(descriptor)&&/(?:\bpalo\b|\bbast[oó]n\b|\bdowel\b)/u.test(descriptor));
}

// Stable image geometry for the three-contact dowel drill. An LLM may
// classify muscles but must not invent an impossible hand placement.
const CANONICAL_DOWEL_PHASES=Object.freeze({
  start:'De pie, pies al ancho de las caderas, rodillas suavemente flexionadas y columna neutra. Un único palo recto se coloca VERTICAL por detrás de la espalda, siguiendo la línea media posterior, con contacto simultáneo en nuca/occipucio, espalda torácica alta entre omóplatos y sacro. Una mano agarra el extremo superior del palo DETRÁS DE LA NUCA con codo flexionado; la otra mano sujeta el extremo inferior DETRÁS DE LA ZONA LUMBAR con codo flexionado. Ambos brazos permanecen detrás o a los lados de la espalda; el palo nunca está frente al torso.',
  final:'Bisagra de cadera real: la cadera se desplaza claramente hacia atrás, el tronco se inclina hacia delante desde las caderas unos 45 grados, la columna sigue neutra, rodillas suavemente flexionadas y pies apoyados. El mismo palo permanece VERTICAL detrás de la columna con tres contactos simultáneos: occipucio/nuca, espalda torácica alta entre omóplatos y sacro. Se conserva exactamente el mismo agarre: una mano detrás de la nuca y otra detrás de la zona lumbar, con ambos codos flexionados. No es una sentadilla ni una carga frontal.',
});

export function hipHingeDowelCanonicalPhases(exercise){
  return isHipHingeDowelExercise(exercise)?CANONICAL_DOWEL_PHASES:null;
}

export function hipHingeDowelCanonicalCamera(exercise){
  return isHipHingeDowelExercise(exercise)?'three-quarter-rear':null;
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
  const tool='(?:palo|bast[oó]n|dowel)';
  const badPlacement='(?:delante del (?:cuerpo|torso|abdomen)|frente al (?:cuerpo|torso|abdomen)|a la altura de (?:los )?muslos?|sobre (?:los )?(?:hombros|deltoides)|apoyad[oa]?.{0,35}(?:hombros|deltoides|muslos?))';
  return new RegExp(`${tool}.{0,100}${badPlacement}|${badPlacement}.{0,100}${tool}`,'u').test(n);
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
    'Exact TWO-HAND REAR GRIP: one hand grasps the upper end BEHIND the neck/head with elbow bent, while the opposite hand grasps the lower end BEHIND the lumbar back with elbow bent. Hands may sit at the back or side of the torso but MUST NOT both hang down at the sides or grasp a pole in front of the body.',
    'Use a three-quarter REAR camera view where the stick runs vertically along the back and the three contacts and both hands are legible; show the entire athlete from head to planted feet. This is instructional movement photography, not an athlete portrait.',
    'START and FINAL must both preserve three visible/defensible contact points: back of head/occiput, upper thoracic spine between the shoulder blades, and sacrum/lumbosacral pelvis. The dowel must remain behind the athlete and touching all three points.',
    'Do NOT place the dowel in front of the torso, against the thighs, across the shoulders or deltoids, and do NOT treat it like a barbell or external load.',
    'START is tall standing with soft knees, neutral spine and stacked pelvis/ribcage. FINAL is a true hip hinge: hips travel clearly backward, torso inclines forward from the hip while the spine stays neutral, knees remain only softly flexed and the three dowel contacts are maintained.',
    'A squat/crouch, loss of any of the three posterior dowel contacts, front-loaded stick position, or a FINAL that is not visibly hinged must fail movement identity.'
  ].join(' ');
}
