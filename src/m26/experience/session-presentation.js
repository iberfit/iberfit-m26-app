import {
  actorCanExecuteSession,
  appointmentForSession,
  clientSessionProjection,
} from '../rc39/session-policy.js';
import {publicationSummary} from '../workflows/publication-workflow.js';

const MAX_BLOCKS=100;
const MAX_EXERCISES_PER_GROUP=12;
const GROUP_NAMES=Object.freeze({
  biserie:'Biserie',triserie:'Triserie',circuito:'Circuito',amrap:'AMRAP',tabata:'Tabata',
});
function bodyOf(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
}
function field(record,...keys){
  const body=bodyOf(record);
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}
function clean(value,max=160){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function number(value,{min=0,max=100000,integer=false}={}){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=min&&n<=max?(integer?Math.round(n):n):null;
}
function catalogMap(catalog){
  const items=Array.isArray(catalog)?catalog:catalog?.list?.()||[];
  return new Map(items.filter((item)=>item?.id).map((item)=>[item.id,item]));
}
function safeTextArray(value,limit=5){
  return (Array.isArray(value)?value:[]).slice(0,limit).map((item)=>clean(item,220)).filter(Boolean);
}
function exerciseView(exerciseId,prescription={},catalog){
  const id=clean(exerciseId,180);
  const exercise=catalog.get(id)||{};
  const alternativeId=clean(prescription.alternativeId,180);
  const alternative=alternativeId?catalog.get(alternativeId):null;
  return Object.freeze({
    id,
    name:clean(exercise.name_es||prescription.name||id,140),
    equipment:clean(exercise.equipment,140),
    pattern:clean(exercise.pattern,100),
    sets:number(prescription.sets,{min:1,max:100,integer:true}),
    reps:clean(prescription.reps,60),
    restSeconds:number(prescription.restSeconds,{min:0,max:3600,integer:true}),
    tempo:clean(prescription.tempo,60),
    rpe:number(prescription.targetRpe,{min:1,max:10}),
    rir:number(prescription.targetRir,{min:0,max:10}),
    alternative:alternative?clean(alternative.name_es,140):null,
    cues:Object.freeze(safeTextArray(exercise.cues)),
    instructions:Object.freeze(safeTextArray(exercise.instructions_es,6)),
    precautions:Object.freeze(safeTextArray(exercise.precautions,3)),
  });
}
function sessionBlocks(record,catalog){
  const blocks=field(record,'blocks','bloques');
  if(!Array.isArray(blocks))return Object.freeze([]);
  return Object.freeze(blocks.slice(0,MAX_BLOCKS).map((block,index)=>{
    const groupType=clean(block?.type,30).toLowerCase();
    if(Object.hasOwn(GROUP_NAMES,groupType)){
      const ids=(Array.isArray(block.exerciseIds)?block.exerciseIds:[]).slice(0,MAX_EXERCISES_PER_GROUP);
      return Object.freeze({
        kind:'group',number:index+1,title:GROUP_NAMES[groupType],
        rounds:number(block.rounds,{min:1,max:100,integer:true}),
        exercises:Object.freeze(ids.map((id)=>exerciseView(id,block.prescriptions?.[id]||{},catalog))),
      });
    }
    return Object.freeze({
      kind:'exercise',number:index+1,title:'Ejercicio',
      exercises:Object.freeze([exerciseView(block?.exerciseId||block?.id,block||{},catalog)]),
    });
  }));
}
/**
 * Una sola proyección para Coach y Cliente.
 * El modo dirigido jamás envía prescripción a la capa visual del Cliente.
 * El permiso para empezar no depende de la presencia de un botón.
 */
export function sessionPresentation(record,{role='client',catalog=[],appointments=[]}={}){
  const appointment=appointmentForSession(appointments,record);
  const projection=clientSessionProjection(record,appointment);
  const publication=publicationSummary({entity:'session',record,role});
  const isClient=role==='client';
  const visible=publication.visibleToClient&&projection.visible;
  const guided=projection.canClientExecute&&actorCanExecuteSession({role:'client',session:record,appointment});
  const canInspect=!isClient||visible&&guided;
  const name=clean(field(record,'title','titulo','name','nombre'),160)||'Sesión IBERFIT';
  const durationMinutes=number(field(record,'durationMinutes','duration_minutes','duracionMinutos','duration'),{min:1,max:1440,integer:true});
  const blocks=canInspect?sessionBlocks(record,catalogMap(catalog)):Object.freeze([]);
  const hasExercises=blocks.some((block)=>block.exercises.some((ex)=>ex.id));
  const canStart=isClient&&visible&&guided&&hasExercises;
  const mode=guided?'guided':'coach_led';
  return Object.freeze({
    id:projection.id,title:name,durationMinutes,
    mode,modeLabel:guided?'Guiada en la aplicación':'Con tu entrenador',
    visible:!isClient||visible,
    canStart,
    hasExercises,
    canInspect,
    blocks,
    // Fecha solo si existe una cita específicamente asociada a esta sesión.
    startAt:appointment?projection.startAt:null,
    appointmentId:projection.appointmentId,
  });
}
