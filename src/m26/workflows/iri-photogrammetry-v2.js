import {
  IRI_PHOTO_LANDMARKS,
  IRI_PHOTO_VIEWS,
  median,
  normalizeManualLandmarks,
  normalizePhotoPoint,
  percentAsymmetry,
  photogrammetryDataQuality,
  segmentFromVerticalDegrees,
  segmentTiltDegrees,
  validateManualLandmarks,
} from './iri-photogrammetry.js';

export const IRI_PHOTO_PROTOCOL_VERSION_V2='iri-photogrammetry-2026.10-v2';
export const IRI_PHOTO_LANDMARK_SCHEMA_V2='manual-calibrated-4-point-v2';
export const IRI_PHOTO_MEASUREMENT_SCHEMA_V2='iri-photogrammetry-measurements-v2';

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function dimensionScale(dimensions={}){
  const width=finite(dimensions?.widthPx??dimensions?.width);
  const height=finite(dimensions?.heightPx??dimensions?.height);
  if(width===null||height===null||width<=0||height<=0)return Object.freeze({width:1,height:1,known:false});
  return Object.freeze({width,height,known:true});
}
function geometryPoint(point,dimensions={}){
  const normalized=normalizePhotoPoint(point);
  if(!normalized)return null;
  const scale=dimensionScale(dimensions);
  return Object.freeze({x:normalized.x*scale.width,y:normalized.y*scale.height});
}
function distancePx(a,b,dimensions={}){
  const p1=geometryPoint(a,dimensions),p2=geometryPoint(b,dimensions);
  if(!p1||!p2)return null;
  const distance=Math.hypot(p2.x-p1.x,p2.y-p1.y);
  return distance>0?distance:null;
}
export function normalizePhotoCalibration(entry={}){
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return null;
  const knownLengthCm=finite(entry.knownLengthCm);
  const pointA=normalizePhotoPoint(entry.pointA),pointB=normalizePhotoPoint(entry.pointB);
  if(knownLengthCm===null||knownLengthCm<1||knownLengthCm>300||!pointA||!pointB)return null;
  if(pointA.x===pointB.x&&pointA.y===pointB.y)return null;
  const label=String(entry.label||'Referencia conocida').replace(/\s+/gu,' ').trim().slice(0,80);
  return Object.freeze({knownLengthCm:Number(knownLengthCm.toFixed(2)),pointA,pointB,label});
}
export function normalizePhotoCalibrations(raw={}){
  const out={};
  for(const view of IRI_PHOTO_VIEWS){
    const item=normalizePhotoCalibration(raw?.[view]);
    if(item)out[view]=item;
  }
  return Object.freeze(out);
}
export function calibrationPixelsPerCm(entry,dimensions={}){
  const calibration=normalizePhotoCalibration(entry);
  if(!calibration)return null;
  const pixels=distancePx(calibration.pointA,calibration.pointB,dimensions);
  if(pixels===null)return null;
  return Number((pixels/calibration.knownLengthCm).toFixed(6));
}
export function segmentDistanceCm(a,b,entry,dimensions={}){
  const pixels=distancePx(a,b,dimensions);
  const pixelsPerCm=calibrationPixelsPerCm(entry,dimensions);
  if(pixels===null||pixelsPerCm===null||pixelsPerCm<=0)return null;
  return Number((pixels/pixelsPerCm).toFixed(1));
}
function axisDifferenceCm(a,b,entry,dimensions={},axis='x'){
  const p1=geometryPoint(a,dimensions),p2=geometryPoint(b,dimensions);
  const pixelsPerCm=calibrationPixelsPerCm(entry,dimensions);
  if(!p1||!p2||pixelsPerCm===null||pixelsPerCm<=0)return null;
  return Number((Math.abs(p2[axis]-p1[axis])/pixelsPerCm).toFixed(1));
}
export function horizontalDifferenceCm(a,b,entry,dimensions={}){
  return axisDifferenceCm(a,b,entry,dimensions,'x');
}
export function verticalDifferenceCm(a,b,entry,dimensions={}){
  return axisDifferenceCm(a,b,entry,dimensions,'y');
}
function metric(id,label,value,unit,view,kind){
  return value===null?null:Object.freeze({id,label,value,unit,view,kind});
}
export function photogrammetryOverlaySegmentsV2(view,landmarks={}){
  const points=normalizeManualLandmarks(landmarks)?.[view]||{};
  const pairs=view==='front'||view==='back'
    ?[['shoulderLeft','shoulderRight','shoulders'],['pelvisLeft','pelvisRight','pelvis']]
    :[['ear','shoulder','head'],['shoulder','hip','trunk'],['hip','ankle','lowerAxis']];
  return Object.freeze(pairs.flatMap(([from,to,id])=>{
    const a=points[from],b=points[to];
    return a&&b?[Object.freeze({id,view,from,to,a,b})]:[];
  }));
}
export function calculatePhotogrammetryMeasurementsV2(raw={},{
  dimensionsByView={},
  calibrationByView={},
}={}){
  const landmarks=normalizeManualLandmarks(raw);
  const calibration=normalizePhotoCalibrations(calibrationByView);
  const metrics=[];
  for(const view of ['front','back']){
    const points=landmarks[view];
    if(!points)continue;
    const dimensions=dimensionsByView?.[view]||{};
    const scale=calibration?.[view];
    metrics.push(metric(`${view}.shoulderTilt`,'Inclinación de hombros',segmentTiltDegrees(points.shoulderLeft,points.shoulderRight,dimensions),'deg',view,'geometry'));
    metrics.push(metric(`${view}.pelvisTilt`,'Inclinación pélvica',segmentTiltDegrees(points.pelvisLeft,points.pelvisRight,dimensions),'deg',view,'geometry'));
    metrics.push(metric(`${view}.shoulderHeightDifference`,'Diferencia vertical de hombros',verticalDifferenceCm(points.shoulderLeft,points.shoulderRight,scale,dimensions),'cm',view,'calibrated_geometry'));
    metrics.push(metric(`${view}.pelvisHeightDifference`,'Diferencia vertical de pelvis',verticalDifferenceCm(points.pelvisLeft,points.pelvisRight,scale,dimensions),'cm',view,'calibrated_geometry'));
  }
  for(const view of ['left','right']){
    const points=landmarks[view];
    if(!points)continue;
    const dimensions=dimensionsByView?.[view]||{};
    const scale=calibration?.[view];
    metrics.push(metric(`${view}.headOffset`,'Ángulo cabeza-hombro respecto a vertical',segmentFromVerticalDegrees(points.ear,points.shoulder,dimensions),'deg',view,'geometry'));
    metrics.push(metric(`${view}.trunkInclination`,'Inclinación de tronco respecto a vertical',segmentFromVerticalDegrees(points.shoulder,points.hip,dimensions),'deg',view,'geometry'));
    metrics.push(metric(`${view}.bodyAxis`,'Eje corporal respecto a vertical',segmentFromVerticalDegrees(points.shoulder,points.ankle,dimensions),'deg',view,'geometry'));
    metrics.push(metric(`${view}.earShoulderHorizontal`,'Desplazamiento horizontal oreja-hombro',horizontalDifferenceCm(points.ear,points.shoulder,scale,dimensions),'cm',view,'calibrated_geometry'));
    metrics.push(metric(`${view}.shoulderHipHorizontal`,'Desplazamiento horizontal hombro-cadera',horizontalDifferenceCm(points.shoulder,points.hip,scale,dimensions),'cm',view,'calibrated_geometry'));
  }
  const compact=metrics.filter(Boolean);
  const byId=Object.fromEntries(compact.map((item)=>[item.id,item]));
  const geometryBasis=Object.fromEntries(IRI_PHOTO_VIEWS.filter((view)=>landmarks[view]).map((view)=>{
    const dimensions=dimensionScale(dimensionsByView?.[view]||{});
    const entry=calibration?.[view]||null;
    const pixelsPerCm=entry?calibrationPixelsPerCm(entry,dimensionsByView?.[view]||{}):null;
    return [view,Object.freeze({
      widthPx:dimensions.known?dimensions.width:null,
      heightPx:dimensions.known?dimensions.height:null,
      aspectCorrected:dimensions.known,
      calibrated:pixelsPerCm!==null,
      pixelsPerCm,
    })];
  }));
  return Object.freeze({
    schema:IRI_PHOTO_MEASUREMENT_SCHEMA_V2,
    protocolVersion:IRI_PHOTO_PROTOCOL_VERSION_V2,
    landmarkSchemaVersion:IRI_PHOTO_LANDMARK_SCHEMA_V2,
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
      lateralHeadAsymmetryPercent:percentAsymmetry(byId['left.headOffset']?.value,byId['right.headOffset']?.value),
      lateralTrunkAsymmetryPercent:percentAsymmetry(byId['left.trunkInclination']?.value,byId['right.trunkInclination']?.value),
      calibratedViews:Object.keys(calibration).length,
    }),
    geometryBasis:Object.freeze(geometryBasis),
    calibration,
    medicalDiagnosis:null,
  });
}
export function interpretPhotogrammetryMeasurementsV2(measurements={}, {quality={}}={}){
  const rows=Array.isArray(measurements?.metrics)?measurements.metrics:[];
  const byId=Object.fromEntries(rows.map((item)=>[item?.id,item]).filter(([id])=>id));
  if(quality?.level!=='completa'||quality?.validated!==true){
    return Object.freeze({
      schema:'iri-photogrammetry-interpretation-v2',
      available:false,
      reviewRequired:false,
      observations:Object.freeze([]),
      reproducibleSignals:Object.freeze([]),
      limitations:Object.freeze(['Se requieren cuatro vistas, todos los puntos y validación del Coach antes de interpretar.']),
      medicalDiagnosis:null,
    });
  }
  const observations=[];
  const signed=(id,label)=>{
    const value=finite(byId[id]?.value);if(value===null)return;
    observations.push(Object.freeze({
      id,label,valueDeg:value,magnitudeDeg:Number(Math.abs(value).toFixed(1)),
      direction:value>0?'derecha más baja':value<0?'izquierda más baja':'sin inclinación medible',
      kind:'signed_tilt',
    }));
  };
  for(const [id,label] of [
    ['front.shoulderTilt','Hombros · vista frontal'],
    ['back.shoulderTilt','Hombros · vista posterior'],
    ['front.pelvisTilt','Pelvis · vista frontal'],
    ['back.pelvisTilt','Pelvis · vista posterior'],
  ])signed(id,label);
  const paired=(leftId,rightId,id,label)=>{
    const left=finite(byId[leftId]?.value),right=finite(byId[rightId]?.value);
    if(left===null||right===null)return;
    observations.push(Object.freeze({
      id,label,leftDeg:left,rightDeg:right,differenceDeg:Number(Math.abs(left-right).toFixed(1)),
      asymmetryPercent:percentAsymmetry(left,right),kind:'bilateral_difference',
    }));
  };
  paired('left.headOffset','right.headOffset','headOffsetDifference','Cabeza-hombro · diferencia lateral');
  paired('left.trunkInclination','right.trunkInclination','trunkInclinationDifference','Tronco · diferencia lateral');
  paired('left.bodyAxis','right.bodyAxis','bodyAxisDifference','Eje corporal · diferencia lateral');
  const reproducibleSignals=[];
  const reproducible=(frontId,backId,id,label)=>{
    const front=finite(byId[frontId]?.value),back=finite(byId[backId]?.value);
    if(front===null||back===null||front===0||back===0||Math.sign(front)!==Math.sign(back))return;
    reproducibleSignals.push(Object.freeze({
      id,label,direction:front>0?'derecha más baja':'izquierda más baja',
      frontDeg:Number(Math.abs(front).toFixed(1)),backDeg:Number(Math.abs(back).toFixed(1)),
      message:'La dirección se reproduce en frontal y posterior; debe leerse junto con movimiento, síntomas y técnica.',
    }));
  };
  reproducible('front.shoulderTilt','back.shoulderTilt','shoulderTiltConsistent','Inclinación de hombros reproducida');
  reproducible('front.pelvisTilt','back.pelvisTilt','pelvisTiltConsistent','Inclinación pélvica reproducida');
  return Object.freeze({
    schema:'iri-photogrammetry-interpretation-v2',
    available:true,
    reviewRequired:reproducibleSignals.length>0,
    observations:Object.freeze(observations),
    reproducibleSignals:Object.freeze(reproducibleSignals),
    limitations:Object.freeze([
      'Describe geometría de una captura estática; no establece postura ideal, lesión ni diagnóstico médico.',
      'Las medidas lineales requieren una referencia conocida situada en el mismo plano que la persona.',
      'Cambios futuros deben interpretarse considerando repetibilidad de captura y error de medida.',
    ]),
    medicalDiagnosis:null,
  });
}
export function photogrammetryDataQualityV2({captures=[],landmarks={},calibrationByView={},validated=false}={}){
  const base=photogrammetryDataQuality({captures,landmarks,validated});
  const calibration=normalizePhotoCalibrations(calibrationByView);
  return Object.freeze({...base,calibratedViews:Object.keys(calibration).length});
}
export function validatePhotogrammetryV2(raw={},availableViews=IRI_PHOTO_VIEWS){
  return validateManualLandmarks(raw,availableViews);
}
