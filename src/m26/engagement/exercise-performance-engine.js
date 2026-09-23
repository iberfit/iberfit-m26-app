import {
  assessExercisePerformance as assessExercisePerformanceCore,
  buildExercisePerformanceTrend as buildExercisePerformanceTrendCore,
  projectExercisePerformanceForRole as projectExercisePerformanceForRoleCore,
} from './exercise-performance-engine-core.js';

export {
  buildExercisePerformanceMemory,
  buildExercisePerformanceTrend,
  listExercisePerformanceMemories,
  normalizeExerciseLoad,
} from './exercise-performance-engine-core.js';

const DIRECTIONAL_ASSESSMENTS=new Set([
  'progress',
  'regression',
]);

function longitudinalExpectedDirection(
  status,
  causalMetric,
  loadDirection,
){
  if(!DIRECTIONAL_ASSESSMENTS.has(status)){
    return null;
  }

  let progressDirection='up';

  if(causalMetric==='averageRpe'){
    progressDirection='down';
  }else if(
    causalMetric==='load'&&
    loadDirection==='lower-is-better'
  ){
    progressDirection='down';
  }

  if(status==='progress'){
    return progressDirection;
  }

  return progressDirection==='up'
    ?'down'
    :'up';
}

function longitudinalAssessmentContext(
  memory,
  assessment,
  {loadDirection='unknown'}={},
){
  const history=
    Array.isArray(memory?.history)
      ?memory.history
      :[];

  if(
    history.length<3||
    !DIRECTIONAL_ASSESSMENTS.has(
      assessment?.status,
    )||
    !assessment?.causalMetric
  ){
    return null;
  }

  const trend=
    buildExercisePerformanceTrendCore(
      memory,
      {window:4},
    );

  const metricTrend=
    trend?.metrics?.[
      assessment.causalMetric
    ]||null;

  if(
    !metricTrend?.comparable||
    metricTrend.pointCount<3
  ){
    return null;
  }

  const expectedDirection=
    longitudinalExpectedDirection(
      assessment.status,
      assessment.causalMetric,
      loadDirection,
    );

  if(!expectedDirection){
    return null;
  }

  return Object.freeze({
    confirmation:
      metricTrend.direction===expectedDirection
        ?'confirmed'
        :'conflicted',
    direction:metricTrend.direction,
    expectedDirection,
    pointsUsed:metricTrend.pointCount,
    window:trend.window,
  });
}

function assessmentWithLongitudinalEvidence(
  assessment,
  context,
){
  if(!context){
    return assessment;
  }

  const evidence=Object.freeze({
    ...(assessment.evidence||{}),
    longitudinalConfirmation:
      context.confirmation,
    longitudinalDirection:
      context.direction,
    longitudinalExpectedDirection:
      context.expectedDirection,
    longitudinalPointsUsed:
      context.pointsUsed,
    longitudinalWindow:
      context.window,
  });

  if(
    context.confirmation==='conflicted'&&
    assessment.status==='progress'
  ){
    return Object.freeze({
      ...assessment,
      status:'indeterminate',
      confidence:'low',
      basis:
        'La mejora de la última exposición todavía no coincide con la tendencia reciente; hace falta otra referencia comparable antes de confirmarla como evolución.',
      label:'Sin conclusión',
      symbol:'·',
      tone:'neutral',
      colorEligible:false,
      evidence,
      causalMetric:null,
    });
  }

  if(
    context.confirmation==='conflicted'&&
    assessment.status==='regression'
  ){
    return Object.freeze({
      ...assessment,
      confidence:'low',
      basis:
        `${assessment.basis} La tendencia reciente no confirma todavía que sea un retroceso sostenido.`,
      evidence,
    });
  }

  return Object.freeze({
    ...assessment,
    evidence,
  });
}

export function assessExercisePerformance(
  memory,
  options={},
){
  const assessment=
    assessExercisePerformanceCore(
      memory,
      options,
    );

  const context=
    longitudinalAssessmentContext(
      memory,
      assessment,
      options,
    );

  return assessmentWithLongitudinalEvidence(
    assessment,
    context,
  );
}

export function projectExercisePerformanceForRole(
  memory,
  options={},
){
  const projected=
    projectExercisePerformanceForRoleCore(
      memory,
      options,
    );

  const role=String(
    options?.role||'client',
  )
    .trim()
    .toLowerCase();

  if(!['coach','admin'].includes(role)){
    return projected;
  }

  return Object.freeze({
    facts:projected.facts,
    coachAssessment:
      assessExercisePerformance(
        memory,
        {
          loadDirection:
            options?.loadDirection||
            'unknown',
        },
      ),
  });
}
