// Running prescription advisory; never a measured workout, medical inference
// or a gate that blocks the Coach during a live training session.
import {exerciseMeasurementProfile} from './measurement-profiles.js';

const number=value=>{
  if(value==null||String(value).trim()==='')return null;
  const n=Number(String(value).trim().replace(',','.'));
  return Number.isFinite(n)&&n>0?n:null;
};
const nonnegative=value=>{
  if(value==null||String(value).trim()==='')return null;
  const n=Number(String(value).trim().replace(',','.'));
  return Number.isFinite(n)&&n>=0?n:null;
};
const positiveInteger=value=>{
  const n=number(value);
  return n!==null&&Number.isInteger(n)?n:null;
};
const paceSeconds=value=>{
  const match=String(value??'').trim().match(/^(\d{1,2}):([0-5]\d)$/u);
  if(!match)return null;
  const seconds=Number(match[1])*60+Number(match[2]);
  return seconds>0?seconds:null;
};
const formatPace=seconds=>{
  const rounded=Math.round(seconds);
  return `${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,'0')}`;
};
function advisory(code,level,message){
  return Object.freeze({code,level,message});
}

/**
 * Analyse prescribed targets only. It cannot read an athlete's Health Connect
 * data and never claims a session, effort or pace was actually completed.
 */
export function runningPrescriptionAdvisories(prescription={},exercise={}){
  const profile=exerciseMeasurementProfile(exercise);
  if(profile.sport!=='running'||!profile.cardio)return Object.freeze([]);
  const p=prescription&&typeof prescription==='object'?prescription:{};
  const alerts=[];
  const km=number(p.plannedDistanceKm);
  const meters=number(p.plannedDistanceM);
  const minutes=number(p.plannedDurationMinutes);
  const explicitPace=paceSeconds(p.plannedPace);
  if(km!==null&&meters!==null&&Math.abs(km-meters/1000)/km>0.05){
    alerts.push(advisory('distance-units-disagree','review',
      'Las distancias objetivo en km y metros no coinciden. Revisa cuál corresponde al bloque.'));
  }
  const distance=km??(meters!==null?meters/1000:null);
  const reps=positiveInteger(p.intervalRepetitions);
  const work=number(p.intervalWorkSeconds);
  const recovery=nonnegative(p.intervalRecoverySeconds);
  const warmup=nonnegative(p.plannedWarmupMinutes);
  const cooldown=nonnegative(p.plannedCooldownMinutes);
  const repeatMeters=number(p.intervalDistanceM);
  if(profile.kind==='intervals'&&reps!==null&&work!==null){
    // A missing recovery value is unknown, not evidence of zero rest.
    // The minimum includes only known work, explicitly entered recoveries
    // and optional warmup/cooldown. It is never an observed duration.
    const minimum=reps*work+(recovery??0)*Math.max(0,reps-1)
      +(warmup??0)*60+(cooldown??0)*60;
    if(Number.isFinite(minimum)&&minimum>0&&minimum<=86400){
      const estimated=Math.ceil(minimum/60);
      if(minutes!==null&&minutes*60+30<minimum){
        alerts.push(advisory('interval-minimum-exceeds-duration','review',
          `Los intervalos requieren al menos ${estimated} min incluyendo las fases definidas. Revisa la duración objetivo.`));
      }else{
        alerts.push(advisory('interval-minimum','info',
          `Trabajo, recuperaciones indicadas y fases definidas: al menos ${estimated} min. No es tiempo registrado.`));
      }
      if(reps>1&&recovery===null){
        alerts.push(advisory('interval-recovery-unspecified','review',
          'La recuperación entre repeticiones no está definida. El mínimo no incluye ese descanso.'));
      }
    }
    if(repeatMeters!==null){
      const workDistanceKm=reps*repeatMeters/1000;
      if(distance!==null&&workDistanceKm>distance*1.01){
        alerts.push(advisory('interval-distance-exceeds-total','review',
          'La distancia de las repeticiones supera la distancia total objetivo. Revisa ambas cifras.'));
      }
      const targetSeconds=work/(repeatMeters/1000);
      if(Number.isFinite(targetSeconds)&&targetSeconds>=90&&targetSeconds<=1800){
        alerts.push(advisory('interval-target-pace','info',
          `Ritmo teórico de cada repetición: ~${formatPace(targetSeconds)} min/km. Objetivo planificado, no medido.`));
      }
    }
    // Never derive an interval's pace from session duration, which may
    // include recoveries, warmup, cool-down or other non-running work.
    return Object.freeze(alerts);
  }
  if(profile.kind==='intervals'){
    // A partial interval plan is not equivalent to a running pace target:
    // require work duration AND an integer repetition count to reason safely.
    if(reps!==null||work!==null||repeatMeters!==null||recovery!==null)
      alerts.push(advisory('interval-prescription-incomplete','review',
        'Para analizar los intervalos indica número de repeticiones y segundos de trabajo. No se infiere el ritmo.'));
    return Object.freeze(alerts);
  }
  const knownPhaseMinutes=(warmup??0)+(cooldown??0);
  const hasDefinedPhase=(warmup!==null&&warmup>0)||(cooldown!==null&&cooldown>0);
  const phasesExceed=minutes!==null&&hasDefinedPhase&&knownPhaseMinutes>=minutes;
  if(phasesExceed){
    alerts.push(advisory('running-phases-exceed-duration','review',
      'El calentamiento y la vuelta a la calma ocupan toda la duración objetivo. Revisa el tiempo de carrera principal.'));
  }
  if(distance!==null&&minutes!==null){
    // All supplied distance is for the full block; without per-phase
    // distances we must never imply the result is the main running pace.
    const targetSeconds=minutes*60/distance;
    if(targetSeconds>=90&&targetSeconds<=1800){
      const estimated=formatPace(targetSeconds);
      if(hasDefinedPhase){
        if(!phasesExceed)
          alerts.push(advisory('running-overall-pace-with-phases','info',
            `Ritmo medio teórico del bloque completo: ~${estimated} min/km. Incluye las fases definidas y no describe el ritmo de carrera principal ni una medición.`));
        if(explicitPace!==null)
          alerts.push(advisory('running-main-pace-not-comparable','info',
            'El ritmo de carrera indicado no puede compararse con el promedio total sin conocer las distancias de calentamiento y vuelta a la calma.'));
      }else if(explicitPace!==null&&Math.abs(explicitPace-targetSeconds)/targetSeconds>0.2){
        alerts.push(advisory('pace-plan-mismatch','review',
          `Distancia y duración equivalen a ~${estimated} min/km. El ritmo introducido difiere; revisa pausas o calentamiento.`));
      }else{
        alerts.push(advisory('pace-plan-estimate','info',
          `Ritmo medio estimado del objetivo: ~${estimated} min/km. No es un ritmo medido.`));
      }
    }
  }
  return Object.freeze(alerts);
}
