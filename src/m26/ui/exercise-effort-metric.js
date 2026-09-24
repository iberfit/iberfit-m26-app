function finiteMetricValue(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function metricHasEvidence(metric){
  if(!metric||typeof metric!=='object')return false;
  if(finiteMetricValue(metric?.latest?.value)!==null)return true;
  return (Array.isArray(metric?.points)?metric.points:[]).some(
    (point)=>finiteMetricValue(point?.value)!==null,
  );
}

const EFFORT_METRICS=Object.freeze({
  averageRpe:Object.freeze({
    key:'averageRpe',
    label:'RPE medio',
    prefix:'RPE',
  }),
  averageRir:Object.freeze({
    key:'averageRir',
    label:'RIR medio',
    prefix:'RIR',
  }),
});

export function selectCoachExerciseEffortMetric(metrics={},assessment=null){
  const rpe=metrics?.averageRpe||null;
  const rir=metrics?.averageRir||null;
  const hasRpe=metricHasEvidence(rpe);
  const hasRir=metricHasEvidence(rir);
  const causalMetric=String(assessment?.causalMetric||'');

  if(causalMetric==='averageRir'&&hasRir){
    return Object.freeze({...EFFORT_METRICS.averageRir,metric:rir});
  }

  if(causalMetric==='averageRpe'&&hasRpe){
    return Object.freeze({...EFFORT_METRICS.averageRpe,metric:rpe});
  }

  if(hasRpe){
    return Object.freeze({...EFFORT_METRICS.averageRpe,metric:rpe});
  }

  if(hasRir){
    return Object.freeze({...EFFORT_METRICS.averageRir,metric:rir});
  }

  return Object.freeze({...EFFORT_METRICS.averageRpe,metric:rpe});
}
