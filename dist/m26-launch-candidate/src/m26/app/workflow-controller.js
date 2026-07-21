import {buildIriCommand} from '../workflows/iri-workflow.js';
import {buildCycleCommand} from '../workflows/planning-workflow.js';
import {buildAppointmentCommand} from '../workflows/agenda-workflow.js';
import {applyAdaptiveContext} from '../intelligence/adaptive-context.js';
import {generateSessionProposal} from '../intelligence/session-engine.js';
import {createM26Id} from '../platform/id.js';

function values(form){return Object.fromEntries(new FormData(form).entries());}
function status(root,scope,message,kind='info'){
  const node=root.querySelector?.(`[data-workflow-status="${scope}"]`);
  if(!node)return;node.textContent=message;node.dataset.status=kind;
}
function numberOrNull(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function emit(root,name,detail){root.dispatchEvent(new CustomEvent(name,{bubbles:true,detail}));}
function escape(value){return String(value??'').replace(/[&<>"']/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));}
function libraryCard(item){const text=[item.name_es,item.pattern,item.equipment].join(' ').toLowerCase();return `<article class="m26-library-card" data-library-text="${escape(text)}"><div class="m26-library-media" aria-hidden="true">${escape((item.name_es||'I').slice(0,1))}</div><div><h3>${escape(item.name_es||'Ejercicio')}</h3><p>${escape(item.pattern||'Patrón')} · ${escape(item.equipment||'Sin equipo')}</p></div></article>`;}

export function createWorkflowController({root,store,commandBus,catalog,getRegistry=()=>[],onRender=()=>{}}={}){
  if(!root?.addEventListener||!store?.getState||!commandBus?.execute)throw new Error('M26_WORKFLOW_CONTROLLER_REQUIRED');
  let mounted=false;
  function context(){const state=store.getState();const role=String(state.identity?.role||'');const clientId=role==='client'?state.identity?.clientId:state.selectedClientId;return {state,role,clientId};}
  async function completeIri(){
    const form=root.querySelector?.('[data-workflow-form="iri"]');if(!form)throw new Error('M26_IRI_FORM_REQUIRED');
    const raw=values(form);const {clientId,state}=context();if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');
    const current=(state.collections.iriAssessments||[]).find((item)=>(item.clientId||item.client_id)===clientId&&String(item.id)===String(raw.entityId));
    if(!current?.id)throw new Error('M26_IRI_REMOTE_ENTITY_REQUIRED');
    const draft={...current,id:current.id,clientId,assessmentDate:raw.assessmentDate,birthDate:raw.birthDate,sexForNorms:raw.sexForNorms,stepFinalHr:numberOrNull(raw.stepFinalHr),stepOneMinuteHr:numberOrNull(raw.stepOneMinuteHr),pushUps:numberOrNull(raw.pushUps),chairStand30s:numberOrNull(raw.chairStand30s),bodyComposition:{bodyFatPercent:numberOrNull(raw.bodyFatPercent)},strengthPatterns:{push:'pushUps',lower:'chairStand30s'}};
    const command=buildIriCommand(draft,Number(current.revision||0));const result=await commandBus.execute(command);status(root,'iri',result.ok?'IRI confirmado por el servidor.':'IRI pendiente de revisión.',result.ok?'success':'pending');return result;
  }
  async function validatePlan(){
    const form=root.querySelector?.('[data-workflow-form="planning"]');if(!form)throw new Error('M26_PLAN_FORM_REQUIRED');
    const raw=values(form);const {clientId,state}=context();if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');
    const draft={id:raw.entityId||createM26Id(),clientId,name:String(raw.name||'').trim(),startDate:raw.startDate,endDate:raw.endDate,goal:String(raw.goal||'').trim()};
    const current=(state.collections.trainingCycles||[]).find((item)=>String(item.id)===String(draft.id));
    const result=await commandBus.execute(buildCycleCommand(draft,Number(current?.revision||0)));status(root,'planning',result.ok?'Plan validado y rehidratado.':'Plan pendiente de confirmación.',result.ok?'success':'pending');return result;
  }
  async function createAppointment(){
    const form=root.querySelector?.('[data-workflow-form="appointment"]');if(!form)throw new Error('M26_APPOINTMENT_FORM_REQUIRED');
    const raw=values(form);const draft={clientId:raw.clientId,startAt:new Date(raw.startAt).toISOString(),endAt:new Date(raw.endAt).toISOString(),modality:raw.modality,location:String(raw.location||'').trim()};
    const result=await commandBus.execute(buildAppointmentCommand(draft,0));status(root,'appointment',result.ok?'Cita confirmada por el servidor.':'Cita pendiente.',result.ok?'success':'pending');if(result.ok)form.reset();return result;
  }
  function openBuilder(){const {clientId}=context();if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');emit(root,'m26:open-session-builder',{clientId});status(root,'session','Constructor abierto.','success');}
  function startSession(){const {clientId,state}=context();const session=(state.collections.sessions||[]).find((item)=>(item.clientId||item.client_id)===clientId);if(!session)throw new Error('M26_SESSION_PUBLISHED_REQUIRED');emit(root,'m26:start-session',{clientId,session});status(root,'session','Preparando sesión guiada.','success');}
  function generateIntelligence(){
    const form=root.querySelector?.('[data-workflow-form="intelligence"]');if(!form)throw new Error('M26_INTELLIGENCE_FORM_REQUIRED');const raw=values(form);const {clientId,state}=context();if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');
    const input=applyAdaptiveContext({clientId,goal:raw.goal,durationMinutes:Number(raw.durationMinutes),experience:raw.experience,modality:raw.modality,ageYears:Number(raw.ageYears),equipment:String(raw.equipment||'').split(',').map((x)=>x.trim()).filter(Boolean),restrictions:[],painAreas:[],contraindications:[]},state,clientId);
    const proposal=generateSessionProposal(input,catalog);const preview=root.querySelector?.('[data-intelligence-preview]');if(preview)preview.innerHTML=`<section class="m26-notice is-${proposal.requiresManualReview?'warning':'success'}"><strong>${proposal.exercises.length} ejercicios propuestos</strong><p>${proposal.estimatedMinutes} min · ${proposal.structure.type} · revisión Coach obligatoria.</p></section><div class="m26-stack">${proposal.exercises.map((item)=>`<article class="m26-list-card"><div><h3>${String(item.name).replace(/[&<>"']/g,'')}</h3><p>${item.sets} series · ${item.reps} · RPE ${item.targetRpe}</p></div></article>`).join('')}</div>`;
    status(root,'intelligence',proposal.requiresManualReview?'Propuesta conservadora: requiere revisión manual.':'Propuesta lista para revisión del Coach.',proposal.requiresManualReview?'pending':'success');emit(root,'m26:intelligence-proposal',{proposal});return proposal;
  }
  async function onClick(event){const button=event.target.closest?.('[data-workflow-action]');if(!button)return;const action=button.getAttribute('data-workflow-action');button.disabled=true;button.setAttribute('aria-busy','true');try{if(action==='complete-iri')await completeIri();else if(action==='validate-plan')await validatePlan();else if(action==='create-appointment')await createAppointment();else if(action==='open-session-builder')openBuilder();else if(action==='start-published-session')startSession();else if(action==='generate-intelligence')generateIntelligence();}catch(error){const scope=action.includes('iri')?'iri':action.includes('plan')?'planning':action.includes('appointment')?'appointment':action.includes('intelligence')?'intelligence':'session';status(root,scope,error.message,'error');emit(root,'m26:workflow-error',{action,code:error.message});}finally{button.disabled=false;button.removeAttribute('aria-busy');}}
  function onInput(event){const search=event.target.closest?.('[data-library-search]');if(!search)return;const query=String(search.value||'').trim().toLowerCase();const all=catalog?.list?.()||[];const filtered=(query?all.filter((item)=>[item.name_es,item.pattern,item.equipment,...(item.tags||[]),...(item.aliases||[])].join(' ').toLowerCase().includes(query)):all).slice(0,120);const grid=root.querySelector?.('[data-library-grid]');if(grid)grid.innerHTML=filtered.map(libraryCard).join('');const node=root.querySelector?.('[data-library-status]');if(node)node.textContent=`${filtered.length}${query&&filtered.length===120?' o más':''} ejercicios visibles`;}
  return Object.freeze({mount(){if(mounted)return;root.addEventListener('click',onClick);root.addEventListener('input',onInput);mounted=true;},destroy(){if(!mounted)return;root.removeEventListener('click',onClick);root.removeEventListener('input',onInput);mounted=false;}});
}
