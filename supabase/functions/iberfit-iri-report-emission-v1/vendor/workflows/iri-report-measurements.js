// The same measured-value and recovery geometry for browser and official IRI.
export function measuredNumber(value,min=-Infinity,max=Infinity){
 if(typeof value==='string'){
  const text=value.trim().replace(',','.');
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(text))return null;
  value=Number(text);
 }
 return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
}
export function recoveryObservations(cardio={}){
 const slots=[['Reposo','restingHr'],['Final','finalHr'],['1 min','oneMinuteHr'],['2 min','twoMinuteHr']];
 const points=cardio.skipped===true?[]:slots.flatMap(([label,key],index)=>{
  const value=measuredNumber(cardio[key],1,300);
  return value===null?[]:[{index,label,value}];
 });
 if(!points.length)return {points,segments:[],min:0,max:300};
 const values=points.map(p=>p.value);
 const min=Math.max(0,Math.floor(Math.min(...values)/10)*10-10),max=Math.min(300,Math.ceil(Math.max(...values)/10)*10+10);
 const segments=[];
 // Baseline and end-of-effort are distinct phases, not adjacent time samples.
 // Only connect consecutive recovery readings; never bridge a missing minute.
 for(let i=1;i<points.length;i++)if(points[i-1].index>=1&&points[i].index-points[i-1].index===1)segments.push([points[i-1],points[i]]);
 return {points,segments,min,max};
}
export function bodyMeasurements(body={}){
 const skipped=body.skipped===true;
 const get=(key,min,max)=>skipped?null:measuredNumber(body[key],min,max);
 const weight=get('weightKg',1,1000),fatPct=get('bodyFatPercent',0,100);
 const muscle=get('muscleMassKg',0,weight??1000);
 const explicitFat=get('fatMassKg',0,weight??1000);
 const rawLean=get('leanMassKg',0,weight??1000);
 const calculatedFat=weight!==null&&fatPct!==null?Math.round(weight*fatPct*10/100)/10:null;
 // Explicit values are not silently substituted with muscle mass.
 const fatMass=explicitFat??calculatedFat;
 // Tolerate instrument rounding but never derive one compartment from conflicting inputs.
 const tolerance=Math.max(.5,(weight??0)*.01);
 const fatConflict=explicitFat!==null&&calculatedFat!==null&&Math.abs(explicitFat-calculatedFat)>tolerance;
 const calculatedLean=!fatConflict&&weight!==null&&fatMass!==null?Math.round((weight-fatMass)*10)/10:null;
 const leanConflict=rawLean!==null&&calculatedLean!==null&&Math.abs(rawLean-calculatedLean)>tolerance;
 const plausible=rawLean!==null&&!leanConflict&&(muscle===null||rawLean>=muscle);
 const lean=plausible?rawLean:(calculatedLean!==null&&(muscle===null||calculatedLean>=muscle)?calculatedLean:null);
 return {weightKg:weight,bodyFatPercent:fatPct,muscleMassKg:muscle,fatMassKg:fatMass,leanMassKg:lean,
  bodyWaterPercent:get('bodyWaterPercent',0,100),waistCm:get('waistCm',1,500),visceralFatLevel:get('visceralFatLevel',0,1000),
  fatMassDerived:explicitFat===null&&calculatedFat!==null,leanMassDerived:!plausible&&lean!==null,
  rawLeanInconsistent:body.leanMassKg!=null&&!plausible&&!skipped,fatConflict,leanConflict,skipped};
}
