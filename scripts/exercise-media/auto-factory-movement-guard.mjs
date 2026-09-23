const normalize=value=>String(value||'').trim().toLowerCase();

function descriptor(exercise){return`${normalize(exercise?.id)} ${normalize(exercise?.name_es)} ${normalize(exercise?.pattern)} ${normalize(exercise?.equipment)}`;}
function isBearCrawl(exercise){return/(?:ibf-bear-crawl|\bbear\s+crawl\b)/u.test(descriptor(exercise));}

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
  return [
    'MOVEMENT IDENTITY LOCK:',
    'Match the planned exercise and phase literally rather than a visually related movement.',
    'All required body supports, floor contacts, grips, handles, resistance connections and joint relationships described by the plan must be visibly present and physically plausible.',
    'A pose that changes the defining support/contact pattern or body orientation of the planned movement must fail even if the athlete, equipment and scene look correct.'
  ].join(' ');
}

function bearPhaseIssue(text,phase){
  const n=normalize(text);
  const handsFloor=/(?:manos?[^.]{0,100}(?:suelo|piso|apoy|contact)|(?:suelo|piso|apoy|contact)[^.]{0,100}manos?)/u.test(n);
  const feetSupport=/(?:(?:pies|puntas|antepi[eé]s)[^.]{0,100}(?:suelo|piso|apoy|contact)|(?:suelo|piso|apoy|contact)[^.]{0,100}(?:pies|puntas|antepi[eé]s))/u.test(n);
  const feetDenied=/(?:sin\s+contact\w*|no\s+apoy\w*)[^.]{0,160}(?:pies|puntas|antepi[eé]s)/u.test(n)||/(?:pies|puntas|antepi[eé]s)[^.]{0,160}(?:sin\s+contact\w*|no\s+apoy\w*)/u.test(n);
  const kneesHover=/(?:(?:rodillas?)[^.]{0,100}(?:suspend|elevad|sin contacto|no apoy)|(?:suspend|elevad|sin contacto|no apoy\w*)[^.]{0,100}(?:rodillas?))/u.test(n);
  const hipsShoulders=/(?:(?:cadera|pelvis)[^.]{0,120}hombros?|hombros?[^.]{0,120}(?:cadera|pelvis))/u.test(n);
  const trunk=/(?:horizontal|línea recta|linea recta|columna[^.]{0,80}(?:neutra|rígida|rigida)|tronco[^.]{0,80}(?:horizontal|neutro|rígido|rigido))/u.test(n);
  if(feetDenied)return`PLAN_BEAR_CRAWL_FEET_SUPPORT_CONTRADICTION:${phase}`;
  if(!handsFloor)return`PLAN_BEAR_CRAWL_HAND_SUPPORT_MISSING:${phase}`;
  if(!feetSupport)return`PLAN_BEAR_CRAWL_FEET_SUPPORT_MISSING:${phase}`;
  if(!kneesHover)return`PLAN_BEAR_CRAWL_KNEES_HOVER_MISSING:${phase}`;
  if(!hipsShoulders)return`PLAN_BEAR_CRAWL_HIP_HEIGHT_MISSING:${phase}`;
  if(!trunk)return`PLAN_BEAR_CRAWL_TRUNK_ALIGNMENT_MISSING:${phase}`;
  return null;
}

export function movementPlanIssue(exercise,plan){
  if(!isBearCrawl(exercise))return null;
  return bearPhaseIssue(plan?.start,'start')||bearPhaseIssue(plan?.final,'final');
}
