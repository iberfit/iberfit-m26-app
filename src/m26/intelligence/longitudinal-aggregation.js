import {
  WEARABLE_METRICS,
  defaultVfcMethodForProvider,
  normalizeVfcMethod,
} from '../wearables/contracts.js';
import {
  deduplicateWearableDailyRecords,
} from '../wearables/normalization.js';
import {
  computeProgressSummary,
} from '../engagement/progress-engine.js';

export const LONGITUDINAL_AGGREGATION_SCHEMA_VERSION=
  'iberfit.longitudinal-aggregation.v1';

export const LONGITUDINAL_WINDOWS=Object.freeze([7,28,90]);
export const LONGITUDINAL_BASELINE_DAYS=28;
export const LONGITUDINAL_TREND_DAYS=90;
export const LONGITUDINAL_MIN_TREND_DAYS=7;

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

function round(value,digits=1){
  if(!Number.isFinite(value))return null;
  const power=10**digits;
  return Math.round(value*power)/power;
}

function average(values){
  const valid=values.filter(Number.isFinite);
  return valid.length
    ?valid.reduce((sum,value)=>sum+value,0)/valid.length
    :null;
}

function safeDate(value){
  const date=value instanceof Date
    ?new Date(value)
    :new Date(value);
  if(Number.isNaN(date.getTime())){
    throw new Error('M26_LONGITUDINAL_DATE_INVALID');
  }
  return date;
}

function dateOnly(value){
  return safeDate(value).toISOString().slice(0,10);
}

