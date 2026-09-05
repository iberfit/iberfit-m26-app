import './echarts-element.js';
import {longitudinalMetricTrust,renderDataTrustStrip} from './data-trust.js';
import {renderGuidanceTrigger} from '../guidance/contextual-guidance.js';

const CLIENT_METRICS=Object.freeze([
  'steps',
  'sleepMinutes',
  'restingHeartRate',
  'hrvMs',
]);

const COACH_METRICS=Object.freeze([
  'steps',
  'activeMinutes',
  'sleepMinutes',
  'restingHeartRate',
  'hrvMs',
  'activeEnergyKcal',
  'workoutMinutes',
]);

const FALLBACK_META=Object.freeze({
  steps:Object.freeze({label:'Pasos',unit:'pasos'}),
  activeMinutes:Object.freeze({label:'Minutos activos',unit:'min'}),
  sleepMinutes:Object.freeze({label:'Sueño',unit:'min'}),
  restingHeartRate:Object.freeze({label:'FC en reposo',unit:'lpm'}),
  hrvMs:Object.freeze({label:'VFC',unit:'ms'}),
  activeEnergyKcal:Object.freeze({label:'Energía activa',unit:'kcal'}),
  workoutMinutes:Object.freeze({label:'Ejercicio',unit:'min'}),
});

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function roleKey(role){
  const key=String(role||'client').trim().toLowerCase();
  return ['coach','admin'].includes(key)?key:'client';
}

function percent(value,digits=0){
  const number=finite(value);
  if(number===null)return '—';
  return `${(number*100).toFixed(digits)} %`;
}

function numberText(value,digits=1){
  const number=finite(value);
  if(number===null)return '—';
  return new Intl.NumberFormat(
    'es-CL',
    {
      maximumFractionDigits:digits,
      minimumFractionDigits:0,
    }
  ).format(number);
}

function valueText(value,unit,digits=1){
  const number=finite(value);
  return number===null
    ?'—'
    :`${numberText(number,digits)}${unit?` ${unit}`:''}`;
}

function metricMeta(metric,key){
  return Object.freeze({
    label:metric?.label||FALLBACK_META[key]?.label||key,
    unit:metric?.unit||FALLBACK_META[key]?.unit||'',
  });
}

function signed(value,unit){
  const number=finite(value);
  if(number===null)return '—';
  const prefix=number>0?'+':'';
  return `${prefix}${numberText(number,1)}${unit?` ${unit}`:''}`;
}

function changeCopy(comparison,unit){
  if(!comparison?.comparable){
    return comparison?.reason?.includes('vfc')
      ||comparison?.reason?.includes('mixed')
      ?'No comparable: el método de VFC no es homogéneo.'
      :'Sin datos comparables suficientes.';
  }

  const percentChange=finite(comparison.percentChange);
  const suffix=percentChange===null
    ?''
    :` (${percentChange>0?'+':''}${numberText(percentChange,1)} %)`;

  return `Cambio vs. 28 días previos: ${signed(
    comparison.absoluteChange,
    unit
  )}${suffix}.`;
}

function trendCopy(trend,unit){
  if(!trend?.available){
    return trend?.reason?.includes('vfc')
      ||trend?.reason==='mixed_vfc_methods'
      ?'Tendencia no comparable por método de VFC.'
      :'Tendencia pendiente de cobertura suficiente.';
  }

  const direction=({
    increasing:'Sube',
    decreasing:'Baja',
    flat:'Estable',
  })[trend.direction]||'Cambio';

  return `${direction}: ${signed(
    trend.slopePerWeek,
    unit
  )} por semana · regresión lineal de ${trend.sampleDays} días con datos.`;
}

function vfcMethodCopy(metric){
  if(metric?.key!=='hrvMs')return '';
  if(metric.comparable&&metric.vfcMethod){
    return `Método: ${String(metric.vfcMethod).toUpperCase()}.`;
  }
  return 'Método de VFC no homogéneo: no se fuerza una comparación.';
}

function providerCopy(metric){
  const providers=Array.isArray(metric?.providers)
    ?metric.providers
    :[];
  if(!providers.length)return 'Sin procedencia disponible.';
  return `Procedencia: ${providers.join(', ')}.`;
}

