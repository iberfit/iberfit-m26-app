import {assessExercisePerformance} from '../engagement/exercise-performance-engine.js';
import {exerciseMeasurementProfile} from '../exercises/measurement-profiles.js';

// This is decision support, not a prescription. Only compare complete,
// equivalent strength exposures with explicitly recorded resistance and effort.
function equivalentExposure(exposure){
 const rows=exposure?.sets;
 if(!Array.isArray(rows)||!rows.length||rows.length!==exposure.setCount)return null;
 const first=rows[0]?.load;
 if(!['kg','lb'].includes(first?.comparableKey)||!Number.isFinite(first.value)||first.value<=0)return null;
 if(!rows.every(row=>row?.load?.comparableKey===first.comparableKey&&row.load.value===first.value&&
   Number.isInteger(row.reps)&&row.reps>0&&Number.isFinite(row.rpe)&&row.rpe>=1&&row.rpe<=10&&
   (row.rir==null||(Number.isFinite(row.rir)&&row.rir>=0&&row.rir<=10))))return null;
 return {count:rows.length,unit:first.comparableKey,load:first.value};
}
export function coachProgressionReview(memory,exercise={}){
 if(exerciseMeasurementProfile(exercise).kind!=='strength'||!memory?.latest||!memory?.previous)return null;
 const latest=equivalentExposure(memory.latest),previous=equivalentExposure(memory.previous);
 if(!latest||!previous||latest.count!==previous.count||latest.unit!==previous.unit||latest.load!==previous.load)return null;
 if(!Number.isFinite(memory.latest.averageRpe)||!Number.isFinite(memory.previous.averageRpe))return null;
 const assessment=assessExercisePerformance(memory,{loadDirection:'unknown'});
 const evidence=assessment.evidence||{};
 // Opposing effort signals are not evidence to change the prescription.
 if(evidence.effortBetter&&evidence.effortWorse)return null;
 if(assessment.status==='progress'&&assessment.confidence!=='low'&&
   evidence.longitudinalConfirmation==='confirmed'&&
   Array.isArray(memory.history)&&memory.history.length>=3&&
   memory.history.slice(0,evidence.longitudinalPointsUsed).every(item=>{
     const reference=equivalentExposure(item);
     return reference&&reference.count===latest.count&&reference.unit===latest.unit&&reference.load===latest.load;
   })){
  return {kind:'progress-review',label:'Valorar progresión',detail:'Mejora comparable respaldada por la tendencia reciente. Revisa técnica, recuperación y objetivo antes de ajustar.'};
 }
 if(assessment.status==='regression'&&assessment.confidence!=='low'&&evidence.effortWorse){
  return {kind:'recovery-review',label:'Revisar recuperación y exigencia',detail:'El esfuerzo observado aumentó sin una mejora clara del rendimiento. Revisa el contexto antes de ajustar.'};
 }
 if(assessment.status==='stable'&&!evidence.effortWorse){
  return {kind:'maintain-review',label:'Valorar mantener la prescripción',detail:'Rendimiento comparable sin cambios relevantes. Mantener puede ser adecuado según el objetivo.'};
 }
 return null;
}