function shiftDate(value,days){
  const date=safeDate(`${dateOnly(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate()+Number(days||0));
  return date.toISOString().slice(0,10);
}

function rangeFor(endDate,days){
  const safeDays=Number(days);
  if(!Number.isInteger(safeDays)||safeDays<1||safeDays>365){
    throw new Error('M26_LONGITUDINAL_WINDOW_INVALID');
  }
  const end=dateOnly(endDate);
  return deepFreeze({
    days:safeDays,
    startDate:shiftDate(end,-(safeDays-1)),
    endDate:end,
  });
}

function unwrap(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?{...record,...record.body}
    :record;
}

function clientIdOf(record){
  return record?.clientId
    ??record?.client_id
    ??record?.clienteId
    ??record?.cliente_id
    ??null;
}

function recordsForClient(state,clientId){
  const rows=Array.isArray(state?.collections?.wearableDailySummaries)
    ?state.collections.wearableDailySummaries
    :[];
  const scoped=rows
    .map(unwrap)
    .filter((item)=>clientIdOf(item)===clientId);
  return deduplicateWearableDailyRecords(scoped);
}

function qualityRank(value){
  return ({
    limitada:1,
    media:2,
    alta:3,
  })[String(value||'').toLowerCase()]||1;
}

function qualityFromRank(value){
  if(value>=3)return 'alta';
  if(value>=2)return 'media';
  return 'limitada';
}

function vfcMethodFor(record){
  if(!Number.isFinite(record?.metrics?.hrvMs))return null;
  return normalizeVfcMethod(
    record?.vfcMethod
    ||defaultVfcMethodForProvider(record?.provider)
  );
}

function metricDailySeries(records,key,range){
  const grouped=new Map();

  for(const record of records){
    if(record.date<range.startDate||record.date>range.endDate)continue;
    const value=Number(record?.metrics?.[key]);
    if(!Number.isFinite(value))continue;

    if(!grouped.has(record.date)){
      grouped.set(record.date,{
        date:record.date,
        values:[],
        providers:new Set(),
        qualityRanks:[],
        methods:new Set(),
      });
    }

    const day=grouped.get(record.date);
    day.values.push(value);
    if(record.provider)day.providers.add(record.provider);
    day.qualityRanks.push(qualityRank(record.quality));

    if(key==='hrvMs'){
      const method=vfcMethodFor(record);
      if(method)day.methods.add(method);
    }
  }

  return [...grouped.values()]
    .sort((a,b)=>a.date.localeCompare(b.date))
    .map((day)=>deepFreeze({
      date:day.date,
      value:round(average(day.values),1),
      providerCount:day.providers.size,
      providers:Object.freeze([...day.providers].sort()),
      quality:qualityFromRank(
        day.qualityRanks.length
          ?Math.min(...day.qualityRanks)
          :1
      ),
      methods:Object.freeze([...day.methods].sort()),
    }));
}

function vfcComparability(points){
  const methods=new Set(
    points.flatMap((point)=>point.methods||[])
  );

  if(!points.length){
    return deepFreeze({
      comparable:false,
      method:null,
      methods:Object.freeze([]),
      reason:'no_data',
    });
  }

  if(methods.size!==1){
    return deepFreeze({
      comparable:false,
      method:null,
      methods:Object.freeze([...methods].sort()),
      reason:methods.size>1
        ?'mixed_vfc_methods'
        :'vfc_method_unknown',
    });
  }

  const [method]=methods;
  if(method==='unknown'){
    return deepFreeze({
      comparable:false,
      method:null,
      methods:Object.freeze([method]),
      reason:'vfc_method_unknown',
    });
  }

  return deepFreeze({
    comparable:true,
    method,
    methods:Object.freeze([method]),
    reason:null,
  });
}

function metricWindow(records,key,range){
  const points=metricDailySeries(records,key,range);
  const values=points.map((point)=>point.value).filter(Number.isFinite);
  const providers=[...new Set(points.flatMap((point)=>point.providers))].sort();
  const latest=points.at(-1)||null;
  const vfc=key==='hrvMs'
    ?vfcComparability(points)
    :deepFreeze({
        comparable:true,
        method:null,
        methods:Object.freeze([]),
        reason:null,
      });

  return deepFreeze({
    key,
    label:WEARABLE_METRICS[key]?.label||key,
    unit:WEARABLE_METRICS[key]?.unit||null,
    startDate:range.startDate,
    endDate:range.endDate,
    days:range.days,
    daysWithData:points.length,
    coverage:round(points.length/range.days,3),
    average:round(average(values),1),
    min:values.length?Math.min(...values):null,
    max:values.length?Math.max(...values):null,
    latest:latest?.value??null,
    latestDate:latest?.date||null,
    providers:Object.freeze(providers),
    comparable:vfc.comparable,
    vfcMethod:vfc.method,
    vfcMethods:vfc.methods,
    comparabilityReason:vfc.reason,
    points:Object.freeze(points),
  });
}

function windowSnapshot(records,endDate,days){
  const range=rangeFor(endDate,days);
  const metrics=Object.fromEntries(
    Object.keys(WEARABLE_METRICS).map((key)=>[
      key,
      metricWindow(records,key,range),
    ])
  );

  const dates=new Set(
    Object.values(metrics).flatMap(
      (metric)=>metric.points.map((point)=>point.date)
    )
  );
  const providers=[
    ...new Set(
      Object.values(metrics).flatMap((metric)=>metric.providers)
    ),
  ].sort();

  return deepFreeze({
    ...range,
    daysWithAnyData:dates.size,
    coverage:round(dates.size/range.days,3),
    providers:Object.freeze(providers),
    metrics:deepFreeze(metrics),
  });
}

function comparisonFor(current,baseline){
  const hasValues=
    Number.isFinite(current?.average)
    &&Number.isFinite(baseline?.average);

  let comparable=hasValues
    &&current.comparable!==false
    &&baseline.comparable!==false;
  let reason=null;

  if(!hasValues){
    comparable=false;
    reason='insufficient_data';
  }else if(current.key==='hrvMs'){
    if(
      !current.comparable
      ||!baseline.comparable
      ||current.vfcMethod!==baseline.vfcMethod
    ){
      comparable=false;
      reason=
        current.comparabilityReason
        ||baseline.comparabilityReason
        ||'vfc_method_changed';
    }
  }

  const absoluteChange=comparable
    ?round(current.average-baseline.average,1)
    :null;
  const percentChange=
    comparable
    &&Number.isFinite(baseline.average)
    &&baseline.average!==0
      ?round(
          ((current.average-baseline.average)/baseline.average)*100,
          1
        )
      :null;

  return deepFreeze({
    comparable,
    reason,
    currentAverage:current.average,
    baselineAverage:baseline.average,
    absoluteChange,
    percentChange,
    currentCoverage:current.coverage,
    baselineCoverage:baseline.coverage,
    unit:current.unit,
    vfcMethod:
      current.key==='hrvMs'&&comparable
        ?current.vfcMethod
        :null,
  });
}

function linearTrend(points){
  if(points.length<LONGITUDINAL_MIN_TREND_DAYS){
    return deepFreeze({
      available:false,
      reason:'insufficient_days',
      sampleDays:points.length,
      slopePerDay:null,
      slopePerWeek:null,
      direction:'insufficient',
      startDate:points[0]?.date||null,
      endDate:points.at(-1)?.date||null,
    });
  }

  const origin=safeDate(`${points[0].date}T00:00:00Z`).getTime();
  const dayMs=86_400_000;
  const xy=points.map((point)=>({
    x:(
      safeDate(`${point.date}T00:00:00Z`).getTime()-origin
    )/dayMs,
    y:point.value,
  }));
  const meanX=average(xy.map((point)=>point.x));
  const meanY=average(xy.map((point)=>point.y));
  const denominator=xy.reduce(
    (sum,point)=>sum+((point.x-meanX)**2),
    0
  );
  const numerator=xy.reduce(
    (sum,point)=>
      sum+((point.x-meanX)*(point.y-meanY)),
    0
  );
  const slope=denominator>0
    ?numerator/denominator
    :0;
  const slopePerWeek=round(slope*7,2);

  return deepFreeze({
    available:true,
    reason:null,
    sampleDays:points.length,
    slopePerDay:round(slope,3),
    slopePerWeek,
    direction:
      slopePerWeek>0
        ?'increasing'
        :slopePerWeek<0
          ?'decreasing'
          :'flat',
    startDate:points[0]?.date||null,
    endDate:points.at(-1)?.date||null,
  });
}

function trendForMetric(metric){
  if(metric.key==='hrvMs'&&!metric.comparable){
    return deepFreeze({
      available:false,
      reason:metric.comparabilityReason||'vfc_not_comparable',
      sampleDays:metric.daysWithData,
      slopePerDay:null,
      slopePerWeek:null,
      direction:'insufficient',
      startDate:metric.startDate,
      endDate:metric.endDate,
    });
  }
  return linearTrend(metric.points);
}

function progressWindows(state,clientId,now){
  return deepFreeze(
    Object.fromEntries(
      LONGITUDINAL_WINDOWS.map((days)=>[
        `d${days}`,
        computeProgressSummary(
          state,
          clientId,
          {now,days}
        ),
      ])
    )
  );
}

export function buildLongitudinalAggregation(
  state,
  clientId,
  {now=new Date()}={}
){
  if(!clientId){
    throw new Error('M26_LONGITUDINAL_CLIENT_REQUIRED');
  }

  const end=safeDate(now);
  const endDate=dateOnly(end);
  const records=recordsForClient(state,clientId);

  const windows=deepFreeze(
    Object.fromEntries(
      LONGITUDINAL_WINDOWS.map((days)=>[
        `d${days}`,
        windowSnapshot(records,endDate,days),
      ])
    )
  );

  const current28=windows.d28;
  const previousEnd=shiftDate(current28.startDate,-1);
  const previous28=windowSnapshot(
    records,
    previousEnd,
    LONGITUDINAL_BASELINE_DAYS
  );

  const baselineMetrics=deepFreeze(
    Object.fromEntries(
      Object.keys(WEARABLE_METRICS).map((key)=>[
        key,
        comparisonFor(
          current28.metrics[key],
          previous28.metrics[key]
        ),
      ])
    )
  );

  const trendMetrics=deepFreeze(
    Object.fromEntries(
      Object.keys(WEARABLE_METRICS).map((key)=>[
        key,
        trendForMetric(windows.d90.metrics[key]),
      ])
    )
  );

  const progress=progressWindows(
    state,
    clientId,
    end
  );
  const baselineProgress=computeProgressSummary(
    state,
    clientId,
    {
      now:new Date(`${previousEnd}T23:59:59Z`),
      days:LONGITUDINAL_BASELINE_DAYS,
    }
  );

  const adherence=deepFreeze({
    d7:progress.d7?.adherence??null,
    d28:progress.d28?.adherence??null,
    d90:progress.d90?.adherence??null,
    baseline28:baselineProgress?.adherence??null,
    change28VsPrevious28:
      Number.isFinite(progress.d28?.adherence)
      &&Number.isFinite(baselineProgress?.adherence)
        ?round(
            progress.d28.adherence-baselineProgress.adherence,
            3
          )
        :null,
  });

  const temporalComparisons=deepFreeze(
    Object.fromEntries(
      Object.keys(WEARABLE_METRICS).map((key)=>[
        key,
        deepFreeze({
          d7:windows.d7.metrics[key].average,
          d28:windows.d28.metrics[key].average,
          d90:windows.d90.metrics[key].average,
          coverage7:windows.d7.metrics[key].coverage,
          coverage28:windows.d28.metrics[key].coverage,
          coverage90:windows.d90.metrics[key].coverage,
          unit:WEARABLE_METRICS[key].unit,
        }),
      ])
    )
  );

  return deepFreeze({
    schemaVersion:LONGITUDINAL_AGGREGATION_SCHEMA_VERSION,
    clientId,
    generatedAt:end.toISOString(),
    windows,
    baseline:deepFreeze({
      method:'current_28d_vs_immediately_previous_28d',
      current:deepFreeze({
        startDate:current28.startDate,
        endDate:current28.endDate,
      }),
      previous:deepFreeze({
        startDate:previous28.startDate,
        endDate:previous28.endDate,
      }),
      metrics:baselineMetrics,
    }),
    trends:deepFreeze({
      method:'least_squares_on_daily_provider_mean',
      days:LONGITUDINAL_TREND_DAYS,
      minimumSampleDays:LONGITUDINAL_MIN_TREND_DAYS,
      metrics:trendMetrics,
    }),
    adherence,
    progress,
    temporalComparisons,
    dataTrust:deepFreeze({
      wearableSourceCollection:'wearableDailySummaries',
      duplicatePolicy:'latest_per_client_provider_date',
      multiProviderDailyPolicy:'equal_mean_per_day_across_providers',
      baselineMethod:'current_28d_vs_immediately_previous_28d',
      trendMethod:'least_squares_on_daily_provider_mean',
      vfcComparability:'same_known_method_required',
      missingData:'not_imputed',
      coverageAlwaysReported:true,
    }),
    decisionPolicy:deepFreeze({
      automaticPrescriptionChanges:false,
      clinicalClassification:false,
      coachDecisionRequired:true,
      rule:'dato → contexto → entrenador decide',
    }),
  });
}

export const __longitudinalAggregationInternals=deepFreeze({
  rangeFor,
  shiftDate,
  metricDailySeries,
  metricWindow,
  windowSnapshot,
  comparisonFor,
  linearTrend,
  recordsForClient,
});