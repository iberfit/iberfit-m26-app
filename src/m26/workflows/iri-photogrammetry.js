export const IRI_PHOTO_PROTOCOL_VERSION='iri-photogrammetry-2026.10-v1';
export const IRI_PHOTO_LANDMARK_SCHEMA='manual-4-point-v1';
export const IRI_PHOTO_VIEWS=Object.freeze(['front','back','left','right']);

export const IRI_PHOTO_LANDMARKS=Object.freeze({
  front:Object.freeze(['shoulderLeft','shoulderRight','pelvisLeft','pelvisRight']),
  back:Object.freeze(['shoulderLeft','shoulderRight','pelvisLeft','pelvisRight']),
  left:Object.freeze(['ear','shoulder','hip','ankle']),
  right:Object.freeze(['ear','shoulder','hip','ankle']),
});

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clamp01(value){
  const n=finite(value);
  if(n===null)return null;
  return Math.max(0,Math.min(1,n));
}
export function normalizePhotoPoint(point){
  if(!point||typeof point!=='object'||Array.isArray(point))return null;
  const x=clamp01(point.x),y=clamp01(point.y);
  if(x===null||y===null)return null;
  return Object.freeze({x,y});
}
export function median(values=[]){
  const rows=(Array.isArray(values)?values:[])
    .map(finite)
    .filter((value)=>value!==null)
    .sort((a,b)=>a-b);
  if(!rows.length)return null;
  const middle=Math.floor(rows.length/2);
  return rows.length%2?rows[middle]:(rows[middle-1]+rows[middle])/2;
}
export function percentAsymmetry(left,right){
  const a=finite(left),b=finite(right);
  if(a===null||b===null)return null;
  const denominator=(Math.abs(a)+Math.abs(b))/2;
  if(denominator===0)return 0;
  return Number((Math.abs(a-b)/denominator*100).toFixed(1));
}
function radiansToDegrees(value){return value*180/Math.PI;}
export function angleDegrees(a,vertex,b){
  const p1=normalizePhotoPoint(a),v=normalizePhotoPoint(vertex),p2=normalizePhotoPoint(b);
  if(!p1||!v||!p2)return null;
  const ax=p1.x-v.x,ay=p1.y-v.y,bx=p2.x-v.x,by=p2.y-v.y;
  const ma=Math.hypot(ax,ay),mb=Math.hypot(bx,by);
  if(ma===0||mb===0)return null;
  const cosine=Math.max(-1,Math.min(1,(ax*bx+ay*by)/(ma*mb)));
  return Number(radiansToDegrees(Math.acos(cosine)).toFixed(1));
}
export function segmentTiltDegrees(a,b){
  const p1=normalizePhotoPoint(a),p2=normalizePhotoPoint(b);
  if(!p1||!p2)return null;
  if(p1.x===p2.x&&p1.y===p2.y)return null;
  let angle=radiansToDegrees(Math.atan2(p2.y-p1.y,p2.x-p1.x));
  while(angle>90)angle-=180;
  while(angle<-90)angle+=180;
  return Number(angle.toFixed(1));
}
export function segmentFromVerticalDegrees(a,b){
  const tilt=segmentTiltDegrees(a,b);
  if(tilt===null)return null;
  const magnitude=Math.abs(90-Math.abs(tilt));
  return Number(magnitude.toFixed(1));
}
export function normalizeManualLandmarks(raw={}){
  const out={};
  for(const view of IRI_PHOTO_VIEWS){
    const source=raw?.[view];
    if(!source||typeof source!=='object'||Array.isArray(source))continue;
    const required=IRI_PHOTO_LANDMARKS[view];
    const points={};
    for(const key of required){
      const point=normalizePhotoPoint(source[key]);
      if(point)points[key]=point;
    }
    if(Object.keys(points).length)out[view]=Object.freeze(points);
  }
  return Object.freeze(out);
}
export function validateManualLandmarks(raw={},availableViews=IRI_PHOTO_VIEWS){
  const landmarks=normalizeManualLandmarks(raw);
  const views=(Array.isArray(availableViews)?availableViews:[])
    .filter((view)=>IRI_PHOTO_VIEWS.includes(view));
  const missing=[];
  for(const view of views){
    for(const key of IRI_PHOTO_LANDMARKS[view]){
      if(!landmarks?.[view]?.[key])missing.push(`${view}.${key}`);
    }
  }
  return Object.freeze({
    ok:missing.length===0,
    missing:Object.freeze(missing),
    landmarks,
    completeViews:Object.freeze(
      views.filter((view)=>IRI_PHOTO_LANDMARKS[view].every((key)=>landmarks?.[view]?.[key]))
    ),
  });
}
function metric(id,label,value,view){
  return value===null?null:Object.freeze({id,label,value,unit:'deg',view,kind:'geometry'});
}
export function calculatePhotogrammetryMeasurements(raw={}){
  const landmarks=normalizeManualLandmarks(raw);
  const metrics=[];
  for(const view of ['front','back']){
    const points=landmarks[view];
    if(!points)continue;
    const shoulder=segmentTiltDegrees(points.shoulderLeft,points.shoulderRight);
    const pelvis=segmentTiltDegrees(points.pelvisLeft,points.pelvisRight);
    metrics.push(metric(`${view}.shoulderTilt`,'Inclinación de hombros',shoulder,view));
    metrics.push(metric(`${view}.pelvisTilt`,'Inclinación pélvica',pelvis,view));
  }
  for(const view of ['left','right']){
    const points=landmarks[view];
    if(!points)continue;
    const head=segmentFromVerticalDegrees(points.ear,points.shoulder);
    const trunk=segmentFromVerticalDegrees(points.shoulder,points.hip);
    const bodyAxis=segmentFromVerticalDegrees(points.shoulder,points.ankle);
    metrics.push(metric(`${view}.headOffset`,'Ángulo cabeza-hombro respecto a vertical',head,view));
    metrics.push(metric(`${view}.trunkInclination`,'Inclinación de tronco respecto a vertical',trunk,view));
    metrics.push(metric(`${view}.bodyAxis`,'Eje corporal respecto a vertical',bodyAxis,view));
  }
  const compact=metrics.filter(Boolean);
  const byId=Object.fromEntries(compact.map((item)=>[item.id,item]));
  const lateralHeadAsymmetry=percentAsymmetry(byId['left.headOffset']?.value,byId['right.headOffset']?.value);
  const lateralTrunkAsymmetry=percentAsymmetry(byId['left.trunkInclination']?.value,byId['right.trunkInclination']?.value);
  return Object.freeze({
    schema:'iri-photogrammetry-measurements-v1',
    protocolVersion:IRI_PHOTO_PROTOCOL_VERSION,
    landmarkSchemaVersion:IRI_PHOTO_LANDMARK_SCHEMA,
    metrics:Object.freeze(compact),
    summaries:Object.freeze({
      shoulderTiltMedian:median([
        Math.abs(byId['front.shoulderTilt']?.value??NaN),
        Math.abs(byId['back.shoulderTilt']?.value??NaN),
      ]),
      pelvisTiltMedian:median([
        Math.abs(byId['front.pelvisTilt']?.value??NaN),
        Math.abs(byId['back.pelvisTilt']?.value??NaN),
      ]),
      lateralHeadAsymmetryPercent:lateralHeadAsymmetry,
      lateralTrunkAsymmetryPercent:lateralTrunkAsymmetry,
    }),
    interpretation:null,
    medicalDiagnosis:null,
  });
}
export function photogrammetryDataQuality({captures=[],landmarks={},validated=false}={}){
  const views=new Set(
    (Array.isArray(captures)?captures:[])
      .filter((item)=>item?.status!=='revoked'&&IRI_PHOTO_VIEWS.includes(item?.view))
      .map((item)=>item.view)
  );
  if(!views.size)return Object.freeze({level:'sin_datos',capturedViews:0,analyzedViews:0,validated:false});
  const check=validateManualLandmarks(landmarks,[...views]);
  const analyzed=check.completeViews.length;
  const level=views.size===4&&analyzed===4&&validated
    ?'completa'
    :analyzed>0
      ?'parcial'
      :'capturas_sin_analisis';
  return Object.freeze({
    level,
    capturedViews:views.size,
    analyzedViews:analyzed,
    validated:Boolean(validated&&check.ok),
  });
}

export const __iriPhotogrammetryInternals=Object.freeze({finite,clamp01,radiansToDegrees,metric});