function percentagePointCopy(value){
  const number=finite(value);
  if(number===null)return 'Todavía sin periodo anterior comparable.';
  const points=number*100;
  if(Math.abs(points)<0.05)return 'Sin cambio frente a los 28 días anteriores.';
  return `${points>0?'+':''}${numberText(points,1)} puntos porcentuales frente a los 28 días anteriores.`;
}

function clientProofState(aggregate){
  const adherence=finite(aggregate?.adherence?.d28);
  const adherenceChange=finite(
    aggregate?.adherence?.change28VsPrevious28
  );
  const comparableMetrics=CLIENT_METRICS
    .filter((key)=>aggregate?.baseline?.metrics?.[key]?.comparable)
    .map((key)=>metricMeta(aggregate?.windows?.d28?.metrics?.[key],key).label);
  const observedMetrics=CLIENT_METRICS
    .filter((key)=>{
      const metric=aggregate?.windows?.d28?.metrics?.[key];
      return finite(metric?.average)!==null&&finite(metric?.coverage)!==null&&finite(metric?.coverage)>0;
    });
  const comparisonCount=comparableMetrics.length+(adherenceChange===null?0:1);

  if(comparisonCount>=2){
    return Object.freeze({
      status:'Base comparable disponible',
      copy:'Ya existen varias referencias confirmadas para observar cambios sin convertirlos automáticamente en una conclusión clínica.',
      adherence,
      adherenceChange,
      comparableMetrics,
      comparisonCount,
      next:'Mantén tus próximas sesiones y registros al día. IBERFIT irá haciendo más sólida la comparación con el tiempo.',
    });
  }

  if(comparisonCount===1){
    return Object.freeze({
      status:'Ya aparece una primera comparación',
      copy:'Hay una referencia comparable, pero todavía conviene acumular más historial antes de resumir una tendencia.',
      adherence,
      adherenceChange,
      comparableMetrics,
      comparisonCount,
      next:'Completa tus próximas sesiones y registros para añadir una segunda referencia comparable.',
    });
  }

  if(adherence!==null||observedMetrics.length){
    return Object.freeze({
      status:'Estamos construyendo tu referencia',
      copy:'Ya hay datos confirmados, aunque todavía no existe suficiente historial comparable para hablar de tendencia.',
      adherence,
      adherenceChange,
      comparableMetrics,
      comparisonCount,
      next:'Sigue registrando tu actividad y completando tus sesiones. No rellenaremos los días que falten ni inventaremos cambios.',
    });
  }

  return Object.freeze({
    status:'Aún no hay suficiente historial',
    copy:'Necesitamos registros confirmados antes de poder comparar periodos y mostrar cambios reales.',
    adherence,
    adherenceChange,
    comparableMetrics,
    comparisonCount,
    next:'Tu siguiente sesión o registro confirmado empezará a construir la línea de referencia.',
  });
}

function clientProofPanel(aggregate){
  const proof=clientProofState(aggregate);
  const metricCopy=proof.comparableMetrics.length
    ?proof.comparableMetrics.join(' · ')
    :'Aún sin señales comparables';

  return `<section class="m26-panel m26-panel-soft m26-progress-proof" aria-labelledby="m26-progress-proof-title"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Proof of Progress</p><h2 id="m26-progress-proof-title">¿Estoy progresando?</h2><p><strong>${escapeHtml(proof.status)}.</strong> ${escapeHtml(proof.copy)}</p></div><span class="m26-chip">28 días</span></div><div class="m26-data-kpis"><div><span>Constancia confirmada</span><strong>${escapeHtml(percent(proof.adherence))}</strong><small>${escapeHtml(percentagePointCopy(proof.adherenceChange))}</small></div><div><span>Cambios que ya podemos comparar</span><strong>${escapeHtml(proof.comparisonCount)}</strong><small>${escapeHtml(metricCopy)}</small></div></div><p class="m26-notice"><strong>Siguiente paso</strong><br>${escapeHtml(proof.next)}</p></section>`;
}

function chartPayload(points){
  return escapeHtml(
    JSON.stringify(
      (Array.isArray(points)?points:[])
        .filter((point)=>finite(point?.value)!==null)
        .map((point)=>({
          date:point.date,
          value:point.value,
        }))
    )
  );
}

