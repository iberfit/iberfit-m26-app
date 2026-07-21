import {parseWearableExportTextAsync,summarizeWearableData} from './normalization.js';
import {wearableProviderDefinition} from './contracts.js';
import {wearableZeroCostPolicy} from './free-policy.js';
import {createLatestTaskCoordinator} from '../platform/latest-task.js';

function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function setStatus(root,message,kind='info'){const node=root.querySelector?.('[data-wearable-status]');if(!node)return;node.textContent=message;node.dataset.status=kind;}
function context(store){const state=store.getState();const role=String(state.identity?.role||'').toLowerCase();return {role,clientId:role==='client'?state.identity?.clientId:state.selectedClientId};}
function metric(label,value,unit=''){return `<div class="m26-field"><span>${escapeHtml(label)}</span><strong>${value===null||value===undefined?'Sin dato':`${escapeHtml(value)}${unit?` ${escapeHtml(unit)}`:''}`}</strong></div>`;}
function compactMetric(value,unit=''){return value===null||value===undefined?null:`${value}${unit}`;}
function wearableContextText(preview){
  if(!preview?.summary)return '';
  const {summary,providerLabel}=preview;const values=[
    ['pasos medios',compactMetric(summary.metrics.steps)],
    ['actividad',compactMetric(summary.metrics.activeMinutes,' min/día')],
    ['sueño',compactMetric(summary.metrics.sleepMinutes,' min/día')],
    ['FC reposo',compactMetric(summary.metrics.restingHeartRate,' lpm')],
    ['VFC',compactMetric(summary.metrics.hrvMs,' ms')],
    ['entrenamiento',compactMetric(summary.metrics.workoutMinutes,' min/día')],
  ].filter(([,value])=>value!==null).map(([label,value])=>`${label}: ${value}`);
  return `Contexto de dispositivos revisado localmente (${providerLabel}, ${summary.daysWithData} día${summary.daysWithData===1?'':'s'}): ${values.length?values.join(' · '):'sin métricas válidas'}. Datos no sincronizados.`;
}
function renderPreview(root,parsed,provider){
  const summary=summarizeWearableData(parsed.accepted,{days:7});const node=root.querySelector?.('[data-wearable-preview]');if(!node)return null;const providerLabel=wearableProviderDefinition(provider)?.label||'Archivo';
  node.innerHTML=`<div class="m26-panel-heading"><div><p class="m26-eyebrow">Vista previa local</p><h3 tabindex="-1" data-wearable-preview-title>${escapeHtml(providerLabel)} · ${summary.daysWithData} día${summary.daysWithData===1?'':'s'}</h3></div><span class="m26-badge is-neutral">${parsed.accepted.length} aceptados · ${parsed.rejected.length} omitidos</span></div><div class="m26-field-grid">${metric('Pasos medios',summary.metrics.steps)}${metric('Minutos activos',summary.metrics.activeMinutes,'min')}${metric('Sueño medio',summary.metrics.sleepMinutes,'min')}${metric('FC reposo media',summary.metrics.restingHeartRate,'lpm')}${metric('VFC media',summary.metrics.hrvMs,'ms')}${metric('Entrenamiento',summary.metrics.workoutMinutes,'min')}</div><p class="m26-notice">Esta vista previa se procesa solo en el navegador. No se ha enviado ni confirmado ningún dato.</p><div class="m26-action-grid m26-wearable-preview-actions"><button type="button" data-wearable-action="use-in-checkin">Añadir resumen al registro de bienestar</button><button type="button" data-wearable-action="download-summary">Descargar resumen</button><button type="button" data-wearable-action="clear-preview">Descartar vista previa</button></div>`;
  node.hidden=false;node.querySelector?.('[data-wearable-preview-title]')?.focus?.({preventScroll:false});
  return Object.freeze({provider,providerLabel,summary,acceptedCount:parsed.accepted.length,rejectedCount:parsed.rejected.length,generatedAt:new Date().toISOString()});
}
function downloadJson(data,fileName){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=fileName;link.rel='noopener';link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
function downloadTemplate(){const rows=[{date:new Date().toISOString().slice(0,10),steps:7500,activeMinutes:42,sleepMinutes:450,restingHeartRate:58,hrvMs:48,activeEnergyKcal:520,workoutMinutes:35,quality:'media'}];downloadJson({records:rows},'iberfit-plantilla-dispositivos.json');}
function setFormBusy(form,busy){form?.setAttribute?.('aria-busy',String(Boolean(busy)));for(const control of form?.querySelectorAll?.('button,input,select')||[])control.disabled=Boolean(busy);}
function friendlyError(code){if(/SUPERSEDED|ABORTED/.test(code))return 'La revisión anterior se canceló sin guardar datos.';if(/TOO_LARGE/.test(code))return 'El archivo supera el límite de 5 MB.';if(/TOO_MANY_ROWS/.test(code))return 'El archivo supera el límite de 10.000 registros.';if(/REQUIRED/.test(code))return 'Selecciona un archivo normalizado JSON o CSV.';return 'No fue posible analizar el archivo. Revisa su formato.';}
function supersededError(error){const next=error instanceof Error?error:new Error(String(error||'M26_WEARABLE_IMPORT_SUPERSEDED'));next.m26Silent=true;return next;}

export function createWearableController({root,store}={}){
  if(!root?.addEventListener||!store?.getState)throw new Error('M26_WEARABLE_CONTROLLER_REQUIRED');let mounted=false,currentPreview=null;const tasks=createLatestTaskCoordinator();
  async function analyze(form){
    const {role,clientId}=context(store);if(role!=='client'||!clientId)throw new Error('M26_WEARABLE_CLIENT_CONTROL_REQUIRED');const file=form.elements?.namedItem?.('wearableFile')?.files?.[0];if(!file)throw new Error('M26_WEARABLE_FILE_REQUIRED');const provider=String(form.elements?.namedItem?.('wearableProvider')?.value||'normalized_file');const policy=wearableZeroCostPolicy(provider);if(provider!=='normalized_file'&&!policy)throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
    const task=tasks.begin();setFormBusy(form,true);setStatus(root,'Analizando el archivo en este dispositivo…','pending');
    try{
      const text=await file.text();if(!task.isCurrent())throw supersededError(new Error('M26_WEARABLE_IMPORT_SUPERSEDED'));
      const parsed=await parseWearableExportTextAsync(text,{fileName:file.name,clientId,provider,signal:task.signal});if(!task.isCurrent())throw supersededError(new Error('M26_WEARABLE_IMPORT_SUPERSEDED'));
      currentPreview=renderPreview(root,parsed,provider);setStatus(root,parsed.accepted.length?'Vista previa preparada. Aún no se ha sincronizado nada.':'No se encontraron registros válidos.','success');return parsed;
    }catch(error){if(!task.isCurrent()||task.signal.aborted)throw supersededError(error);throw error;}
    finally{if(task.isCurrent()){setFormBusy(form,false);task.finish();}}
  }
  async function onSubmit(event){const form=event.target.closest?.('[data-wearable-import]');if(!form)return;event.preventDefault?.();try{await analyze(form);}catch(error){if(error?.m26Silent)return;const code=String(error?.message||error);setStatus(root,friendlyError(code),/ABORTED|SUPERSEDED/.test(code)?'info':'error');}}
  function clearPreview(){tasks.cancel();currentPreview=null;const node=root.querySelector?.('[data-wearable-preview]');if(node){node.innerHTML='';node.hidden=true;}const form=root.querySelector?.('[data-wearable-import]');form?.reset?.();setFormBusy(form,false);setStatus(root,'Vista previa eliminada.','success');}
  function useInCheckin(){if(!currentPreview)throw new Error('M26_WEARABLE_PREVIEW_REQUIRED');const notes=root.querySelector?.('[data-engagement-form="checkin"] textarea[name="notes"]');if(!notes)throw new Error('M26_WEARABLE_CHECKIN_FORM_REQUIRED');const text=wearableContextText(currentPreview);const previous=String(notes.value||'').trim();if(!previous.includes(text))notes.value=[previous,text].filter(Boolean).join('\n\n').slice(0,1000);notes.dispatchEvent?.(new Event('input',{bubbles:true}));notes.focus?.({preventScroll:false});setStatus(root,'Resumen añadido al registro de bienestar. Revísalo antes de enviarlo.','success');}
  function downloadSummary(){if(!currentPreview)throw new Error('M26_WEARABLE_PREVIEW_REQUIRED');downloadJson({schema:'iberfit-device-summary-v1',...currentPreview,notice:'Resumen generado localmente. No acredita sincronización ni confirmación remota.'},`iberfit-resumen-dispositivos-${new Date().toISOString().slice(0,10)}.json`);setStatus(root,'Resumen descargado sin incluir el archivo original.','success');}
  function onClick(event){const button=event.target.closest?.('[data-wearable-action]');if(!button)return;const action=button.getAttribute('data-wearable-action');try{if(action==='download-template'){event.preventDefault?.();downloadTemplate();setStatus(root,'Plantilla descargada. Complétala sin incluir nombres, correos ni otros identificadores.','success');}else if(action==='clear-preview'){event.preventDefault?.();clearPreview();}else if(action==='use-in-checkin'){event.preventDefault?.();useInCheckin();}else if(action==='download-summary'){event.preventDefault?.();downloadSummary();}}catch(error){setStatus(root,friendlyError(String(error?.message||error)),'error');}}
  return Object.freeze({mount(){if(mounted)return;root.addEventListener('submit',onSubmit);root.addEventListener('click',onClick);mounted=true;},destroy(){if(!mounted)return;tasks.cancel();currentPreview=null;root.removeEventListener('submit',onSubmit);root.removeEventListener('click',onClick);mounted=false;},analyze,clearPreview,getPreview:()=>currentPreview});
}

export const __wearableControllerInternals=Object.freeze({wearableContextText,friendlyError});
