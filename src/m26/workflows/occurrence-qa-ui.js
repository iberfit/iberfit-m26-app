// IBERFIT UNIVERSAL 360 · QA-only, real occurrence-scoped Coach/Client player.
// Neither a calendar row nor an optimistic local draft starts a workout.
// All writes use U60 authenticated private read + U40 idempotent journal,
// encrypted U51 checkpoint and the independent U31/U32 CAS executor.
// Production is unavailable until versioned U30-U60 + recovery gates exist.
import {createTraining360OccurrenceRuntime} from './occurrence-runtime.js';
import {createOccurrenceOwnerKeyVault} from './occurrence-owner-key.js';
import {createAtomicOccurrenceIndexedDbStore} from './occurrence-indexeddb-store.js';
import {assertNoPendingSessionOccurrences} from './occurrence-session-retirement-gate.js';
import {buildOccurrenceScopedCommand} from '../domain/occurrence-commands.js';
import {resolveSantiagoLocalInstant} from '../domain/dated-training-occurrences.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const ZONE='America/Santiago';
const escape=value=>String(value??'').replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');
const field=(row,...keys)=>{
  const body=row?.body&&typeof row.body==='object'&&!Array.isArray(row.body)
    ?row.body:{};
  for(const key of keys){
    const v=row?.[key]??body[key];
    if(v!==undefined&&v!==null&&v!=='')return v;
  }
  return null;
};
const uid=v=>String(v||'').trim().toLowerCase();
export function formatDatedElapsed(milliseconds){
  const ms=Number(milliseconds);
  if(!Number.isFinite(ms)||ms<0)return '00:00';
  const seconds=Math.floor(ms/1000),minutes=Math.floor(seconds/60);
  const hh=Math.floor(minutes/60);
  const digits=v=>String(v).padStart(2,'0');
  return hh?digits(hh)+':'+digits(minutes%60)+':'+digits(seconds%60)
    :digits(minutes)+':'+digits(seconds%60);
}
const fail=code=>{throw new Error('U60_UI_'+code);};
const localDate=date=>{
  const f=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,
    year:'numeric',month:'2-digit',day:'2-digit'});
  const p=Object.fromEntries(f.formatToParts(date)
    .filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
};
// Explicit editing aid: only unambiguous prescription values may be copied.
// This never creates a performed set, RPE/RIR observation, or remote write.
export function plannedDatedSetDraft(step){
  const p=step?.prescription;
  if(!p||typeof p!=='object'||Array.isArray(p))return Object.freeze({});
  const result={};
  const repetitions=String(p.reps??'').trim();
  if(/^(?:0|[1-9][0-9]{0,4})$/u.test(repetitions)&&Number(repetitions)<=10000)
    result.reps=repetitions;
  const weight=String(p.plannedLoad??'').trim().replace(/\s*kg$/iu,'').trim();
  if(/^(?:0|[1-9][0-9]{0,4})(?:[.,][0-9]{1,2})?$/u.test(weight)&&
    Number(weight.replace(',','.'))<=10000)
    result.load=weight.replace(',','.');
  return Object.freeze(result);
}
export function qaDatedCalendarRange(now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    fail('CLOCK_INVALID');
  const today=localDate(now);
  const t=Date.parse(today+'T12:00:00.000Z');
  const at=delta=>new Date(t+delta*86400000).toISOString().slice(0,10);
  return Object.freeze({startDate:at(-14),endDate:at(77)});
}
function parseCoachDates(value){
  const lines=String(value||'').trim().split(/\r?\n/gu).filter(Boolean);
  if(!lines.length||lines.length>52)fail('DATES_REQUIRED');
  return lines.map(line=>{
    const match=line.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/u);
    if(!match)fail('DATE_FORMAT_INVALID');
    return {localDate:match[1],localTime:match[2]};
  });
}
function formValue(target,name){
  return String(target?.closest?.('[data-u60-panel]')?.querySelector?.(
    '[name="'+name+'"]')?.value||'').trim();
}
function humanError(error){
  const code=String(error?.message||'');
  if(/RPE_REQUIRED|RPE_INVALID/u.test(code))
    return 'Registra el RPE real de esta serie, entre 1 y 10, en pasos de 0,5. Puedes seleccionarlo o escribirlo.';
  if(/METRIC_INVALID/u.test(code))
    return 'Revisa las repeticiones, el tiempo, la distancia o el RIR. Deben ser cantidades válidas y dentro de sus límites.';
  if(/SKIP_REASON_REQUIRED/u.test(code))
    return 'Para omitir una serie debes registrar un motivo de al menos tres caracteres.';
  if(/OWNER_KEY_(LOCKED|RECOVERY_PHRASE_REQUIRED)/u.test(code))
    return 'Introduce tu clave privada de recuperación (mínimo 16 caracteres). No es la contraseña de tu cuenta.';
  if(/SCOPE|ROLE|FORBIDDEN|DENIED|PRIVACY|AUTH/u.test(code))
    return 'Esta operación no está autorizada para tu cuenta, cliente o modalidad.';
  if(/RECOVERY|JOURNAL|CHECKPOINT|CONFLICT|CAS|UNCERTAIN/u.test(code))
    return 'Hay una operación o copia cifrada pendiente. Conserva este dispositivo y recupera antes de repetir la acción.';
  if(/APPOINTMENT|DATE|CYCLE|PREVIEW|FORMAT|WINDOW/u.test(code))
    return 'Revisa las fechas, el ciclo publicado y las citas confirmadas: deben coincidir exactamente antes de publicar.';
  return 'No se pudo confirmar el cambio. El progreso local cifrado se conserva; comprueba la conexión y reintenta.';
}
export function createDatedOccurrenceQaUi({
  enabled=false,root,ownerId,projectRef,transport,getAuthContext,
  getState,onRender=()=>{},cryptoImpl=globalThis.crypto,
}={}){
  if(enabled!==true)return Object.freeze({
    enabled:false,mount:()=>{},destroy:()=>{},renderPanel:()=>'',hasBlockingWorkout:()=>false,
  });
  // Distinct machine-readable validation errors prevent masking a broken
  // DOM harness as a backend permission problem. Never report user IDs.
  if(typeof root?.addEventListener!=='function'||
    typeof root?.removeEventListener!=='function')fail('ROOT_REQUIRED');
  if(!UUID.test(String(ownerId||'')))fail('OWNER_ID_REQUIRED');
  if(!transport||typeof getAuthContext!=='function')fail('TRANSPORT_AUTH_REQUIRED');
  if(typeof getState!=='function')fail('STATE_REQUIRED');
  if(typeof onRender!=='function')fail('RENDER_REQUIRED');
  const owner=uid(ownerId);
  const vault=createOccurrenceOwnerKeyVault({ownerId:owner,projectRef,cryptoImpl});
  const persistence=createAtomicOccurrenceIndexedDbStore();
  const runtime=createTraining360OccurrenceRuntime({
    enabled:true,ownerId:owner,transport,getAuthContext,
    keyProvider:()=>vault.getKey(),store:persistence,cryptoImpl,
    createId:()=>cryptoImpl.randomUUID(),
  });
  let mounted=false,disposed=false,busy=false,ticker=null,loadedFor='',rows=[],
    focus=null,preview=null,message='',failure='',generation=0,visibleScopeKey='';
  const repaint=()=>{if(!disposed)onRender();};
  // The U33 calendar differs by signed-in role, even for one client UUID.
  // A Coach projection must never be reused by Client after changing area.
  const roleScope=scope=>scope.role+'|'+scope.clientId;
  function identity(){
    const state=getState()||{},i=state.identity||{};
    const role=String(i.role||'').trim().toLowerCase();
    if(!['coach','client','cliente'].includes(role))fail('ROLE_FORBIDDEN');
    const clientId=uid(role==='coach'?state.selectedClientId:i.clientId);
    if(!UUID.test(clientId))fail('CLIENT_REQUIRED');
    if(role==='coach'&&!(state.collections?.clients||[])
      .some(c=>uid(c.id)===clientId))fail('CLIENT_NOT_VISIBLE');
    if(role!=='coach'&&uid(i.clientId)!==clientId)fail('CLIENT_SCOPE_FORBIDDEN');
    return {role,clientId,state};
  }
  async function authenticated(){
    const actor=await getAuthContext();
    const scope=identity();
    if(uid(actor?.userId)!==owner||String(actor?.role||'').toLowerCase()!==scope.role
      ||(scope.role!=='coach'&&uid(actor?.clientId)!==scope.clientId))
      fail('AUTH_CHANGED');
    return scope;
  }
  function visibleOwner(){
    let scope=null;
    try{scope=identity();}catch{}
    const key=scope?roleScope(scope):'';
    if(key!==visibleScopeKey){
      visibleScopeKey=key;
      generation++; // invalidate any calendar or preview started in an older role
      // Read-only in-memory projection only. Never delete encrypted recovery
      // journals/checkpoints or active workouts when a workspace changes.
      loadedFor='';rows=[];preview=null;message='';failure='';
    }
    return scope;
  }
  function workoutView(){
    return focus?runtime.workout.view():null;
  }
  function hasBlockingWorkout(){
    if(!focus)return false;
    const v=workoutView();
    return Boolean(v?.busy||v?.hasUncertain||v?.unsavedWork||
      ['ready','active','pending-recovery'].includes(v?.phase));
  }
  function dateRows(scope){
    return loadedFor===roleScope(scope)?rows:[];
  }
  async function verifySessionRetirement({clientId,sessionId}={}){
    if(disposed)fail('DESTROYED');
    const auth=await authenticated();
    if(auth.role!=='coach'||auth.clientId!==uid(clientId))
      fail('COACH_RETIRE_SCOPE_FORBIDDEN');
    // This read checks the full published cycle, not a cached/screen-limited
    // collection. A failed/incomplete scan cannot authorize withdrawal.
    const verdict=await assertNoPendingSessionOccurrences({
      state:getState(),clientId,sessionId,
      readCalendar:range=>runtime.calendar(range),
    });
    await authenticated();
    if(roleScope(identity())!==roleScope(auth))fail('COACH_RETIRE_SCOPE_CHANGED');
    return verdict;
  }
  function renderPanel(){
    if(disposed)return '';
    const scope=visibleOwner();
    if(!scope)return '';
    const coach=scope.role==='coach';
    const isCurrent=loadedFor===roleScope(scope);
    const entries=dateRows(scope);
    const view=focus?.clientId===scope.clientId&&focus?.role===scope.role
      ?workoutView():null;
    const locked=!vault.isUnlocked();
    const status=failure
      ?'<p role="alert" class="m26-form-status is-error">'+escape(failure)+'</p>'
      :message?'<p role="status" class="m26-form-status">'+escape(message)+'</p>':'';
    const lockedMarkup=locked
      ?'<div class="m26-field-grid"><label class="m26-wide">Clave privada de recuperación (no es tu contraseña IBERFIT)<input name="u60Phrase" type="password" minlength="16" maxlength="256" autocomplete="off" spellcheck="false"></label>'+
       '<button type="button" data-iberdates-action="u60-unlock">Desbloquear recuperación cifrada</button>'+
       '<p class="m26-field-help">Guarda esta frase por tu cuenta: se pedirá de nuevo al volver a entrar y nunca se almacena. Si la pierdes, una operación local aún no confirmada puede quedar bloqueada.</p></div>'
      :'<p class="m26-field-help">Recuperación cifrada desbloqueada para esta cuenta y dispositivo.</p>';
    const controls='<div class="m26-inline-actions"><button type="button" data-iberdates-action="u60-calendar">Consultar fechas confirmadas</button></div>';
    let body='';
    if(view&&focus?.clientId===scope.clientId){
      const phase=String(view.phase||'idle');
      const step=view.currentStep;
      const stepLabel=step?.exercise?.nameEs||step?.exercise?.name||step?.exerciseId||'Ejercicio';
      const phaseLabel={
        ready:'Preparada · pendiente de inicio confirmado',
        active:'Entrenamiento en curso',completed:'Finalizado y confirmado',
        cancelled:'Fecha cancelada', 'pending-recovery':'Recuperación pendiente',
        'needs-refresh':'Comprobar última versión del servidor',
      }[phase]||'Verificando';
      const summary='<p><strong>'+escape(phaseLabel)+'</strong> · '+escape(view.localDate||'')+'</p>';
      const stepMarkup=step
        ?'<p><strong>'+escape(stepLabel)+'</strong> · serie '+escape(step.setNumber)+' de '+escape(step.totalSets)+'</p>'+
         '<p class="m26-field-help">'+escape(
           step.prescription?.reps||step.prescription?.duration||'Registra el resultado real, no el objetivo'
         )+'</p>'
        :view.executionStatus==='awaiting_feedback'
          ?'<p>Series registradas. Añade el feedback antes de finalizar.</p>'
          :'';
      const plannedDraft=coach?plannedDatedSetDraft(step):{};
      const hasPlannedDraft=Object.keys(plannedDraft).length>0;
      const recordForm=phase==='active'&&view.executionStatus==='active'&&step
        ?'<div class="m26-field-grid" data-u60-entry>'+
         (coach&&hasPlannedDraft
           ?'<div class="m26-wide"><button type="button" data-u60-copy-plan aria-label="Copiar objetivo prescrito a los campos vacíos">Usar objetivo como borrador</button>'+
            '<p class="m26-field-help">No es un resultado real. Revisa cada valor, registra el esfuerzo observado y confirma la serie.</p></div>':'')+
         '<label>Repeticiones<input name="u60Reps" type="number" min="0" max="10000" inputmode="decimal"></label>'+
         '<label>Tiempo (segundos)<input name="u60Seconds" type="number" min="0" max="86400" inputmode="decimal"></label>'+
         '<label>Distancia running (km)<input name="u60DistanceKm" type="number" step="0.01" min="0" max="1000" inputmode="decimal"></label>'+
         '<label>Distancia natación (m)<input name="u60DistanceM" type="number" min="0" max="100000" inputmode="decimal"></label>'+
         '<label>Carga (kg)<input name="u60Load" maxlength="80"></label>'+
         '<label>RPE de la serie (1–10)<input name="u60Rpe" type="number" min="1" max="10" step="0.5" required inputmode="decimal"></label>'+
         (coach?'<div class="m26-session-coach-rpe-quick" role="group" aria-label="Seleccionar RPE real de la serie"><span>RPE real</span>'+
           [6,7,8,9,10].map(value=>'<button type="button" data-u60-quick-rpe="'+value+'" aria-label="RPE '+value+'" aria-pressed="false">'+value+'</button>').join('')+
           '</div>':'')+
         '<label>RIR<input name="u60Rir" type="number" min="0" max="10" step="0.5" inputmode="decimal"></label>'+
         '<label>Ritmo running (min/km)<input name="u60Pace" placeholder="5:30" pattern="[0-9]{1,2}:[0-5][0-9]"></label>'+
         '<label>Ritmo natación (min/100m)<input name="u60PaceSwim" placeholder="2:15"></label>'+
         '<label class="m26-wide">Observación<input name="u60Notes" maxlength="1000"></label>'+
         '<button type="button" data-iberdates-action="u60-record">Registrar serie, avanzar y sincronizar</button>'+
         '<label class="m26-wide">Motivo para omitir<input name="u60SkipReason" maxlength="300"></label>'+
         '<button type="button" data-iberdates-action="u60-skip">Omitir serie y sincronizar</button></div>'
        :'';
      const feedbackForm=phase==='active'&&view.executionStatus==='awaiting_feedback'
        ?'<div class="m26-field-grid"><label>RPE de la sesión<input name="u60FinalRpe" type="number" min="1" max="10" step="0.5" required></label>'+
         '<label class="m26-wide">Comentario final<textarea name="u60FinalComment" maxlength="2000" required></textarea></label>'+
         '<label>¿Hubo dolor?<input type="checkbox" name="u60Pain"></label>'+
         '<label>Detalles si hubo dolor<input name="u60PainNotes" maxlength="1000"></label>'+
         '<button type="button" data-iberdates-action="u60-complete">Finalizar y confirmar en servidor</button></div>'
        :'';
      const buttons=phase==='ready'
        ?'<button type="button" class="m26-primary-action" data-iberdates-action="u60-start">Comenzar fecha confirmada</button>'
        :phase==='pending-recovery'
          ?'<button type="button" data-iberdates-action="u60-reconcile">Recuperar operación original</button>'
          :phase==='needs-refresh'
            ?'<button type="button" data-iberdates-action="u60-reopen">Leer versión autorizada</button>'
            :'';
      const save=phase==='active'&&view.executionStatus==='active'&&view.unsavedWork
        ?'<button type="button" data-iberdates-action="u60-save">Sincronizar progreso pendiente</button>':'';
      const retryComplete=phase==='active'&&view.executionStatus==='completed'
        ?'<button type="button" class="m26-primary-action" data-iberdates-action="u60-retry-complete">Confirmar finalización pendiente en servidor</button>':'';
      body='<section class="m26-panel" data-u60-workout><h3>Fecha independiente</h3>'+
        summary+stepMarkup+buttons+recordForm+feedbackForm+save+retryComplete+
        (view.startedAt?'<p class="m26-field-help">Tiempo transcurrido desde el inicio confirmado · <strong role="timer" aria-live="off" data-u60-clock-start="'+escape(view.startedAt)+'">'+escape(formatDatedElapsed(Date.now()-Date.parse(view.startedAt)))+'</strong></p>':'')+
        '<button type="button" data-iberdates-action="u60-close">Volver al calendario</button></section>';
    }else{
      const cards=isCurrent?entries.map(row=>{
        const canConfirm=coach&&row.status==='planificada';
        const canOpen=['confirmada','en_curso','completada','cancelada'].includes(row.status)
          &&(coach||Boolean(row.appointmentId&&row.appointmentStatus));
        return '<article class="m26-list-card"><div><p class="m26-eyebrow">'+
          escape(row.localDate)+(row.localTime?' · '+escape(row.localTime):'')+
          '</p><h3>'+escape(row.title||'Entrenamiento')+'</h3><p>'+
          escape(row.status)+'</p></div><div class="m26-inline-actions">'+
          (canConfirm?'<button type="button" data-iberdates-action="u60-confirm" data-u60-id="'+escape(row.id)+'">Confirmar fecha</button>':'')+
          (coach&&['planificada','confirmada'].includes(row.status)
            ?'<details data-u60-date-cancel><summary>Cancelar esta fecha</summary><button type="button" data-iberdates-action="u60-cancel" data-u60-id="'+escape(row.id)+'">Confirmar cancelación</button></details>':'')+
          (canOpen?'<button type="button" data-iberdates-action="u60-open" data-u60-id="'+escape(row.id)+'">Abrir esta fecha</button>':'')+
          (coach&&vault.isUnlocked()?'<button type="button" data-iberdates-action="u60-retry-date" data-u60-id="'+escape(row.id)+'">Recuperar cambio pendiente</button>':'')+
          '</div></article>';
      }).join(''):'';
      const sessions=coach?(scope.state.collections?.sessions||[])
        .filter(s=>uid(field(s,'clientId','client_id'))===scope.clientId
          &&String(field(s,'status')||'').toLowerCase()==='disponible'
          &&String(field(s,'deliveryModality')||'')==='guiada_en_app')
        .map(s=>'<option value="'+escape(field(s,'id'))+'">'+
          escape(String(field(s,'title')||'Entrenamiento').slice(0,90))+'</option>').join(''):'';
      const publisher=coach&&sessions
        ?'<details class="m26-panel"><summary>Programar varias fechas de una sesión publicada</summary>'+
         '<label>Sesión publicada<select name="u60Session">'+sessions+'</select></label>'+
         '<label>Fechas y horas en Chile, una por línea (AAAA-MM-DD HH:mm)'+
         '<textarea name="u60Dates" rows="4" maxlength="1500" placeholder="2026-11-09 08:00&#10;2026-11-12 08:00"></textarea></label>'+
         '<p class="m26-field-help">Cada fecha necesita una cita ya confirmada y vinculada a esa sesión, con horario y duración exactos. La cita se prepara en Agenda. La publicación nunca modifica otras fechas.</p>'+
         '<button type="button" data-iberdates-action="u60-preview">Verificar fechas y citas</button>'+
         '<button type="button" data-iberdates-action="u60-retry-publish">Recuperar una programación pendiente</button>'+
         (preview&&preview.clientId===scope.clientId
           ?'<p role="status">'+escape(preview.preview.count)+' fechas verificadas · revisión requerida</p>'+
            '<button type="button" class="m26-primary-action" data-iberdates-action="u60-publish">Confirmar programación</button>'
           :'')+'</details>':'';
      body=(isCurrent?(cards||'<p class="m26-empty-copy">No hay fechas dentro del periodo consultado.</p>')
        :'<p class="m26-empty-copy">Consulta el calendario autorizado para elegir una fecha.</p>')+
        publisher;
    }
    return '<section class="m26-panel" data-u60-panel data-u60-qa-only="true"'+
      (busy?' aria-busy="true"':'')+'><div class="m26-panel-heading"><div>'+
      '<p class="m26-eyebrow">Training360 · Canary</p>'+
      '<h2>Entrenamiento por fechas independientes</h2>'+
      '<p>Cada fecha tiene su ejecución y confirmación propias. Nunca se reutiliza el inicio de la sesión original.</p>'+
      '</div></div>'+status+lockedMarkup+controls+body+'</section>';
  }
  function verifiedRow(id,scope){
    const rowsFor=dateRows(scope);
    const matches=rowsFor.filter(row=>uid(row.id)===uid(id));
    if(matches.length!==1||!UUID.test(uid(id)))fail('OCCURRENCE_NOT_VERIFIED');
    return matches[0];
  }
  async function load(scope){
    // The first authenticated calendar action can precede the first route
    // paint. Establish the visible owner key before accepting remote rows.
    const visible=visibleOwner();
    if(!visible||roleScope(visible)!==roleScope(scope))fail('ACTOR_CHANGED');
    const range=qaDatedCalendarRange();
    const requestedScope=roleScope(scope),requestedGeneration=generation;
    const output=await runtime.calendar({clientId:scope.clientId,...range,limit:50});
    await authenticated();
    if(roleScope(identity())!==requestedScope||generation!==requestedGeneration)
      fail('ACTOR_CHANGED');
    loadedFor=requestedScope;rows=output.occurrences;preview=null;
    message='Calendario confirmado: '+rows.length+' fecha(s) verificadas.';
  }
  function readResult(button){
    const names={
      reps:'u60Reps',seconds:'u60Seconds',distanceKm:'u60DistanceKm',
      distanceM:'u60DistanceM',load:'u60Load',rpe:'u60Rpe',
      rir:'u60Rir',paceMinPerKm:'u60Pace',pacePer100M:'u60PaceSwim',
      notes:'u60Notes',
    };
    const values={};
    for(const [name,label] of Object.entries(names)){
      const value=formValue(button,label);
      if(value)values[name]=value;
    }
    if(!values.rpe)fail('RPE_REQUIRED');
    const observed=Number(values.rpe);
    if(!Number.isFinite(observed)||observed<1||observed>10||
      !Number.isInteger(observed*2))fail('RPE_INVALID');
    for(const [key,min,max] of [
      ['reps',0,10000],['seconds',0,86400],
      ['distanceKm',0,1000],['distanceM',0,100000],
      ['rir',0,10],
    ]){
      if(!Object.hasOwn(values,key))continue;
      const actual=Number(values[key]);
      if(!Number.isFinite(actual)||actual<min||actual>max)fail('METRIC_INVALID');
    }
    if(values.rir!==undefined&&!Number.isInteger(Number(values.rir)*2))
      fail('METRIC_INVALID');
    return values;
  }
  async function previewDates(scope,button){
    if(scope.role!=='coach')fail('COACH_REQUIRED');
    if(!vault.isUnlocked())fail('OWNER_KEY_LOCKED');
    if(loadedFor!==roleScope(scope))fail('CALENDAR_REQUIRED');
    const sessionId=uid(formValue(button,'u60Session'));
    const session=(scope.state.collections?.sessions||[])
      .find(s=>uid(field(s,'id'))===sessionId
        &&uid(field(s,'clientId','client_id'))===scope.clientId);
    if(!session||String(field(session,'status'))!=='disponible'
      ||field(session,'deliveryModality')!=='guiada_en_app')fail('SESSION_NOT_PUBLISHED');
    const cycleId=uid(field(session,'cycleId'));
    const cycle=(scope.state.collections?.trainingCycles||[])
      .find(c=>uid(field(c,'id'))===cycleId
        &&uid(field(c,'clientId','client_id'))===scope.clientId);
    const cycleStart=field(cycle,'startDate','start_date');
    const cycleEnd=field(cycle,'endDate','end_date');
    if(!cycle||!cycleStart||!cycleEnd||
      !['publicado','published'].includes(String(field(cycle,'status'))))
      fail('PUBLISHED_CYCLE_REQUIRED');
    const minutes=Number(field(session,'durationMinutes'));
    if(!Number.isInteger(minutes)||minutes<10||minutes>240)
      fail('DURATION_INVALID');
    const dates=parseCoachDates(formValue(button,'u60Dates'));
    const appointments=scope.state.collections?.appointments||[];
    const appointmentIdsByDate={};
    for(const date of dates){
      const start=resolveSantiagoLocalInstant(date.localDate,date.localTime);
      const end=new Date(Date.parse(start)+minutes*60000).toISOString();
      const match=appointments.filter(row=>
        uid(field(row,'clientId','client_id'))===scope.clientId
        &&uid(field(row,'sessionId','session_id'))===sessionId
        &&String(field(row,'status'))==='confirmada'
        &&Date.parse(String(field(row,'startAt','start_at')) )===Date.parse(start)
        &&Date.parse(String(field(row,'endAt','end_at')) )===Date.parse(end)
      );
      if(match.length!==1||!UUID.test(uid(field(match[0],'id'))))
        fail('APPOINTMENT_MATCH_REQUIRED');
      appointmentIdsByDate[date.localDate]=uid(field(match[0],'id'));
    }
    const excluded=new Set(Object.values(appointmentIdsByDate));
    const revision=Number(field(session,'revision'));
    const options={
      sessionId,clientId:scope.clientId,sourceRevision:revision,
      sourceSnapshot:{clientId:scope.clientId,sessionId,
        blocks:field(session,'blocks')||[]},
      cycleStartDate:String(cycleStart),cycleEndDate:String(cycleEnd),
      dates,durationMinutes:minutes,
      existingOccurrences:dateRows(scope),
      existingAppointments:appointments.filter(ap=>!excluded.has(uid(field(ap,'id')))),
    };
    const startedAtGeneration=generation;
    const verified=await runtime.previewDates(options);
    await authenticated();
    if(roleScope(identity())!==roleScope(scope)||generation!==startedAtGeneration)
      fail('ACTOR_CHANGED');
    preview={clientId:scope.clientId,roleScope:roleScope(scope),sessionId,revision,
      preview:verified,appointmentIdsByDate};
    message='Fechas, horarios, ciclo y citas verificados. Confirma para programar.';
  }
  async function perform(action,button,payload){
    if(disposed)fail('DESTROYED');
    const scope=await authenticated();
    if(action==='u60-unlock'){
      await vault.unlock(payload.phrase);
      message='Clave privada desbloqueada. No se ha almacenado.';
      return;
    }
    if(action==='u60-calendar'){await load(scope);return;}
    if(!vault.isUnlocked())fail('OWNER_KEY_LOCKED');
    if(action==='u60-preview'){await previewDates(scope,button);return;}
    if(action==='u60-retry-publish'){
      if(scope.role!=='coach')fail('COACH_REQUIRED');
      const id=uid(formValue(button,'u60Session'));
      if(!UUID.test(id)||!(await runtime.hasPendingDates({
        clientId:scope.clientId,sessionId:id,
      })))fail('NO_PENDING_BATCH');
      const receipt=await runtime.retryDates({clientId:scope.clientId,sessionId:id});
      if(receipt.kind!=='ack'||receipt.localRecoveryPending)
        fail('RECOVERY_REQUIRED');
      await load(scope);message='Programación pendiente reconciliada con su operación original.';
      return;
    }
    if(action==='u60-publish'){
      if(scope.role!=='coach'||!preview||preview.clientId!==scope.clientId||
        preview.roleScope!==roleScope(scope))fail('PREVIEW_REQUIRED');
      const pending=preview;
      const source=(scope.state.collections?.sessions||[])
        .find(s=>uid(field(s,'id'))===pending.sessionId);
      if(!source||Number(field(source,'revision'))!==pending.revision)
        fail('PREVIEW_SOURCE_CHANGED');
      const response=await runtime.publishDates({
        operationId:cryptoImpl.randomUUID(),sessionId:pending.sessionId,
        clientId:scope.clientId,baseRevision:pending.revision,
        preview:pending.preview,confirmed:true,
        appointmentIdsByDate:pending.appointmentIdsByDate,
      });
      if(response.kind!=='ack'||response.localRecoveryPending)
        fail('RECOVERY_REQUIRED');
      preview=null;
      await load(scope);
      message='Fechas creadas y confirmadas por el servidor. Confirma cada una antes de iniciarla.';
      return;
    }
    if(action==='u60-confirm'){
      if(scope.role!=='coach')fail('COACH_REQUIRED');
      const row=verifiedRow(payload.id,scope);
      if(row.status!=='planificada')fail('DATE_NOT_PLANNED');
      const command=buildOccurrenceScopedCommand({
        type:'OCURRENCIA_CONFIRMAR',operationId:cryptoImpl.randomUUID(),
        clientId:scope.clientId,occurrenceId:row.id,baseRevision:row.revision,
      });
      const receipt=await runtime.recovery.send(command);
      if(receipt.kind!=='ack'||receipt.localRecoveryPending)
        fail('RECOVERY_REQUIRED');
      await load(scope);
      message='Fecha confirmada por el servidor.';
      return;
    }
    if(action==='u60-retry-date'){
      if(scope.role!=='coach')fail('COACH_REQUIRED');
      const row=verifiedRow(payload.id,scope);
      if(!(await runtime.recovery.hasUncertain({
        clientId:scope.clientId,occurrenceId:row.id,
      })))fail('NO_PENDING_DATE_COMMAND');
      const response=await runtime.recovery.retryUncertain({
        clientId:scope.clientId,occurrenceId:row.id,
      });
      if(response.kind!=='ack'||response.localRecoveryPending)
        fail('RECOVERY_REQUIRED');
      await load(scope);message='Cambio pendiente reconciliado sin duplicar operación.';
      return;
    }
    if(action==='u60-cancel'){
      if(scope.role!=='coach')fail('COACH_REQUIRED');
      const row=verifiedRow(payload.id,scope);
      if(!['planificada','confirmada'].includes(row.status))
        fail('DATE_NOT_CANCELLABLE');
      const receipt=await runtime.recovery.send(buildOccurrenceScopedCommand({
        type:'OCURRENCIA_CANCELAR',operationId:cryptoImpl.randomUUID(),
        clientId:scope.clientId,occurrenceId:row.id,baseRevision:row.revision,
      }));
      if(receipt.kind!=='ack'||receipt.localRecoveryPending)
        fail('RECOVERY_REQUIRED');
      await load(scope);
      message='Fecha cancelada por el servidor sin borrar el historial.';
      return;
    }
    if(action==='u60-open'){
      const row=verifiedRow(payload.id,scope);
      if(!['confirmada','en_curso','completada','cancelada'].includes(row.status))
        fail('DATE_NOT_EXECUTABLE');
      if(scope.role!=='coach'&&(!row.appointmentId||
        !['confirmada','cancelada','completada'].includes(row.appointmentStatus)))
        fail('APPOINTMENT_REQUIRED');
      const target={clientId:scope.clientId,occurrenceId:row.id,role:scope.role};
      focus=target;
      try{await runtime.openWorkout(target);}
      catch(error){
        // When the encrypted journal holds an uncertain remote command,
        // keep the exact date selected so the operator can reconcile it.
        if(runtime.workout.view().phase!=='pending-recovery')focus=null;
        throw error;
      }
      message='Estado individual verificado mediante lectura privada.';
      return;
    }
    if(!focus||focus.clientId!==scope.clientId||focus.role!==scope.role)
      fail('WORKOUT_SCOPE_CHANGED');
    if(action==='u60-close'){
      if(runtime.workout.view().hasUncertain||
        runtime.workout.view().unsavedWork)fail('UNSAVED_WORKOUT');
      focus=null;message='Calendario disponible.';return;
    }
    if(action==='u60-start'){
      const reply=await runtime.workout.start();
      if(reply.phase!=='active')fail('START_NOT_ACKNOWLEDGED');
      message='Inicio confirmado por el servidor.';
      return;
    }
    if(action==='u60-record'){
      await runtime.workout.record(payload.result);
      await runtime.workout.advance();
      const receipt=await runtime.workout.save();
      if(receipt.hasUncertain||receipt.unsavedWork)fail('RECOVERY_REQUIRED');
      message='Serie registrada, siguiente paso y progreso confirmados.';
      return;
    }
    if(action==='u60-skip'){
      if(!payload.reason||payload.reason.length<3)fail('SKIP_REASON_REQUIRED');
      await runtime.workout.skip(payload.reason);
      const receipt=await runtime.workout.save();
      if(receipt.hasUncertain||receipt.unsavedWork)fail('RECOVERY_REQUIRED');
      message='Omisión con motivo guardada y confirmada.';
      return;
    }
    if(action==='u60-save'){
      const receipt=await runtime.workout.save();
      if(receipt.hasUncertain||receipt.unsavedWork)fail('RECOVERY_REQUIRED');
      message='Progreso confirmado en servidor.';
      return;
    }
    if(action==='u60-retry-complete'){
      if(runtime.workout.view().executionStatus!=='completed')
        fail('FEEDBACK_NOT_SAVED');
      const reply=await runtime.workout.complete();
      if(reply.phase!=='completed'||reply.hasUncertain)
        fail('COMPLETION_NOT_CONFIRMED');
      message='Entrenamiento de esta fecha finalizado y confirmado.';
      return;
    }
    if(action==='u60-complete'){
      await runtime.workout.finish(payload.feedback);
      const receipt=await runtime.workout.complete();
      if(receipt.phase!=='completed'||receipt.hasUncertain)
        fail('COMPLETION_NOT_CONFIRMED');
      message='Entrenamiento de esta fecha finalizado y confirmado.';
      return;
    }
    if(action==='u60-reconcile'){
      await runtime.workout.reconcile();
      message='Operación original reconciliada y estado verificado.';
      return;
    }
    if(action==='u60-reopen'){
      await runtime.openWorkout(focus);
      message='Lectura privada actualizada.';
      return;
    }
    fail('UNKNOWN_ACTION');
  }
  async function onClick(event){
    const planButton=event?.target?.closest?.('[data-u60-copy-plan]');
    if(planButton?.hasAttribute?.('data-u60-copy-plan')&&
      root.contains(planButton)&&!disposed&&!busy&&!planButton.disabled){
      event.preventDefault?.();
      event.stopPropagation?.();
      const scope=visibleOwner();
      if(scope?.role!=='coach'||focus?.clientId!==scope.clientId||
        focus.role!==scope.role)return;
      const view=workoutView();
      if(view?.phase!=='active'||view.executionStatus!=='active')return;
      const values=plannedDatedSetDraft(view.currentStep);
      const panel=planButton.closest?.('[data-u60-panel]');
      for(const [key,name] of [['reps','u60Reps'],['load','u60Load']]){
        if(values[key]===undefined)continue;
        const input=panel?.querySelector?.('[name="'+name+'"]');
        if(input&&String(input.value||'').trim()==='')input.value=values[key];
      }
      return; // no automatic save, sync, RPE or DOM rebuild
    }
    // A manual, local Coach shortcut. It never sends a command, records an
    // observation autonomously, or rebuilds the active input surface.
    const quick=event?.target?.closest?.('[data-u60-quick-rpe]');
    const chosen=Number(quick?.getAttribute?.('data-u60-quick-rpe'));
    // A non-shortcut element (including a delegated action with a generic
    // closest() test shim) must still reach the original action handler.
    if(quick&&[6,7,8,9,10].includes(chosen)&&
      root.contains(quick)&&!disposed&&!busy&&!quick.disabled){
      event.preventDefault?.();
      event.stopPropagation?.();
      const panel=quick.closest?.('[data-u60-panel]');
      const input=panel?.querySelector?.('[name="u60Rpe"]');
      if(!input)return;
      input.value=String(chosen);
      for(const button of panel.querySelectorAll?.('[data-u60-quick-rpe]')||[])
        button.setAttribute?.('aria-pressed',button===quick?'true':'false');
      return;
    }
    const button=event?.target?.closest?.('[data-iberdates-action]');
    if(!button||!root.contains(button)||disposed)return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if(busy||button.disabled)return;
    const action=button.getAttribute('data-iberdates-action');
    let payload={phrase:''};
    busy=true;failure='';
    try{
      // Validate/capture BEFORE rebuilding the DOM, including sport-specific
      // units, recovery secret and closeout. Even invalid input must be caught.
      payload={id:button.dataset?.u60Id,
        phrase:action==='u60-unlock'?formValue(button,'u60Phrase'):'',
        result:action==='u60-record'?readResult(button):null,
        reason:action==='u60-skip'?formValue(button,'u60SkipReason'):'',
        feedback:action==='u60-complete'?{
          sessionRpe:formValue(button,'u60FinalRpe'),
          comment:formValue(button,'u60FinalComment'),
          pain:button.closest('[data-u60-panel]')?.querySelector('[name="u60Pain"]')?.checked===true,
          painNotes:formValue(button,'u60PainNotes'),
        }:null,
      };
      // Keep the detached form reference alive for preview, but clear the
      // password field before any asynchronous authorization/crypto step.
      if(action==='u60-unlock'){
        const field=button.closest('[data-u60-panel]')?.querySelector('[name="u60Phrase"]');
        if(field)field.value='';
      }
      repaint();
      await perform(action,button,payload);
    }catch(error){failure=humanError(error);}
    finally{payload.phrase='';busy=false;repaint();}
  }
  function tick(){
    // No global DOM lookup while the operator is outside dated execution.
    if(!focus)return;
    const node=root.querySelector?.('[data-u60-clock-start]');
    const started=Date.parse(String(node?.getAttribute?.('data-u60-clock-start')||''));
    if(node&&Number.isFinite(started)){
      const time=formatDatedElapsed(Date.now()-started);
      if(node.textContent!==time)node.textContent=time;
    }
  }
  function mount(){
    if(disposed)fail('DESTROYED');
    if(mounted)return;
    // Establish the visible role/client before any delegated form validation
    // so first-action errors are not lost to a later scope initialization.
    visibleOwner();
    mounted=true;root.addEventListener('click',onClick);
    // One lightweight text-only tick while QA is authenticated. The timer is
    // derived from the SERVER ACK's startedAt, not a speculative click.
    ticker=globalThis.setInterval?.(tick,1000)??null;
  }
  function destroy(){
    if(disposed)return;
    disposed=true;generation++;mounted=false;
    if(ticker!==null)globalThis.clearInterval?.(ticker);
    ticker=null;
    root.removeEventListener('click',onClick);
    vault.destroy();persistence.close();
    rows=[];preview=null;focus=null;
  }
  return Object.freeze({enabled:true,mount,destroy,renderPanel,hasBlockingWorkout,verifySessionRetirement});
}
