// Running prescription advisory; never a measured workout, medical inference
// or a gate that blocks the Coach during a live training session.
import {exerciseMeasurementProfile} from './measurement-profiles.js';

const number=value=>{
  if(value==null||String(value).trim()==='')return null;
  const n=Number(String(value).trim().replace(',','.'));
  return Number.isFinite(n)&&n>0?n:null;
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
  const reps=number(p.intervalRepetitions);
  const work=number(p.intervalWorkSeconds);
  const recovery=p.intervalRecoverySeconds==null||String(p.intervalRecoverySeconds).trim()===''
    ?null:Number(String(p.intervalRecoverySeconds).replace(',','.'));
  if(profile.kind==='intervals'&&reps!==null&&work!==null&&
     Number.isInteger(reps)&&Number.isFinite(recovery??0)&&
     (recovery??0)>=0){
    const minSeconds=reps*work+Math.max(0,reps-1)*(recovery??0);
    if(Number.isFinite(minSeconds)&&minSeconds>0&&minSeconds<=86400){
      const estimated=Math.ceil(minSeconds/60);
      if(minutes!==null&&minutes*60+30<minSeconds){
        alerts.push(advisory('interval-minimum-exceeds-duration','review',
          `Los intervalos requieren al menos ${estimated} min de trabajo y recuperación. Revisa la duración objetivo.`));
      }else{
        alerts.push(advisory('interval-minimum','info',
          `Trabajo y recuperaciones: al menos ${estimated} min, sin contar calentamiento ni vuelta a calma.`));
      }
    }
    // Interval pace is not derived from total session duration: it includes
    // rest, warm-up and potentially distinct interval speeds.
    return Object.freeze(alerts);
  }
  if(distance!==null&&minutes!==null&&profile.kind!=='intervals'){
    const targetSeconds=minutes*60/distance;
    if(targetSeconds>=90&&targetSeconds<=1800){
      const estimated=formatPace(targetSeconds);
      if(explicitPace!==null&&Math.abs(explicitPace-targetSeconds)/targetSeconds>0.2){
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
