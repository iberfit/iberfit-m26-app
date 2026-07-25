import {IBERFIT_UI_LOCALE} from '../ui/castellano.js';
import {
  formatIberfitDate,
  parseDateValue,
} from '../domain/civil-date.js';

const ENTITY_ALIASES=Object.freeze({
  session:'session',sesion:'session',
  planning:'planning',plan:'planning',cycle:'planning',
  report:'report',informe:'report',
});
const MAX_BLOCKS=80;
const MAX_SECTION_TEXT=2500;

function bodyOf(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};}
function field(record,...keys){const body=bodyOf(record);for(const key of keys){const value=record?.[key]??body?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clean(value,max=600){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function boundedNumber(value,{min=0,max=100000,integer=false}={}){const parsed=Number(value);if(!Number.isFinite(parsed)||parsed<min||parsed>max)return null;return integer?Math.round(parsed):parsed;}
function dateValue(value){return parseDateValue(value);}
function dateLabel(value){return formatIberfitDate(value,{locale:IBERFIT_UI_LOCALE,includeTime:false});}
function entityOf(entity){return ENTITY_ALIASES[String(entity||'').trim().toLowerCase()]||null;}
function safeBlocks(record){
  const blocks=field(record,'blocks','bloques');
  if(!Array.isArray(blocks))return [];
  return blocks.slice(0,MAX_BLOCKS).map((block,index)=>Object.freeze({
    order:index+1,
    name:clean(block?.name||block?.title||block?.exerciseName||block?.exercise_name||'Ejercicio',120),
    sets:boundedNumber(block?.sets??block?.series,{min:1,max:100,integer:true}),
    reps:clean(block?.reps??block?.repetitions??block?.repeticiones??'',40),
    restSeconds:boundedNumber(block?.restSeconds??block?.rest_seconds??block?.descanso,{min:0,max:3600,integer:true}),
  }));
}
function dateRange(record){const start=dateLabel(field(record,'startDate','start_date','periodStart','period_start'));const end=dateLabel(field(record,'endDate','end_date','periodEnd','period_end'));return start&&end?`${start} – ${end}`:start||end||null;}
function immutableSections(sections){return Object.freeze(sections.map((section)=>Object.freeze({...section,items:section.items?Object.freeze(section.items):undefined})));}

/**
 * Proyección explícita de contenido visible. Solo admite campos enumerados aquí;
 * cualquier nota interna, auditoría, autor, coste o metadato desconocido queda fuera.
 */
export function clientContentView(entity,record={}){
  const kind=entityOf(entity);if(!kind)throw new Error('M26_CLIENT_CONTENT_ENTITY_INVALID');
  const id=clean(field(record,'id','entityId','entity_id'),160)||null;
  const title=clean(field(record,'title','titulo','name','nombre'),160)||(kind==='planning'?'Plan IBERFIT':kind==='session'?'Sesión IBERFIT':'Informe IBERFIT');
  if(kind==='planning')return Object.freeze({
    entity:kind,id,title,eyebrow:'Tu plan',
    summary:clean(field(record,'goal','objective','objetivo','summary','resumen'),500)||'Planificación preparada por tu entrenador.',
    dateRange:dateRange(record),facts:Object.freeze([]),sections:Object.freeze([]),actionLabel:'Consultar el plan',
  });
  if(kind==='session'){
    const blocks=safeBlocks(record);
    const duration=boundedNumber(field(record,'durationMinutes','duration_minutes','duracionMinutos','duration'),{min:1,max:1440,integer:true});
    const facts=[];if(duration!==null)facts.push(`${duration} min`);if(blocks.length)facts.push(`${blocks.length} ${blocks.length===1?'bloque':'bloques'}`);
    const sections=blocks.length?[{
      title:'Contenido de la sesión',
      items:blocks.map((block)=>{const detail=[block.sets!==null?`${block.sets} series`:null,block.reps||null,block.restSeconds!==null?`${block.restSeconds} s de descanso`:null].filter(Boolean).join(' · ');return Object.freeze({title:block.name,detail});}),
    }]:[];
    return Object.freeze({
      entity:kind,id,title,eyebrow:'Sesión preparada',
      summary:clean(field(record,'objective','goal','objetivo','summary','resumen'),500)||'Sigue las indicaciones y registra cada serie durante la sesión.',
      dateRange:dateRange(record),facts:Object.freeze(facts),sections:immutableSections(sections),actionLabel:'Ver detalles de la sesión',
    });
  }
  const summary=clean(field(record,'summary','resumen'),MAX_SECTION_TEXT)||'Informe de evolución preparado por tu entrenador.';
  const sections=[
    ['Conclusiones',field(record,'conclusions','conclusiones')],
    ['Próximos pasos',field(record,'recommendations','recomendaciones','nextSteps','next_steps')],
  ].map(([sectionTitle,value])=>({title:sectionTitle,text:clean(value,MAX_SECTION_TEXT)})).filter((section)=>section.text);
  return Object.freeze({
    entity:kind,id,title,eyebrow:'Tu informe',summary,dateRange:dateRange(record),facts:Object.freeze([]),
    sections:immutableSections(sections),actionLabel:'Leer el informe',
  });
}

export const __clientContentInternals=Object.freeze({bodyOf,field,clean,boundedNumber,dateValue,dateLabel,entityOf,safeBlocks,dateRange});
