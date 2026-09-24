import {createRouteViewModel} from '../modules/route-view-model.js';
import {selectCoachExerciseEffortMetric} from './exercise-effort-metric.js';

function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function rounded(value,digits=1){
  const number=finite(value);
  if(number===null)return null;
  const factor=10**digits;
  return Math.round(number*factor)/factor;
}

function signed(value){
  const number=rounded(value,1);
  if(number===null)return 'Sin comparación';
  return `${number>0?'+':''}${number}`;
}

function currentValue(metric){
  const value=finite(metric?.latest?.value);
  if(value===null)return 'Sin dato comparable';
  const unit=metric?.unit?` ${metric.unit}`:'';
  return `${value}${unit}`;
}

function metricDelta(metric){
  const value=finite(metric?.percentageDelta);
  if(!metric?.comparable||value===null){
    return 'Sin dos referencias comparables';
  }
  return `${value>0?'+':''}${rounded(value,1)}% desde la primera referencia comparable`;
}

function metricTone(assessment,metricKey){
  if(
    assessment?.colorEligible!==true||
    assessment?.causalMetric!==metricKey
  ){
    return 'neutral';
  }
  if(assessment.status==='progress')return 'positive';
  if(assessment.status==='regression')return 'negative';
  return 'neutral';
}

function chartPoints(metric){
  return (Array.isArray(metric?.points)?metric.points:[])
    .map((point)=>({
      date:String(point?.completedAt||'').slice(0,10),
      value:finite(point?.value),
    }))
    .filter((point)=>/^\d{4}-\d{2}-\d{2}$/u.test(point.date)&&point.value!==null);
}

function longitudinalCoachSummary(assessment){
  const evidence=assessment?.evidence||{};
  const confirmation=String(evidence.longitudinalConfirmation||'').trim().toLowerCase();
  const points=Math.trunc(Number(evidence.longitudinalPointsUsed||0));
  if(!['confirmed','conflicted'].includes(confirmation)||points<3)return null;

  const direction=String(evidence.longitudinalDirection||'').trim().toLowerCase();
  const directionLabel=({
    up:'al alza',
    down:'a la baja',
    flat:'estable',
  })[direction]||'sin dirección concluyente';

  return Object.freeze({
    state:confirmation,
    points,
    label:`Tendencia reciente · ${points} exposiciones`,
    detail:confirmation==='confirmed'
      ?`La tendencia ${directionLabel} confirma la señal de la última exposición.`
      :`La tendencia ${directionLabel} no confirma todavía la señal de la última exposición; conviene otra referencia comparable antes de concluir una tendencia sostenida.`,
  });
}

function orderedExercisePerformance(routeVm){
  const exercises=Array.isArray(routeVm?.exerciseProgress?.exercises)
    ?routeVm.exerciseProgress.exercises
    :[];
  const performance=Array.isArray(routeVm?.exercisePerformance)
    ?routeVm.exercisePerformance
    :[];
  const performanceMap=new Map(
    performance
      .filter((item)=>item?.exerciseId)
      .map((item)=>[String(item.exerciseId),item]),
  );
  const regressionIds=new Set(
    performance
      .filter((item)=>
        item?.coachAssessment?.status==='regression'&&
        item?.coachAssessment?.colorEligible===true&&
        item?.exerciseId
      )
      .map((item)=>String(item.exerciseId)),
  );

  return exercises
    .map((exercise,index)=>({
      exercise,
      index,
      attention:regressionIds.has(String(exercise?.exerciseId||''))?0:1,
    }))
    .sort((a,b)=>a.attention-b.attention||a.index-b.index)
    .map(({exercise})=>performanceMap.get(String(exercise?.exerciseId||''))||null);
}

function effortKpi(study,selection){
  const kpis=[...(study?.querySelectorAll?.('.m26-coach-exercise-study-kpi')||[])];
  const kpi=kpis.find((item)=>
    String(item.querySelector?.('span')?.textContent||'').trim()==='Esfuerzo actual'
  );
  if(!kpi)return false;

  const metric=selection?.metric||null;
  const prefix=String(selection?.prefix||'RPE');
  const latest=finite(metric?.latest?.value);
  const delta=finite(metric?.absoluteDelta);
  const value=kpi.querySelector?.('strong');
  const detail=kpi.querySelector?.('small');

  if(value){
    value.textContent=latest!==null
      ?`${prefix} ${latest}`
      :'Sin esfuerzo comparable';
  }
  if(detail){
    detail.textContent=delta!==null
      ?`${prefix} desde inicio ${signed(delta)}`
      :'Sin dos referencias comparables';
  }
  return true;
}

