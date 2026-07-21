import { scoreNormedTest, validateNormContext } from './norms-engine.js';

const TEST_MAPPING=Object.freeze({
  pushUps:{testId:'push_up_standard',protocolId:'standard_max_valid_reps'},
  chairStand30s:{testId:'chair_stand_30s',protocolId:'chair_stand_30s_standard'},
  handgrip:{testId:'handgrip',protocolId:'handgrip_standard'},
  weightBearingLunge:{testId:'weight_bearing_lunge',protocolId:'wblt_distance_cm'}
});

export function scoreIriPerformance(draft={}){
  const context={sexForNorms:draft.sexForNorms,ageYears:draft.ageYears};
  const ctx=validateNormContext(context);
  const results=[];
  for(const [field,meta] of Object.entries(TEST_MAPPING)){
    if(draft[field]===undefined||draft[field]===null||draft[field]==='') continue;
    results.push(scoreNormedTest({testId:meta.testId,value:draft[field],context,protocolId:meta.protocolId}));
  }
  const scored=results.filter(r=>r.scored);
  const composite=scored.length?Math.round(scored.reduce((sum,r)=>sum+r.score,0)/scored.length):null;
  return {context:ctx,results,compositeScore:composite,coverage:{provided:results.length,scored:scored.length,pending:results.filter(r=>!r.scored).length},reviewRequired:!ctx.ok||results.some(r=>!r.scored||r.warnings.length)};
}
