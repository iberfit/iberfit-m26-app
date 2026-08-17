export const COACH_LARGE_LIST_POLICY_VERSION='iberfit.large-list-policy.v1';
export const COACH_LARGE_LIST_MIN_ITEMS=120;
export const COACH_LARGE_LIST_FRAME_BUDGET_MS=24;

function finite(value,fallback=0){const number=Number(value);return Number.isFinite(number)?number:fallback;}

export function classifyCoachListMeasurement({count=0,visibleCount=count,elapsedMs=0}={}){
  const total=Math.max(0,Math.trunc(finite(count)));
  const visible=Math.max(0,Math.min(total,Math.trunc(finite(visibleCount,total))));
  const elapsed=Math.max(0,finite(elapsedMs));
  const enoughItems=total>=COACH_LARGE_LIST_MIN_ITEMS;
  const exceedsBudget=elapsed>=COACH_LARGE_LIST_FRAME_BUDGET_MS;
  const virtualizationRecommended=enoughItems&&exceedsBudget;
  return Object.freeze({
    policyVersion:COACH_LARGE_LIST_POLICY_VERSION,
    count:total,
    visibleCount:visible,
    elapsedMs:Math.round(elapsed*10)/10,
    minItems:COACH_LARGE_LIST_MIN_ITEMS,
    frameBudgetMs:COACH_LARGE_LIST_FRAME_BUDGET_MS,
    virtualizationRecommended,
    reason:virtualizationRecommended
      ?'measured_large_and_slow'
      :!enoughItems
        ?'below_item_threshold'
        :'within_frame_budget',
  });
}

export function markCoachListMeasurement(grid,measurement){
  if(!grid||!measurement)return false;
  const values={
    'data-list-count':measurement.count,
    'data-list-visible-count':measurement.visibleCount,
    'data-list-render-ms':measurement.elapsedMs,
    'data-list-virtualization-recommended':measurement.virtualizationRecommended?'true':'false',
    'data-list-measurement-reason':measurement.reason,
  };
  for(const [name,value] of Object.entries(values)){
    grid.setAttribute?.(name,String(value));
    if(grid.dataset){
      const key=name.replace(/^data-/u,'').replace(/-([a-z])/gu,(_,letter)=>letter.toUpperCase());
      grid.dataset[key]=String(value);
    }
  }
  return true;
}