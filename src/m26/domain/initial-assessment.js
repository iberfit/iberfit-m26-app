export const INITIAL_ASSESSMENT_MODES=Object.freeze({
  iri:'iri',
  deferred:'deferred',
});

function bodyOf(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :{};
}

function profileOf(record){
  const body=bodyOf(record);
  if(record?.profile&&typeof record.profile==='object'&&!Array.isArray(record.profile))return record.profile;
  if(body?.profile&&typeof body.profile==='object'&&!Array.isArray(body.profile))return body.profile;
  return {};
}

function clean(value){
  return String(value??'').trim().toLowerCase();
}

export function normalizeInitialAssessmentMode(value,{fallback=INITIAL_ASSESSMENT_MODES.iri}={}){
  const normalized=clean(value);
  if(normalized===INITIAL_ASSESSMENT_MODES.deferred)return INITIAL_ASSESSMENT_MODES.deferred;
  if(normalized===INITIAL_ASSESSMENT_MODES.iri)return INITIAL_ASSESSMENT_MODES.iri;
  return fallback===INITIAL_ASSESSMENT_MODES.deferred
    ?INITIAL_ASSESSMENT_MODES.deferred
    :INITIAL_ASSESSMENT_MODES.iri;
}

export function initialAssessmentModeFrom(record={}){
  const body=bodyOf(record);
  const profile=profileOf(record);
  const value=
    record?.initialAssessmentMode??
    record?.initial_assessment_mode??
    body?.initialAssessmentMode??
    body?.initial_assessment_mode??
    profile?.initialAssessmentMode??
    profile?.initial_assessment_mode;
  return normalizeInitialAssessmentMode(value);
}

export function isIriDeferred(record={}){
  return initialAssessmentModeFrom(record)===INITIAL_ASSESSMENT_MODES.deferred;
}

export const __initialAssessmentInternals=Object.freeze({bodyOf,profileOf,clean});