function fallbackTable(metric,meta){
  const points=Array.isArray(metric?.points)
    ?metric.points
    :[];

  if(!points.length){
    return '<p class="m26-empty-copy">Sin días con datos en este periodo.</p>';
  }

  return `<details class="m26-data-fallback"><summary>Ver datos del gráfico</summary><div class="m26-data-table-wrap"><table><thead><tr><th>Fecha</th><th>${escapeHtml(meta.label)}</th><th>Calidad</th></tr></thead><tbody>${points.map((point)=>`<tr><td>${escapeHtml(point.date)}</td><td>${escapeHtml(valueText(point.value,meta.unit,1))}</td><td>${escapeHtml(point.quality||'—')}</td></tr>`).join('')}</tbody></table></div></details>`;
}

function metricCard(aggregate,key,role){
  const professional=role!=='client';
  const chartWindow=professional
    ?aggregate?.windows?.d90
    :aggregate?.windows?.d28;
  const metric=chartWindow?.metrics?.[key];
  if(!metric)return '';

  const meta=metricMeta(metric,key);
  const comparison=aggregate?.baseline?.metrics?.[key];
  const trend=aggregate?.trends?.metrics?.[key];
  const d7=aggregate?.windows?.d7?.metrics?.[key];
  const d28=aggregate?.windows?.d28?.metrics?.[key];
  const d90=aggregate?.windows?.d90?.metrics?.[key];
  const trust=longitudinalMetricTrust(metric,aggregate?.dataTrust);
  const trustStrip=renderDataTrustStrip(trust,{role,compact:!professional});
  const metricGuidance=key==='hrvMs'?renderGuidanceTrigger('vfc',{label:'Ayuda sobre VFC'}):'';

  const clientSummary=`
    <div class="m26-data-kpis">
      <div><span>Media 28 días</span><strong>${escapeHtml(valueText(d28?.average,meta.unit,1))}</strong></div>
      <div><span>Cobertura</span><strong>${escapeHtml(percent(d28?.coverage))}</strong></div>
    </div>
    <p>${escapeHtml(changeCopy(comparison,meta.unit))}</p>
    ${trustStrip}
  `;

  const coachSummary=`
    <div class="m26-data-kpis m26-data-kpis-pro">
      <div><span>7 días</span><strong>${escapeHtml(valueText(d7?.average,meta.unit,1))}</strong><small>${escapeHtml(percent(d7?.coverage))} cobertura</small></div>
      <div><span>28 días</span><strong>${escapeHtml(valueText(d28?.average,meta.unit,1))}</strong><small>${escapeHtml(percent(d28?.coverage))} cobertura</small></div>
      <div><span>90 días</span><strong>${escapeHtml(valueText(d90?.average,meta.unit,1))}</strong><small>${escapeHtml(percent(d90?.coverage))} cobertura</small></div>
    </div>
    <p>${escapeHtml(changeCopy(comparison,meta.unit))}</p>
    <p>${escapeHtml(trendCopy(trend,meta.unit))}</p>
    <p>${escapeHtml(providerCopy(metric))} ${escapeHtml(vfcMethodCopy(metric))}</p>
    ${trustStrip}
  `;

  return `<article class="m26-panel m26-data-metric-card" data-metric="${escapeHtml(key)}"><div class="m26-panel-heading"><div><p class="m26-eyebrow">${professional?'Comparativa longitudinal':'Evolución'}</p><div class="m26-guidance-inline"><h3>${escapeHtml(meta.label)}</h3>${metricGuidance}</div></div><span class="m26-chip">${professional?'90 días':'28 días'}</span></div>${professional?coachSummary:clientSummary}<m26-echart class="m26-echart" data-label="${escapeHtml(meta.label)}" data-unit="${escapeHtml(meta.unit)}" data-points="${chartPayload(metric.points)}" aria-label="${escapeHtml(`${meta.label}, evolución de ${professional?'90':'28'} días`)}"></m26-echart>${fallbackTable(metric,meta)}</article>`;
}

