import {exerciseMeasurementProfile} from './measurement-profiles.js';
const numeric=value=>{
  if(value===undefined||value===null||String(value).trim()==='')return null;
  const s=String(value).trim().replace(',','.');
  if(!/^\d+(?:\.\d+)?$/u.test(s))return null;
  const n=Number(s);return Number.isFinite(n)&&n>0?n:null;
};
const note=(code,level,message)=>Object.freeze({code,level,message});
/** Estimates from a plan, not observed pool metrics or medical guidance. */
export function swimmingPrescriptionAdvisories(prescription={},exercise={}){
  if(exerciseMeasurementProfile(exercise).sport!=='swimming')return Object.freeze([]);
  const p=prescription&&typeof prescription==='object'?prescription:{};
  const distance=numeric(p.plannedDistanceM);
  const pool=numeric(p.poolLengthM);
  const minutes=numeric(p.plannedDurationMinutes);
  const reps=numeric(p.intervalRepetitions);
  const intervalM=numeric(p.intervalDistanceM);
  const work=numeric(p.intervalWorkSeconds);
  const result=[];
  if(pool!==null&&(!Number.isInteger(pool)||pool<15||pool>100)){
    result.push(note('pool-length-invalid','review','Comprueba la longitud indicada para esta piscina.'));
  }else if(pool!==null&&distance!==null&&Math.abs(distance/pool-Math.round(distance/pool))>.001){
    result.push(note('pool-length-not-integral','review','La distancia objetivo no corresponde a un número entero de largos. Revisa el recorrido.'));
  }
  if(reps!==null&&intervalM!==null&&distance!==null&&reps*intervalM>distance*1.001){
    result.push(note('swim-intervals-exceed-distance','review','Los metros de las series superan la distancia total programada.'));
  }
  if(reps!==null&&work!==null){
    const recovery=p.intervalRecoverySeconds==null||String(p.intervalRecoverySeconds).trim()===''?null:Number(p.intervalRecoverySeconds);
    const knownRecovery=Number.isFinite(recovery)&&recovery>=0?recovery:null;
    const minimum=reps*work+Math.max(0,reps-1)*(knownRecovery??0);
    if(minutes!==null&&minimum>minutes*60){
      result.push(note('swim-intervals-exceed-duration','review','Las series y recuperaciones indicadas superan la duración prevista.'));
    }else if(reps>1&&knownRecovery===null){
      result.push(note('swim-recovery-unspecified','review','Falta indicar recuperación entre series; no se presupone descanso cero.'));
    }
  }
  if(distance!==null&&minutes!==null&&minutes>0&&reps===null){
    const seconds=minutes*60*100/distance;
    if(seconds>=20&&seconds<=1800){
      const rounded=Math.round(seconds),pace=Math.floor(rounded/60)+':'+String(rounded%60).padStart(2,'0');
      result.push(note('swim-pace-total-estimate','info',
        'Ritmo teórico del bloque completo: ~'+pace+' min/100 m. Incluye pausas si existen; no es ritmo medido ni ritmo efectivo de nado.'));
    }
  }
  return Object.freeze(result);
}
