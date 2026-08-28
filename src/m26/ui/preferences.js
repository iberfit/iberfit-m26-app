// RC71_2_EXPERIENCE_PREFERENCES_BEGIN
export const IBERFIT_EXPERIENCE_PREFERENCES_VERSION=1;

const STORAGE_PREFIX='iberfit:m26:experience-preferences:v1:';
const SOCIAL_AUDIENCES=new Set(['private','coach']);

const DEFAULTS=Object.freeze({
  version:IBERFIT_EXPERIENCE_PREFERENCES_VERSION,
  social:Object.freeze({
    sharingEnabled:false,
    audience:'private',
    shareSessionSummary:false,
    shareMilestones:false,
  }),
  notifications:Object.freeze({
    sessionReminders:false,
    scheduleChanges:false,
    planPublished:false,
    coachMessages:false,
    challenges:false,
    milestones:false,
  }),
});

function cloneDefaults(){
  return {
    version:DEFAULTS.version,
    social:{...DEFAULTS.social},
    notifications:{...DEFAULTS.notifications},
  };
}

function normalizeScope(scope){
  const value=String(scope||'').trim();
  if(!value)return null;

  return value
    .replace(/[^a-zA-Z0-9._-]+/g,'_')
    .slice(0,160);
}

function storage(){
  try{
    return globalThis?.localStorage||null;
  }catch{
    return null;
  }
}

function keyFor(scope){
  const normalized=normalizeScope(scope);
  return normalized?`${STORAGE_PREFIX}${normalized}`:null;
}

function boolean(value){
  return value===true;
}

export function normalizeIberfitExperiencePreferences(value){
  const source=
    value&&typeof value==='object'&&!Array.isArray(value)
      ?value
      :{};

  const social=
    source.social&&typeof source.social==='object'
      ?source.social
      :{};

  const notifications=
    source.notifications&&typeof source.notifications==='object'
      ?source.notifications
      :{};

  const audience=
    SOCIAL_AUDIENCES.has(String(social.audience||''))
      ?String(social.audience)
      :'private';

  return Object.freeze({
    version:IBERFIT_EXPERIENCE_PREFERENCES_VERSION,
    social:Object.freeze({
      sharingEnabled:boolean(social.sharingEnabled),
      audience,
      shareSessionSummary:boolean(social.shareSessionSummary),
      shareMilestones:boolean(social.shareMilestones),
    }),
    notifications:Object.freeze({
      sessionReminders:boolean(notifications.sessionReminders),
      scheduleChanges:boolean(notifications.scheduleChanges),
      planPublished:boolean(notifications.planPublished),
      coachMessages:boolean(notifications.coachMessages),
      challenges:boolean(notifications.challenges),
      milestones:boolean(notifications.milestones),
    }),
  });
}

export function readIberfitExperiencePreferences(scope){
  const key=keyFor(scope);
  if(!key)return normalizeIberfitExperiencePreferences(cloneDefaults());

  try{
    const raw=storage()?.getItem?.(key);
    if(!raw)return normalizeIberfitExperiencePreferences(cloneDefaults());

    return normalizeIberfitExperiencePreferences(
      JSON.parse(raw)
    );
  }catch{
    return normalizeIberfitExperiencePreferences(cloneDefaults());
  }
}

function writePreferences(scope,preferences){
  const key=keyFor(scope);
  if(!key)throw new Error('M26_EXPERIENCE_PREFERENCE_SCOPE_REQUIRED');

  const normalized=
    normalizeIberfitExperiencePreferences(preferences);

  try{
    storage()?.setItem?.(
      key,
      JSON.stringify(normalized)
    );
  }catch{}

  return normalized;
}

export function updateIberfitExperiencePreference(
  scope,
  path,
  value
){
  const current=readIberfitExperiencePreferences(scope);
  const next={
    version:current.version,
    social:{...current.social},
    notifications:{...current.notifications},
  };

  const key=String(path||'').trim();

  switch(key){
    case 'social.sharingEnabled':
      next.social.sharingEnabled=Boolean(value);
      if(!next.social.sharingEnabled){
        next.social.audience='private';
      }
      break;
    case 'social.audience':
      if(!SOCIAL_AUDIENCES.has(String(value||''))){
        throw new Error('M26_SOCIAL_AUDIENCE_UNSUPPORTED');
      }
      next.social.audience=String(value);
      break;
    case 'social.shareSessionSummary':
      next.social.shareSessionSummary=Boolean(value);
      break;
    case 'social.shareMilestones':
      next.social.shareMilestones=Boolean(value);
      break;
    case 'notifications.sessionReminders':
    case 'notifications.scheduleChanges':
    case 'notifications.planPublished':
    case 'notifications.coachMessages':
    case 'notifications.challenges':
    case 'notifications.milestones':{
      const [,notificationKey]=key.split('.');
      next.notifications[notificationKey]=Boolean(value);
      break;
    }
    default:
      throw new Error('M26_EXPERIENCE_PREFERENCE_UNSUPPORTED');
  }

  return writePreferences(scope,next);
}

export function resetIberfitExperiencePreferences(scope){
  return writePreferences(scope,cloneDefaults());
}

export function clearIberfitExperiencePreferences(scope){
  const key=keyFor(scope);
  if(!key)return false;
  const target=storage();
  if(!target)return true;
  try{
    target.removeItem?.(key);
    return true;
  }catch{
    return false;
  }
}

export function socialPolicyFromPreferences(preferences){
  const normalized=
    normalizeIberfitExperiencePreferences(preferences);

  const sharingEnabled=
    normalized.social.sharingEnabled;

  return Object.freeze({
    visibility:
      sharingEnabled
        ?normalized.social.audience
        :'private',
    sharingEnabled,
    audience:
      sharingEnabled
        ?normalized.social.audience
        :'private',
    shareSessionSummary:
      sharingEnabled&&
      normalized.social.shareSessionSummary,
    shareMilestones:
      sharingEnabled&&
      normalized.social.shareMilestones,
    leaderboardEnabled:false,
    automaticPublishing:false,
    rationale:sharingEnabled
      ?'Solo se permite compartir manualmente dentro del alcance elegido. No existe publicación automática ni ranking público.'
      :'Los logros permanecen privados hasta que exista consentimiento explícito.',
  });
}

export function notificationConsentFromPreferences(preferences){
  const normalized=
    normalizeIberfitExperiencePreferences(preferences);

  return Object.freeze({
    ...normalized.notifications,
    pushServiceActive:false,
    essentialSyncWarningsAlwaysVisible:true,
  });
}
// RC71_2_EXPERIENCE_PREFERENCES_END
