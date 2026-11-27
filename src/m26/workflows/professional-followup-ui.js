import {IRI_PROTOCOL_CATALOG_VERSION,iriProtocolById} from './iri-protocol-catalog.js';
import {professionalFollowupParams,PROFESSIONAL_RECTIFICATION_REASONS,compareProfessionalFollowupPair} from '../domain/professional-followup.js';
import {santiagoAppointmentInstant} from './agenda-workflow.js';
import {reportCivilDate} from '../domain/civil-date.js';

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const unitLabels=Object.freeze({kg:'kg',cm:'cm',percent:'%',reps:'repeticiones',bpm:'lpm',s:'s'});
const n=(key,label,min,max,step='any',optional=false)=>({key,label,type:'number',min,max,step,optional});
const t=(key,label,max=120)=>({key,label,type:'text',max});
const fields={
 'chair-stand-30s':[n('chairHeightCm','Altura de silla (cm)',20,100)],
 'one-minute-sit-to-stand':[n('chairHeightCm','Altura de silla (cm)',20,100)],
 'bodyweight-squat-60s':[t('depthCriterion','Criterio de profundidad'),t('stance','Posición de pies')],
 'push-test':[n('supportHeightCm','Altura de apoyo (cm)',1,250,'any',true),n('durationSeconds','Duración (s), si corresponde',1,3600,1,true)],
 'trx-row':[n('handleHeightCm','Altura de asas (cm)',1,300),n('heelDistanceCm','Distancia de talones (cm)',0,300,'any',true),n('bodyAngleDeg','Ángulo corporal (°)',0,90,'any',true),t('position','Posición'),n('durationSeconds','Duración (s), si corresponde',1,3600,1,true)],
 'weight-bearing-lunge':[n('trialCount','Número de intentos válidos',1,10,1)],
 'back-saver':[n('trialCount','Número de intentos válidos',1,10,1)],
 'core-plank':[t('quality','Criterio de calidad registrado')],
 'posterior-chain-endurance':[],
 'body-composition':[t('device','Dispositivo'),t('measurementConditions','Condiciones de medición',240)],
};
const metric=(testId,field,label,unit,min,max,step='any')=>Object.freeze({testId,field,label,unit,min,max,step,key:`${testId}:${field}`});
export const FOLLOWUP_METRICS=Object.freeze([
 metric('chair-stand-30s','repetitions','Levantarse de la silla · 30 s','reps',0,500,1),
 metric('one-minute-sit-to-stand','repetitions','Levantarse de la silla · 60 s','reps',0,500,1),
 metric('one-minute-sit-to-stand','oneMinuteHr','Frecuencia cardiaca al minuto · 1MSTS','bpm',1,300,1),
 metric('bodyweight-squat-60s','repetitions','Sentadilla libre · 60 s','reps',0,500,1),
 metric('push-test','repetitions','Prueba de empuje','reps',0,500,1),metric('trx-row','repetitions','Remo TRX','reps',0,500,1),
 metric('weight-bearing-lunge','bestCm','Rodilla a pared','cm',-100,100),metric('back-saver','bestCm','Alcance posterior unilateral','cm',-100,100),
 metric('core-plank','frontPlankSeconds','Plancha frontal','s',0,3600),metric('posterior-chain-endurance','seconds','Resistencia de cadena posterior','s',0,3600),
 metric('body-composition','weightKg','Peso corporal','kg',20,350),metric('body-composition','waistCm','Perímetro de cintura','cm',30,250),metric('body-composition','bodyFatPercent','Grasa corporal','percent',1,80),metric('body-composition','leanMassKg','Masa libre de grasa','kg',1,250),metric('body-composition','muscleMassKg','Masa muscular','kg',1,250),
]);
const metricByKey=key=>FOLLOWUP_METRICS.find(x=>x.key===key);
const options=(values,selected)=>values.map(([value,label])=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`).join('');
const sideLabels={'left':'Izquierda','right':'Derecha','bilateral':'Bilateral','not-applicable':'No aplica'};
const get=(o,k)=>typeof o?.[k]==='string'?o[k]:'';
const input=(name,label,attrs,value)=>`<label>${esc(label)}<input name="${esc(name)}" ${attrs} value="${esc(value)}"></label>`;
function setupInputs(m,d){return fields[m.testId].map(f=>f.type==='number'?input('setup_'+f.key,f.label,`type="number" min="${f.min}" max="${f.max}" step="${f.step}"${f.optional?'':' required'}`,get(d,'setup_'+f.key)):input('setup_'+f.key,f.label,`type="text" maxlength="${f.max}" required`,get(d,'setup_'+f.key))).join('');}
const check=(name,label,d)=>`<label><input type="checkbox" name="${name}" value="yes" required${get(d,name)==='yes'?' checked':''}> ${esc(label)}</label>`;
export function renderProfessionalFollowupHost(clientId){return `<section class="m26-panel m26-panel-soft" data-m26-expediente-section="resumen" data-gx-followup-host="${esc(clientId)}"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Uso profesional</p><h2>Mediciones de seguimiento</h2><p>Registros independientes del diagnóstico inicial. No se publican automáticamente.</p></div></div><button type="button" data-gx-followup-action="open">Abrir seguimiento</button><div data-gx-followup-body></div></section>`;}
export function renderFollowupCapture(d={}){
 const m=metricByKey(d.metric)||FOLLOWUP_METRICS[0],p=iriProtocolById(m.testId);
 const variants=p.variants.filter(v=>v.id!=='not-performed').map(v=>[v.id,v.label]);
 return `<form data-gx-followup-form><div class="m26-field-grid"><label>Medición<select name="metric">${options(FOLLOWUP_METRICS.map(x=>[x.key,x.label]),m.key)}</select></label><label>Variante<select name="variant">${options(variants,d.variant||p.defaultVariant)}</select></label><label>Lado<select name="side">${options(p.sides.map(x=>[x,sideLabels[x]||x]),d.side||p.sides[0])}</select></label>${input('measuredAt','Fecha y hora de medición (Chile)','type="datetime-local" required',get(d,'measuredAt'))}${input('value',`Valor (${unitLabels[m.unit]})`,`type="number" min="${m.min}" max="${m.max}" step="${m.step}" required`,get(d,'value'))}${setupInputs(m,d)}${input('configuration','Configuración reproducible','type="text" maxlength="400" required',get(d,'configuration'))}${input('adaptationReason','Motivo de adaptación, si corresponde','type="text" maxlength="240"',get(d,'adaptationReason'))}</div>${m.testId==='body-composition'?check('directlyRecorded','Valor medido directamente, no estimado ni derivado',d):''}${m.testId==='posterior-chain-endurance'?check('equipmentCompatible','Equipo compatible y seguro',d):''}${check('observed','Confirmo la medición realizada, su validez y configuración',d)}<div class="m26-action-grid"><button type="submit" class="m26-primary-action">Registrar medición</button></div></form>`;
}
const rawNumber=(v,optional=false)=>{if(typeof v!=='string'||!v.trim()){if(optional)return null;throw Error('GX_CAPTURE_REQUIRED');}if(!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(v))throw Error('GX_CAPTURE_NUMBER');return Number(v);};
export function buildFollowupCapture(d,{id,clientId,now=new Date()}={}){
 const m=metricByKey(d?.metric);if(!m||d.observed!=='yes')throw Error('GX_CAPTURE_REQUIRED');
 const setup=Object.fromEntries(fields[m.testId].map(f=>[f.key,f.type==='number'?rawNumber(d['setup_'+f.key],f.optional):get(d,'setup_'+f.key).trim()]));
 if(m.testId==='one-minute-sit-to-stand'||m.testId==='bodyweight-squat-60s')setup.durationSeconds=60;
 if(m.testId==='push-test')setup.variant=d.variant;
 if(m.testId==='posterior-chain-endurance'){setup.protocol=d.variant;setup.equipmentCompatible=d.equipmentCompatible==='yes';}
 if(m.testId==='body-composition'){setup.method=d.variant;setup.directlyRecorded=d.directlyRecorded==='yes';}
 const draft={id,clientId,measuredAt:santiagoAppointmentInstant(d.measuredAt),value:rawNumber(d.value),unit:m.unit,protocol:{schemaVersion:1,testId:m.testId,field:m.field,side:d.side,variant:d.variant,protocolVersion:IRI_PROTOCOL_CATALOG_VERSION,configuration:get(d,'configuration').trim(),adaptationReason:get(d,'adaptationReason').trim(),setup}};
 professionalFollowupParams(draft,{now});return Object.freeze({...draft,protocol:Object.freeze({...draft.protocol,setup:Object.freeze(setup)})});
}
export function renderFollowupHistory(items,{nextCursor=null,allowReview=false}={}){
 if(!items.length)return '<p>No hay mediciones en el historial consultado.</p>';
 return `<p>Registros cargados: ${items.length}. Las comparaciones requieren el mismo protocolo y días diferentes.</p><div class="m26-list">${items.map((row,i)=>{const m=metricByKey(`${row.protocol.testId}:${row.protocol.field}`);const prior=items.slice(i+1).find(p=>compareProfessionalFollowupPair(p,row));const c=prior?compareProfessionalFollowupPair(prior,row):null;return `<article class="m26-list-card"><div><h3>${esc(m?.label||iriProtocolById(row.protocol.testId)?.name||'Medición')}</h3><p>${esc(reportCivilDate(row.measuredAt))} · ${esc(sideLabels[row.protocol.side])} · ${esc(row.value)} ${esc(unitLabels[row.unit])}</p><small>${esc(row.protocol.configuration)}</small>${row.rectification?`<p>Registro anulado · ${esc(PROFESSIONAL_RECTIFICATION_REASONS[row.rectification.reason])}</p>`:c?`<p>Frente a la medición comparable cargada del ${esc(c.periodStart)}: ${esc(c.delta>0?`+${c.delta}`:c.delta)} ${esc(unitLabels[c.deltaUnit]||c.deltaUnit)}. Revisión profesional pendiente.</p>`:''}</div>${!row.rectification?`<div class="m26-list-card-actions"><button type="button" data-gx-followup-action="goal" data-gx-id="${esc(row.id)}">Comparar con objetivo</button>${allowReview&&c?`<button type="button" data-gx-followup-action="review-publication" data-gx-id="${esc(row.id)}">Revisar comparación</button>`:''}<label>Motivo de anulación<select data-gx-void-reason="${esc(row.id)}"><option value="">Seleccionar motivo</option>${options(Object.entries(PROFESSIONAL_RECTIFICATION_REASONS),'')}</select></label><button type="button" data-gx-followup-action="void" data-gx-id="${esc(row.id)}">Anular medición</button></div>`:''}</article>`;}).join('')}</div>${nextCursor?'<button type="button" data-gx-followup-action="more">Cargar anteriores</button>':''}`;
}

// Read-only details: no mutation buttons, no automatic publication, no raw protocol keys.
export function renderFollowupDetail(detail){
 if(!detail)return '';
 const row=detail.observation,p=row.protocol,m=metricByKey(p.testId+':'+p.field),catalog=iriProtocolById(p.testId);
 const variant=catalog?.variants.find(v=>v.id===p.variant)?.label||'Variante registrada';
 const stamp=v=>new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'medium'}).format(new Date(v));
 const setup=(fields[p.testId]||[]).map(f=>[f.label,p.setup[f.key]]).filter(([,v])=>v!==null&&v!==undefined);
 if(['one-minute-sit-to-stand','bodyweight-squat-60s'].includes(p.testId))setup.push(['Duración (s)',p.setup.durationSeconds]);
 if(p.testId==='posterior-chain-endurance')setup.push(['Equipo compatible',p.setup.equipmentCompatible?'Sí':'No']);
 if(p.testId==='body-composition')setup.push(['Medido directamente',p.setup.directlyRecorded?'Sí':'No']);
 return '<article class="m26-list-card"><div><h3>Contenido registrado en el servidor</h3><p>'+esc(detail.kind==='void'?'Anulación registrada':'Medición registrada')+' · '+esc(stamp(detail.createdAt))+'</p><p><strong>'+esc(m?.label||'Medición')+'</strong> · '+esc(row.value)+' '+esc(unitLabels[row.unit])+'</p><p>'+esc(stamp(row.measuredAt))+' · '+esc(sideLabels[p.side])+' · '+esc(variant)+'</p><p>Configuración: '+esc(p.configuration)+'</p>'+(p.adaptationReason?'<p>Adaptación: '+esc(p.adaptationReason)+'</p>':'')+setup.map(([label,value])=>'<p>'+esc(label)+': '+esc(value)+'</p>').join('')+(row.rectification?'<p>Registro anulado · '+esc(PROFESSIONAL_RECTIFICATION_REASONS[row.rectification.reason])+' · '+esc(stamp(row.rectification.voidedAt))+'</p>':'<p>Sin anulación registrada al consultar.</p>')+'<p>Referencia: '+esc(detail.operationId)+'</p><small>Comprueba el contenido antes de repetir una medición. Esta consulta no publica información.</small></div></article>';
}
export function renderFollowupRecentActions(items,{pendingId=null}={}){
 const ids=items.map(x=>x.id);if(pendingId&&!ids.includes(pendingId))ids.unshift(pendingId);
 return ids.length?'<div class="m26-action-grid">'+ids.map((id,i)=>'<button type="button" data-gx-followup-action="detail" data-gx-id="'+esc(id)+'">'+(id===pendingId?'Comprobar contenido de operación pendiente':'Ver contenido de registro '+(i+1))+'</button>').join('')+'</div>':'';
}

// Explicit review preview only. No publication, inferred gain or private
// setup reaches the client report through this view.
export function renderProfessionalReview(previous,current){
 const c=compareProfessionalFollowupPair(previous,current);if(!c)return '';
 const p=current.protocol,m=metricByKey(p.testId+':'+p.field),catalog=iriProtocolById(p.testId);
 const stamp=v=>new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'medium'}).format(new Date(v));
 const setup=(fields[p.testId]||[]).map(f=>[f.label,p.setup[f.key]]).filter(([,v])=>v!==null&&v!==undefined);
 if(['one-minute-sit-to-stand','bodyweight-squat-60s'].includes(p.testId))setup.push(['Duración (s)',p.setup.durationSeconds]);
 if(p.testId==='posterior-chain-endurance')setup.push(['Equipo compatible',p.setup.equipmentCompatible?'Sí':'No']);
 if(p.testId==='body-composition')setup.push(['Medido directamente',p.setup.directlyRecorded?'Sí':'No']);
 const variant=catalog?.variants.find(v=>v.id===p.variant)?.label||'Variante registrada';
 return '<article class="m26-list-card" data-gx-publication-preview><div><h3>Revisión de comparación profesional</h3><p>'+esc(m?.label||'Medición')+' · '+esc(variant)+' · '+esc(sideLabels[p.side])+'</p><p>Anterior: '+esc(stamp(previous.measuredAt))+' · '+esc(previous.value)+' '+esc(unitLabels[previous.unit])+'</p><p>Actual: '+esc(stamp(current.measuredAt))+' · '+esc(current.value)+' '+esc(unitLabels[current.unit])+'</p><p>Diferencia: '+esc(c.delta>0?'+'+c.delta:c.delta)+' '+esc(unitLabels[c.deltaUnit]||c.deltaUnit)+'</p><p>Configuración común: '+esc(p.configuration)+'</p>'+(p.adaptationReason?'<p>Adaptación: '+esc(p.adaptationReason)+'</p>':'')+setup.map(([label,value])=>'<p>'+esc(label)+': '+esc(value)+'</p>').join('')+'<p>Vista del historial cargado, todavía no publicada. Actualiza el historial para comprobar vigencia. La comparación por sí sola no acredita un logro ni un diagnóstico.</p><button type="button" data-gx-followup-action="close-review">Cerrar revisión</button></div></article>';
}

const publicationStatusLabels=Object.freeze({published:'Publicada',withdrawn:'Retirada',invalidated:'Invalidada'});
export function renderPublicationList(items,{loaded=false,nextCursor=null}={}){
 if(!loaded)return '';
 if(!items.length)return '<p>No se encontraron publicaciones profesionales.</p>';
 return '<div class="m26-list">'+items.map(h=>'<article class="m26-list-card"><div><h3>'+esc(publicationStatusLabels[h.status])+' · revisión '+esc(h.revision)+'</h3><p>'+esc(reportCivilDate(h.reviewedAt))+'</p></div><button type="button" data-gx-followup-action="publication-detail" data-gx-id="'+esc(h.id)+'">Comprobar publicación</button></article>').join('')+'</div>'+(nextCursor?'<button type="button" data-gx-followup-action="publication-more">Ver más publicaciones</button>':'');
}
export function renderPublicationHead(h,{canWithdraw=false,preview=null,canVerify=false}={}){
 if(!h)return '';
 const m=h.pair?metricByKey(h.pair.current.protocol.testId+':'+h.pair.current.protocol.field):null;
 return '<article class="m26-list-card"><div><h3>'+esc(publicationStatusLabels[h.status])+' · revisión '+esc(h.revision)+'</h3><p>Estado confirmado en la última consulta. No equivale a emisión de informe.</p>'+(h.pair?'<p>'+esc(m?.label||'Medición')+' · '+esc(h.pair.previous.value)+' → '+esc(h.pair.current.value)+' '+esc(unitLabels[h.pair.current.unit])+'</p>':'<p>Esta revisión no aporta evidencia vigente.</p>')+(h.status==='published'&&preview?.official===false?renderProfessionalPublicationReportPreview(preview):'')+'</div>'+(canVerify&&h.status==='published'&&preview?.official===false?'<button type="button" data-gx-followup-action="report-proof" data-gx-id="'+esc(h.id)+'">Comprobar vigencia para informe y preparar selección</button>':'')+(canWithdraw&&h.status!=='withdrawn'?'<button type="button" data-gx-followup-action="withdraw-publication" data-gx-id="'+esc(h.id)+'">Retirar publicación</button>':'')+'</article>';
}
export function renderPublicationReviewActions(preview,{canPublish=false}={}){
 if(!preview)return '';
 if(!preview.checked)return '<button type="button" data-gx-followup-action="publication-lookup">Comprobar publicación existente</button>';
 if(preview.head?.status==='published')return '<p>Este par ya tiene una publicación vigente. No se creará otra.</p>';
 if(preview.head?.status==='invalidated')return '<p>La evidencia está invalidada. Actualiza el historial.</p>';
 return canPublish?'<button type="button" data-gx-followup-action="publish-publication" class="m26-primary-action">'+(preview.head?'Revisar y volver a publicar':'Confirmar revisión y publicar')+'</button>':'';
}

function renderProfessionalPublicationReportPreview(p){
 const m=metricByKey(p.testId+':'+p.field);if(!m)return '';
 return '<section class="m26-panel m26-panel-soft"><h4>Vista de evidencia para informe</h4><p>'+esc(m.label)+' · '+esc(sideLabels[p.side])+'</p><p>'+esc(p.periodStart)+': '+esc(p.previous)+' '+esc(unitLabels[p.unit])+' · '+esc(p.periodEnd)+': '+esc(p.value)+' '+esc(unitLabels[p.unit])+'</p><p>Diferencia observada: '+esc(p.delta>0?'+'+p.delta:p.delta)+' '+esc(unitLabels[p.deltaUnit]||p.deltaUnit)+'.</p><p>'+esc(p.interpretation)+'</p>'+(p.goal?'<h4>Contraste con el objetivo publicado</h4><p>'+esc(p.goal)+'</p>':'')+(p.serverVerified===true&&p.canonicalEvidence?'<p>Vigencia y contenido contrastados en la última consulta.</p><details><summary>Texto de evidencia verificado</summary><p>'+esc(p.canonicalEvidence.label)+': '+esc(p.canonicalEvidence.text)+'</p></details>':'')+'<small>Vista privada del Coach; no es un informe emitido ni acredita un logro.</small></section>';
}