function enhanceLongitudinalContext(study,assessment,documentLike){
  const existing=study?.querySelector?.('[data-m26-coach-exercise-longitudinal]');
  const summary=longitudinalCoachSummary(assessment);
  if(!summary){
    if(existing){
      existing.remove?.();
      return true;
    }
    return false;
  }

  if(existing){
    existing.setAttribute('data-state',summary.state);
    const label=existing.querySelector?.('span');
    const detail=existing.querySelector?.('strong');
    if(label)label.textContent=summary.label;
    if(detail)detail.textContent=summary.detail;
    return true;
  }

  const block=documentLike.createElement('div');
  block.className='m26-coach-exercise-study-recent';
  block.setAttribute('data-m26-coach-exercise-longitudinal','true');
  block.setAttribute('data-state',summary.state);
  block.setAttribute('aria-label','Tendencia longitudinal reciente');
  const label=documentLike.createElement('span');
  label.textContent=summary.label;
  const detail=documentLike.createElement('strong');
  detail.textContent=summary.detail;
  block.append(label,detail);

  const recent=[...(study.querySelectorAll?.('.m26-coach-exercise-study-recent')||[])]
    .filter((node)=>node!==block&&!node.hasAttribute?.('data-m26-coach-exercise-longitudinal'))
    .at(-1)||null;
  if(recent?.nextSibling){
    recent.parentNode?.insertBefore?.(block,recent.nextSibling);
    return true;
  }
  if(recent){
    recent.parentNode?.append?.(block);
    return true;
  }

  const anchor=study.querySelector?.(
    '.m26-coach-exercise-study-charts, .m26-coach-exercise-study-reading'
  );
  if(anchor?.parentNode){
    anchor.parentNode.insertBefore(block,anchor);
    return true;
  }
  study.append?.(block);
  return true;
}

function buildEffortChart(documentLike,selection,assessment){
  const metric=selection?.metric||null;
  const points=chartPoints(metric);
  if(points.length<2)return null;

  const key=String(selection?.key||'averageRpe');
  const label=String(selection?.label||'RPE medio');
  const tone=metricTone(assessment,key);
  const delta=metricDelta(metric);
  const section=documentLike.createElement('section');
  section.className='m26-coach-exercise-study-chart';
  section.setAttribute('data-m26-coach-exercise-chart',key);
  section.setAttribute('data-m26-coach-exercise-chart-tone',tone);

  const heading=documentLike.createElement('div');
  heading.className='m26-coach-exercise-study-chart-heading';
  const title=documentLike.createElement('div');
  const small=documentLike.createElement('small');
  small.textContent=label;
  const strong=documentLike.createElement('strong');
  strong.textContent=currentValue(metric);
  title.append(small,strong);
  const change=documentLike.createElement('span');
  change.textContent=delta;
  heading.append(title,change);

  const chart=documentLike.createElement('m26-echart');
  chart.className='m26-echart m26-coach-exercise-study-echart';
  chart.setAttribute('data-label',label);
  chart.setAttribute('data-unit',String(metric?.unit||''));
  chart.setAttribute('data-tone',tone);
  chart.setAttribute('data-density','standard');
  chart.setAttribute('data-points',JSON.stringify(points));
  chart.setAttribute('aria-label',`${label}. ${delta}.`);

  section.append(heading,chart);
  return section;
}

function effortChartsHost(study,documentLike){
  const existing=study?.querySelector?.('.m26-coach-exercise-study-charts');
  if(existing)return existing;
  const reading=study?.querySelector?.('.m26-coach-exercise-study-reading');
  if(!reading||!reading.parentNode)return null;
  const host=documentLike.createElement('div');
  host.className='m26-coach-exercise-study-charts';
  reading.parentNode.insertBefore(host,reading);
  return host;
}

function enhanceExerciseCard(card,performance,documentLike){
  if(!card||!performance)return false;
  const study=card.querySelector?.('[data-m26-coach-exercise-study]');
  if(!study)return false;

  const facts=performance?.facts||performance||{};
  const metrics=facts?.trend?.metrics||{};
  const assessment=performance?.coachAssessment||null;
  const selection=selectCoachExerciseEffortMetric(metrics,assessment);
  const existing=study.querySelector?.(
    '[data-m26-coach-exercise-chart="averageRpe"],'+
    '[data-m26-coach-exercise-chart="averageRir"]'
  );
  const selectedKey=String(selection?.key||'averageRpe');
  let changed=effortKpi(study,selection);
  changed=enhanceLongitudinalContext(study,assessment,documentLike)||changed;

  if(selectedKey==='averageRpe'){
    if(existing?.getAttribute?.('data-m26-coach-exercise-chart')==='averageRir'){
      const replacement=buildEffortChart(documentLike,selection,assessment);
      if(replacement)existing.replaceWith(replacement);
      else existing.remove?.();
      changed=true;
    }
    return changed;
  }

  const replacement=buildEffortChart(documentLike,selection,assessment);
  if(existing){
    if(replacement)existing.replaceWith(replacement);
    else existing.remove?.();
    return true;
  }
  if(!replacement)return changed;

  const host=effortChartsHost(study,documentLike);
  if(!host)return changed;
  host.append(replacement);
  return true;
}

export function enhanceCoachExerciseEffortContinuity({
  root,
  viewModel,
  state,
  now=new Date(),
}={}){
  if(!root?.querySelectorAll||!root.ownerDocument)return false;
  const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
  const area=String(viewModel?.activeArea||'').trim().toLowerCase();
  if(!['coach','admin'].includes(role)||area!=='progreso')return false;

  const cards=[...(
    root.querySelectorAll?.(
      '.m26-exercise-progress-panel .m26-exercise-progress-list > .m26-exercise-progress-card'
    )||[]
  )];
  if(!cards.length)return false;

  const routeVm=createRouteViewModel(viewModel,state,now);
  const orderedPerformance=orderedExercisePerformance(routeVm);
  let changed=false;

  cards.forEach((card,index)=>{
    changed=enhanceExerciseCard(
      card,
      orderedPerformance[index]||null,
      root.ownerDocument,
    )||changed;
  });

  return changed;
}

export const __coachExerciseEffortContinuityInternals=Object.freeze({
  orderedExercisePerformance,
  chartPoints,
  metricTone,
  longitudinalCoachSummary,
});