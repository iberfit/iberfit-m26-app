/**
 * IBERFIT Capture: deterministic, coach-supervised text intake into the
 * existing session builder. Never reads files, sends data or publishes.
 */
import {addCatalogExercise} from './session-builder.js';
const MAX_BYTES=4000,MAX_ROWS=24;
const html=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const LOAD=/^(\d+(?:[,.]\d+)?)\s*kg\s*(por mancuerna|cada mancuerna|total|barra|en barra)$/iu;
const REST=/^descanso\s*:?\s*(\d{1,4})\s*(?:s|seg|segundos)$/iu;
const RPE=/^rpe\s*:?\s*(\d+(?:[,.]\d+)?)$/iu;
const RIR=/^rir\s*:?\s*(\d+(?:[,.]\d+)?)$/iu;
const FIRST=/^(\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*(s|seg|segundos))?\s+(.+)$/iu;
const LAST=/^(.+?)\s+(\d{1,2})\s*[x×]\s*(\d{1,3})(?:\s*(s|seg|segundos))?$/iu;
function parseLine(source,line){
  const parts=source.split(/[·|;]/u).map(s=>s.trim()).filter(Boolean);
  if(!parts.length||parts.length>6)return {line,error:'FORMATO'};
  const first=parts[0].match(FIRST),last=first?null:parts[0].match(LAST);
  if(!first&&!last)return {line,error:'FORMATO'};
  const sets=Number(first?first[1]:last[2]);
  const count=Number(first?first[2]:last[3]);
  const seconds=Boolean(first?first[3]:last[4]);
  const name=String(first?first[4]:last[1]).trim().replace(/\s+/gu,' ');
  if(sets<1||sets>100||count<1||count>999||!name||name.length>100)
    return {line,error:'RANGO'};
  const row={line,name,sets,reps:seconds?count+' s':String(count),
    plannedLoad:null,restSeconds:null,targetRpe:null,targetRir:null};
  const seen=new Set();
  for(const segment of parts.slice(1)){
    let key,value,m;
    if((m=segment.match(LOAD))){key='plannedLoad';value=m[1].replace(',','.')+' kg '+m[2].toLowerCase();}
    else if((m=segment.match(REST))){key='restSeconds';value=Number(m[1]);if(value>3600)return {line,error:'DESCANSO'};}
    else if((m=segment.match(RPE))){key='targetRpe';value=Number(m[1].replace(',','.'));if(value<1||value>10)return {line,error:'RPE'};}
    else if((m=segment.match(RIR))){key='targetRir';value=Number(m[1].replace(',','.'));if(value<0||value>10)return {line,error:'RIR'};}
    else return {line,error:/\bkg\b/iu.test(segment)?'CARGA_AMBIGUA':'DESCONOCIDO'};
    if(seen.has(key))return {line,error:'DUPLICADO'};
    seen.add(key);row[key]=value;
  }
  return Object.freeze(row);
}
export function parseCoachCaptureNotes(input){
  if(typeof input!=='string'||new TextEncoder().encode(input).length>MAX_BYTES)
    return Object.freeze({ok:false,source:null,rows:Object.freeze([]),errors:Object.freeze([{line:0,code:'LIMITE'}])});
  const source=input.trim();
  const lines=source.split(/\r?\n/u).map((text,i)=>({text:text.trim(),line:i+1})).filter(x=>x.text);
  if(!lines.length||lines.length>MAX_ROWS)
    return Object.freeze({ok:false,source,rows:Object.freeze([]),errors:Object.freeze([{line:0,code:'LINEAS'}])});
  const parsed=lines.map(x=>parseLine(x.text,x.line));
  const errors=parsed.filter(x=>x.error).map(x=>Object.freeze({line:x.line,code:x.error}));
  return Object.freeze({ok:!errors.length,source,rows:Object.freeze(parsed.filter(x=>!x.error)),errors:Object.freeze(errors)});
}
const ERR=Object.freeze({
  LIMITE:'Texto no válido o superior a 4 KB.',LINEAS:'Introduce de 1 a 24 ejercicios.',
  FORMATO:'Usa series × repeticiones y ejercicio. Ej.: 3 × 10 Sentadilla.',
  RANGO:'Revisa series, repeticiones y nombre.',DESCANSO:'Descanso máximo de 3600 segundos.',
  RPE:'RPE debe estar entre 1 y 10.',RIR:'RIR debe estar entre 0 y 10.',
  CARGA_AMBIGUA:'Aclara kg total o kg por mancuerna.',DESCONOCIDO:'No se puede interpretar un dato de forma segura.',
  DUPLICADO:'Un parámetro figura dos veces.',
});
export function captureFeedbackText(parsed){
  return parsed?.ok?parsed.rows.length+' ejercicios reconocidos. Confirma cada ejercicio en el catálogo.':
    (parsed?.errors||[]).map(x=>(x.line?'Línea '+x.line+': ':'')+(ERR[x.code]||'Formato no válido.')).join(' ');
}
export function renderCoachCapturePreview(parsed,catalog){
  if(!parsed?.ok)return '<p role="alert">'+html(captureFeedbackText(parsed))+'</p>';
  const rows=parsed.rows.map((row,i)=>{
    // Never preselect a fuzzy match. Coach must confirm the canonical exercise.
    const matches=typeof catalog?.search==='function'?catalog.search(row.name,{}).slice(0,8):[];
    const options=matches.filter(x=>x?.id&&catalog?.has?.(x.id))
      .map(x=>'<option value="'+html(x.id)+'">'+html(x.name_es||x.name||x.id)+'</option>').join('');
    const facts=[row.sets+' × '+row.reps,row.plannedLoad,
      row.restSeconds===null?null:'Descanso '+row.restSeconds+' s',
      row.targetRpe===null?null:'RPE '+row.targetRpe,
      row.targetRir===null?null:'RIR '+row.targetRir].filter(Boolean).join(' · ');
    return '<li class="m26-capture-row"><label><strong>'+html(row.name)+'</strong><small>'+html(facts)+
      '</small><span>Identificar el ejercicio del catálogo</span><select required data-session-capture-match data-row-index="'+i+'">'+
      '<option value="">Seleccionar ejercicio…</option>'+options+'</select></label>'+
      (!options?'<p class="m26-field-help">Sin coincidencia; corrige el nombre o añádelo manualmente.</p>':'')+'</li>';
  }).join('');
  return '<div class="m26-capture-review"><p role="status">'+parsed.rows.length+' ejercicios, sin asignación automática.</p><ol>'+
    rows+'</ol><p class="m26-field-help">Los parámetros omitidos usarán los valores predeterminados del constructor. No son datos extraídos. Revisa carga, RPE, RIR, series y descansos antes de publicar.</p>'+
    '<label class="m26-capture-confirm"><input type="checkbox" data-session-capture-confirm> Confirmo las equivalencias del catálogo y las unidades. Solo añadir al borrador, sin publicar.</label>'+
    '<button type="button" class="m26-primary-action" data-session-action="capture-confirm">Añadir al borrador y revisar</button></div>';
}
export function buildCoachCaptureDraft({draft,parsed,selectedIds,catalog}={}){
  if(!draft||!draft.id||!draft.clientId||draft.status!=='draft'||draft.activeGroupId||!Array.isArray(draft.blocks))
    throw Error('M26_CAPTURE_DRAFT_UNAVAILABLE');
  if(!parsed?.ok||!parsed.rows?.length||!Array.isArray(selectedIds)||
    selectedIds.length!==parsed.rows.length||draft.blocks.length+parsed.rows.length>100)
    throw Error('M26_CAPTURE_ROWS_INVALID');
  const staged=structuredClone(draft);
  for(let i=0;i<parsed.rows.length;i++){
    const id=String(selectedIds[i]||'');
    if(!id||!catalog?.has?.(id))throw Error('M26_CAPTURE_MATCH_REQUIRED');
    const row=parsed.rows[i],prescription={sets:row.sets,reps:row.reps};
    for(const key of ['plannedLoad','restSeconds','targetRpe','targetRir'])
      if(row[key]!==null)prescription[key]=row[key];
    addCatalogExercise(staged,id,catalog,prescription);
  }
  staged.previewAccepted=false;
  return staged;
}
