const normalize=value=>String(value||'').trim().toLowerCase();

export function movementVisualGuard(exercise){
  const descriptor=`${normalize(exercise?.id)} ${normalize(exercise?.name_es)} ${normalize(exercise?.pattern)} ${normalize(exercise?.equipment)}`;

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