function adherencePanel(aggregate,role){
  const adherence=aggregate?.adherence||{};
  if(role==='client'){
    return `<section class="m26-panel m26-data-adherence"><p class="m26-eyebrow">Constancia</p><h3>Adherencia de 28 días</h3><strong>${escapeHtml(percent(adherence.d28))}</strong><p>Se muestra como contexto de continuidad, no como una valoración clínica.</p></section>`;
  }

  const change=finite(adherence.change28VsPrevious28);
  return `<section class="m26-panel m26-data-adherence"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Adherencia</p><h3>Comparativa temporal</h3></div></div><div class="m26-data-kpis m26-data-kpis-pro"><div><span>7 días</span><strong>${escapeHtml(percent(adherence.d7))}</strong></div><div><span>28 días</span><strong>${escapeHtml(percent(adherence.d28))}</strong></div><div><span>90 días</span><strong>${escapeHtml(percent(adherence.d90))}</strong></div></div><p>Baseline 28 días previos: ${escapeHtml(percent(adherence.baseline28))}${change===null?'':` · cambio ${escapeHtml(`${change>0?'+':''}${numberText(change*100,1)} pp`)}`}.</p></section>`;
}

function trustPanel(aggregate,role){
  const trust=aggregate?.dataTrust||{};
  const professional=role!=='client';

  if(!professional){
    return `<section class="m26-panel m26-panel-soft m26-data-trust"><p class="m26-eyebrow">Confianza del dato</p><h3>Qué estás viendo</h3><p>IBERFIT muestra tendencias con los días realmente disponibles. Los días sin dato no se inventan ni se convierten en cero.</p><p>Si una métrica no es comparable, se indica expresamente.</p></section>`;
  }

  return `<section class="m26-panel m26-panel-soft m26-data-trust"><p class="m26-eyebrow">Confianza y método</p><h3>Lectura profesional trazable</h3><dl><div><dt>Fuente</dt><dd>${escapeHtml(trust.wearableSourceCollection||'—')}</dd></div><div><dt>Baseline</dt><dd>28 días actuales vs. 28 inmediatamente previos</dd></div><div><dt>Tendencia</dt><dd>Regresión lineal de medias diarias · 90 días</dd></div><div><dt>Multifuente</dt><dd>Media diaria por proveedor antes de la tendencia</dd></div><div><dt>Datos faltantes</dt><dd>No imputados · cobertura visible</dd></div><div><dt>VFC</dt><dd>Mismo método conocido obligatorio para comparar</dd></div></dl></section>`;
}

export function renderLongitudinalDataExperience(
  aggregate,
  {role='client'}={}
){
  if(!aggregate?.windows?.d28||!aggregate?.windows?.d90){
    return '';
  }

  const normalizedRole=roleKey(role);
  const professional=normalizedRole!=='client';
  const metrics=professional?COACH_METRICS:CLIENT_METRICS;
  const proof=professional?'':clientProofPanel(aggregate);

  return `<section class="m26-stack m26-data-experience" data-role-density="${professional?'professional':'simple'}">${proof}<section class="m26-panel m26-panel-hero m26-data-hero"><p class="m26-eyebrow">Datos y evolución</p><h2>${professional?'Análisis longitudinal':'Tu evolución'}</h2><p>${professional?'Comparativas 7/28/90 días, baseline, tendencia, cobertura y procedencia para apoyar una decisión profesional.':'Una lectura sencilla de tus últimas semanas con cobertura visible y sin rellenar días que faltan.'}</p></section>${adherencePanel(aggregate,normalizedRole)}<div class="${professional?'m26-data-grid m26-data-grid-professional':'m26-data-grid'}">${metrics.map((key)=>metricCard(aggregate,key,normalizedRole)).join('')}</div>${trustPanel(aggregate,normalizedRole)}<p class="m26-notice m26-data-decision-rule">Dato → contexto → entrenador decide. Las tendencias no cambian automáticamente tu entrenamiento ni constituyen una clasificación clínica.</p></section>`;
}

export const __longitudinalUiInternals=Object.freeze({
  roleKey,
  percent,
  numberText,
  changeCopy,
  trendCopy,
  fallbackTable,
  metricCard,
  percentagePointCopy,
  clientProofState,
  clientProofPanel,
});