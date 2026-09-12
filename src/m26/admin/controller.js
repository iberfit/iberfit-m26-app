import {createClientCreateWizard} from './client-create-wizard.js';
const toast=(message)=>{try{globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}catch{}};
const text=(data,key,max=4000)=>String(data.get(key)||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
const rev=(data)=>{const n=Number(data.get('baseRevision')||0);return Number.isInteger(n)&&n>=0?n:0;};
function json(value){const raw=String(value||'').trim();if(!raw)return {};const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('M26_ADMIN_CONFIGURATION_JSON_INVALID');return parsed;}
function normalizeUserFilter(value){
  return String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase();
}
function adminOperationLockKey(kind,data){
  const value=(key,max=200)=>text(data,key,max);
  if(kind==='user-status'||kind==='role-change'||kind==='user-delete')return `user:${value('userId')||'unknown'}`;
  if(kind==='assignment-end')return `assignment:${value('assignmentId')||'unknown'}`;
  if(kind==='lead-update')return `lead:${value('leadId')||'unknown'}`;
  if(kind==='client-lifecycle'||kind==='client-delete')return `client:${value('clientId')||'unknown'}`;
  if(kind==='task-resolve')return `task:${value('taskId')||'unknown'}`;
  if(kind==='settings-save')return `organization:${value('organizationId')||'current'}`;
  if(kind==='template-save')return `template:${value('key',80)||'unknown'}`;
  if(kind==='automation-save')return `automation:${value('key',80)||'unknown'}`;
  return `${String(kind||'operation')}:new`;
}
function userDirectoryFilterState(root){
  const directory=root.querySelector?.('[data-admin-user-directory]');
  return Object.freeze({
    query:String(directory?.querySelector?.('[data-admin-user-search]')?.value||''),
    status:String(directory?.querySelector?.('[data-admin-user-filter="status"]')?.value||''),
    role:String(directory?.querySelector?.('[data-admin-user-filter="role"]')?.value||''),
  });
}
function applyUserDirectoryFilters(root,state=null){
  const directory=root.querySelector?.('[data-admin-user-directory]');
  if(!directory)return 0;
  if(state){
    const search=directory.querySelector?.('[data-admin-user-search]');
    const statusSelect=directory.querySelector?.('[data-admin-user-filter="status"]');
    const roleSelect=directory.querySelector?.('[data-admin-user-filter="role"]');
    if(search)search.value=String(state.query||'');
    if(statusSelect)statusSelect.value=String(state.status||'');
    if(roleSelect)roleSelect.value=String(state.role||'');
  }
  const query=normalizeUserFilter(directory.querySelector?.('[data-admin-user-search]')?.value||'');
  const status=normalizeUserFilter(directory.querySelector?.('[data-admin-user-filter="status"]')?.value||'');
  const role=normalizeUserFilter(directory.querySelector?.('[data-admin-user-filter="role"]')?.value||'');
  const cards=[...(directory.querySelectorAll?.('[data-admin-user-card]')||[])];
  let visible=0;
  for(const card of cards){
    const haystack=normalizeUserFilter(card.getAttribute?.('data-user-search')||'');
    const cardStatus=normalizeUserFilter(card.getAttribute?.('data-user-status')||'');
    const cardRoles=String(card.getAttribute?.('data-user-roles')||'').toLowerCase();
    const matches=(!query||haystack.includes(query))&&(!status||cardStatus===status)&&(!role||cardRoles.includes(`|${role}|`));
    card.hidden=!matches;
    if(matches)visible+=1;
  }
  const count=directory.querySelector?.('[data-admin-user-visible-count]');
  if(count)count.textContent=String(visible);
  const emptyState=directory.querySelector?.('[data-admin-user-no-results]');
  if(emptyState)emptyState.hidden=visible!==0;
  return visible;
}

function invitationSuccess(result={}){const invitation=result?.response?.invitation||result?.invitation||{};const delivery=String(invitation.deliveryStatus||'').toLowerCase();if(delivery==='sent')return 'Cliente creado. Invitación enviada correctamente.';if(delivery==='error')return 'Cliente creado, pero la invitación no pudo enviarse. Queda pendiente para reintento.';if(delivery==='pending')return 'Cliente creado. Invitación en proceso.';return 'Cliente creado y acceso preparado.';}
function adminError(error){const value=String(error?.message||error||'');if(/ONLINE_REQUIRED/.test(value))return 'Esta operación administrativa requiere conexión.';if(/IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED/.test(value))return 'Confirma tu identidad con la verificación segura de IBERFIT antes de continuar.';if(/ADMIN_USER_DELETE_SELF_FORBIDDEN|USER_DELETE_SELF_FORBIDDEN/.test(value))return 'No puedes eliminar la cuenta con la que estás administrando IBERFIT.';if(/ADMIN_USER_DELETE_LAST_ADMIN_PROTECTED|LAST_ADMIN_PROTECTED/.test(value))return 'IBERFIT protege al último Admin activo. Autoriza otro Admin antes de eliminar esta cuenta.';if(/ADMIN_USER_DELETE_CONFIRMATION_INVALID|USER_DECOMMISSION_COMMAND_INVALID/.test(value))return 'La confirmación no coincide con la cuenta. Revisa el correo y escribe ELIMINAR.';if(/ADMIN_USER_DELETE_REVISION_CONFLICT/.test(value))return 'La cuenta cambió mientras la estabas revisando. Actualiza la vista y vuelve a intentarlo.';if(/ADMIN_USER_AUTH_SOFT_DELETE|USER_DECOMMISSION_FAILED/.test(value))return 'El acceso ya quedó revocado, pero falta terminar la baja de identidad. Reintenta para completar el cierre seguro.';if(/V26_INVITATION_RATE_LIMITED/.test(value))return 'El cliente se creó, pero el proveedor limitó temporalmente el envío. La invitación queda pendiente.';if(/V26_INVITATION|V26_ADMIN_CLIENT_CREATE/.test(value))return 'No fue posible completar el alta segura del cliente.';if(/IBERFIT_CLIENT_DELETE_PROTECTED_HISTORY/.test(value))return 'Este cliente conserva registros protegidos que IBERFIT no puede eliminar. El expediente permanece intacto.';if(/IBERFIT_CLIENT_DELETE_UNMANAGED_REFERENCE/.test(value))return 'IBERFIT detectó información vinculada que todavía no tiene una política de eliminación segura. No se ha borrado nada.';if(/IBERFIT_CLIENT_DELETE_CONFIRMATION_INVALID/.test(value))return 'La confirmación no coincide con el cliente. Revisa el correo o nombre y escribe ELIMINAR.';if(/IBERFIT_CLIENT_DELETE_NOT_FOUND|V65E_CLIENT_SCOPE/.test(value))return 'El cliente no existe o no pertenece a esta organización.';return 'No fue posible confirmar el cambio.';}
export function createAdminController({root,store,service,render=()=>{}}={}){
  if(!root?.addEventListener||!store?.getState)throw new Error('M26_ADMIN_CONTROLLER_CONTEXT_REQUIRED');
  const pendingLocks=new Set();
  const submitLabels=new WeakMap();
  const clientWizard=createClientCreateWizard({
    root,
    getScopeKey:()=>String(store.getState().admin?.organization?.id||'default'),
  });
  function setFormPending(form,pending){
    if(!form)return;
    const button=form.querySelector?.('button[type="submit"]');
    if(pending){
      form.setAttribute?.('aria-busy','true');
      form.dataset.adminPending='true';
      if(button){
        if(!submitLabels.has(button))submitLabels.set(button,String(button.textContent||'Guardar'));
        button.disabled=true;
        button.textContent='Guardando…';
      }
      return;
    }
    form.removeAttribute?.('aria-busy');
    delete form.dataset.adminPending;
    if(button){
      button.disabled=false;
      const original=submitLabels.get(button);
      if(original)button.textContent=original;
      submitLabels.delete(button);
    }
  }
  function syncPendingUserForms(){
    for(const card of root.querySelectorAll?.('[data-admin-user-card]')||[]){
      const userId=String(card.getAttribute?.('data-user-id')||'').trim();
      const pending=userId&&pendingLocks.has(`user:${userId}`);
      if(pending)card.setAttribute?.('aria-busy','true');
      else card.removeAttribute?.('aria-busy');
      for(const form of card.querySelectorAll?.('[data-admin-form]')||[]){
        setFormPending(form,Boolean(pending));
      }
    }
  }
  async function execute(input,success,{form,lockKey,onSuccess}={}){
    const key=String(lockKey||input?.entityId||input?.type||'operation');
    if(pendingLocks.has(key)){
      toast('Ese registro ya tiene un cambio en curso.');
      return false;
    }
    pendingLocks.add(key);
    setFormPending(form,true);
    syncPendingUserForms();
    const filters=userDirectoryFilterState(root);
    try{
      const result=await service.execute(input);
      try{onSuccess?.(result);}catch{}
      const successMessage=typeof success==='function'?success(result):success;
      const initialMessage=result?.refreshPending===true
        ?`${successMessage} Actualizando la vista…`
        :result?.refreshOk===false
          ?`${successMessage} El cambio quedó guardado, pero la vista no pudo actualizarse.`
          :successMessage;
      toast(initialMessage);
      if(result?.refreshPending===true&&result?.whenRefreshed?.then){
        void result.whenRefreshed.then((outcome)=>{
          if(outcome?.ok===true){
            applyUserDirectoryFilters(root,filters);
            syncPendingUserForms();
            return;
          }
          toast('El cambio quedó guardado, pero no fue posible actualizar la vista. Reintenta la conexión para refrescar los datos.');
        });
      }else{
        render();
        applyUserDirectoryFilters(root,filters);
        syncPendingUserForms();
        clientWizard.sync();
      }
      return true;
    }catch(error){
      toast(adminError(error));
      return false;
    }finally{
      pendingLocks.delete(key);
      setFormPending(form,false);
      syncPendingUserForms();
    }
  }
  async function onSubmit(event){
    const form=event.target.closest?.('[data-admin-form]');
    if(!form)return false;
    event.preventDefault();
    const kind=form.dataset.adminForm;
    const data=new FormData(form);
    const org=store.getState().admin?.organization?.id;
    const lockKey=adminOperationLockKey(kind,data);
    const run=(input,success,options={})=>execute(input,success,{form,lockKey,...options});
    if(kind==='user-status')return run({type:'ADMIN_USUARIO_CAMBIAR_ESTADO',entityId:text(data,'userId',200),organizationId:org,baseRevision:rev(data),reason:text(data,'reason',500),payload:{userId:text(data,'userId',200),status:text(data,'status',40)}},'Estado actualizado.');
    if(kind==='role-change'){const action=text(data,'action',20);return run({type:action==='revoke'?'ADMIN_ROL_REVOCAR':'ADMIN_ROL_OTORGAR',entityId:text(data,'userId',200),organizationId:org,reason:text(data,'reason',500),payload:{userId:text(data,'userId',200),role:text(data,'role',30)}},action==='revoke'?'Aplicación revocada.':'Aplicación autorizada.');}
    if(kind==='user-delete')return run({type:'ADMIN_USUARIO_ELIMINAR',entityId:text(data,'userId',200),organizationId:org,baseRevision:rev(data),reason:text(data,'reason',500),payload:{userId:text(data,'userId',200),confirmUserId:text(data,'confirmUserId',200),confirmValue:text(data,'confirmValue',254),confirmPhrase:text(data,'confirmPhrase',20),confirmAcknowledged:text(data,'confirmAcknowledged',10)==='yes'}},'Cuenta eliminada de IBERFIT y acceso revocado.');
    if(kind==='assignment-create')return run({type:'ADMIN_ASIGNACION_CREAR',entityId:org,organizationId:org,reason:text(data,'reason',500),payload:{coachUserId:text(data,'coachUserId',200),clientId:text(data,'clientId',200),startsAt:text(data,'startsAt',40)}},'Asignación creada.');
    if(kind==='assignment-end')return run({type:'ADMIN_ASIGNACION_FINALIZAR',entityId:text(data,'assignmentId',200),organizationId:org,baseRevision:rev(data),reason:text(data,'reason',500),payload:{assignmentId:text(data,'assignmentId',200)}},'Asignación finalizada.');
    if(kind==='lead-create')return run({type:'ADMIN_LEAD_CREAR',entityId:org,organizationId:org,payload:{name:text(data,'name',200),email:text(data,'email',254),phone:text(data,'phone',80),source:text(data,'source',120),objective:text(data,'objective',1000)}},'Lead registrado.');
    if(kind==='lead-update')return run({type:'ADMIN_LEAD_ACTUALIZAR',entityId:text(data,'leadId',200),organizationId:org,baseRevision:rev(data),reason:text(data,'reason',500),payload:{leadId:text(data,'leadId',200),status:text(data,'status',40),nextActionAt:text(data,'nextActionAt',80)}},'Lead actualizado.');
    if(kind==='client-create'){
      if(!clientWizard.validateForSubmit(form))return false;
      const weeklyFrequency=text(data,'weeklyFrequency',20);
      const frequency=text(data,'frequency',100)||(weeklyFrequency?`${weeklyFrequency} sesiones por semana`:'');
      const profile={
        initialAssessmentMode:text(data,'initialAssessmentMode',30)||'iri',
        birthDate:text(data,'birthDate',20),
        sexForNorms:text(data,'sexForNorms',20),
        email:text(data,'email',254),
        phone:text(data,'phone',80),
        preferredContactChannel:text(data,'preferredContactChannel',80),
        preferredContactTime:text(data,'preferredContactTime',120),
        timezone:'America/Santiago',
        modality:text(data,'modality',40),
        weeklyFrequency:Number(weeklyFrequency)||null,
        sessionDurationMinutes:Number(text(data,'sessionDurationMinutes',20))||null,
        preferredSchedule:text(data,'preferredSchedule',240),
        commune:text(data,'zone',120),
        trainingAddress:text(data,'address',300),
        locationType:text(data,'locationType',80),
        accessInstructions:text(data,'accessInstructions',500),
        primaryObjective:text(data,'objective',1000),
        secondaryObjectives:text(data,'secondaryObjectives',1000),
        experienceLevel:text(data,'level',100),
        trainingHistory:text(data,'history',1500),
        currentTraining:text(data,'currentTraining',1000),
        restrictions:text(data,'restrictions',1000),
        pain:text(data,'pain',1000),
        equipment:text(data,'equipment',1200),
        preferences:text(data,'preferences',1200),
        emergencyContactName:text(data,'emergencyContactName',160),
        emergencyContactRelation:text(data,'emergencyContactRelation',120),
        emergencyContactPhone:text(data,'emergencyContactPhone',80),
      };
      return run({
        type:'ADMIN_CLIENTE_CREAR',
        entityId:org,
        organizationId:org,
        payload:{
          name:text(data,'name',200),
          email:text(data,'email',254),
          phone:text(data,'phone',80),
          birthDate:profile.birthDate,
          sexForNorms:profile.sexForNorms,
          initialAssessmentMode:profile.initialAssessmentMode,
          modality:profile.modality,
          weeklyFrequency:profile.weeklyFrequency,
          sessionDurationMinutes:profile.sessionDurationMinutes,
          preferredSchedule:profile.preferredSchedule,
          objective:profile.primaryObjective,
          primaryObjective:profile.primaryObjective,
          secondaryObjectives:profile.secondaryObjectives,
          frequency,
          zone:profile.commune,
          commune:profile.commune,
          address:profile.trainingAddress,
          trainingAddress:profile.trainingAddress,
          locationType:profile.locationType,
          accessInstructions:profile.accessInstructions,
          preferredContactChannel:profile.preferredContactChannel,
          preferredContactTime:profile.preferredContactTime,
          level:profile.experienceLevel,
          history:profile.trainingHistory,
          currentTraining:profile.currentTraining,
          restrictions:profile.restrictions,
          pain:profile.pain,
          equipment:profile.equipment,
          preferences:profile.preferences,
          emergencyContactName:profile.emergencyContactName,
          emergencyContactRelation:profile.emergencyContactRelation,
          emergencyContactPhone:profile.emergencyContactPhone,
          profile,
        },
      },invitationSuccess,{onSuccess:()=>clientWizard.clear()});
    }
    if(kind==='client-lifecycle')return run({type:'ADMIN_CLIENTE_CAMBIAR_CICLO',entityId:text(data,'clientId',200),organizationId:org,reason:text(data,'reason',500),payload:{clientId:text(data,'clientId',200),status:text(data,'status',40)}},'Ciclo actualizado.');
    if(kind==='client-delete'){
      const clientId=text(data,'clientId',200);
      const confirmValue=text(data,'confirmValue',254);
      const confirmPhrase=text(data,'confirmPhrase',20).toUpperCase();
      const reason=text(data,'reason',500);
      if(text(data,'confirmAcknowledged',20)!=='yes'||confirmPhrase!=='ELIMINAR'||reason.length<8){toast('Completa la confirmación de eliminación y explica el motivo antes de continuar.');return false;}
      return run({type:'ADMIN_CLIENTE_ELIMINAR',entityId:clientId,organizationId:org,reason,payload:{clientId,confirmClientId:clientId,confirmValue,confirmPhrase}},'Cliente eliminado de forma permanente.');
    }
    if(kind==='task-create')return run({type:'ADMIN_TAREA_CREAR',entityId:org,organizationId:org,payload:{priority:text(data,'priority',30),taskType:text(data,'taskType',80),title:text(data,'title',200),detail:text(data,'detail',2000)}},'Tarea creada.');
    if(kind==='task-resolve')return run({type:'ADMIN_TAREA_RESOLVER',entityId:text(data,'taskId',200),organizationId:org,baseRevision:rev(data),reason:text(data,'reason',500),payload:{taskId:text(data,'taskId',200)}},'Tarea resuelta.');
    if(kind==='template-save'){const key=text(data,'key',80);return run({type:'ADMIN_PLANTILLA_GUARDAR',entityId:key,organizationId:org,payload:{key,name:text(data,'name',160),channel:text(data,'channel',30),subject:text(data,'subject',200),body:text(data,'body',4000)}},'Plantilla guardada.');}
    if(kind==='automation-save'){const key=text(data,'key',80);return run({type:'ADMIN_AUTOMATIZACION_GUARDAR',entityId:key,organizationId:org,payload:{key,name:text(data,'name',160),triggerType:text(data,'triggerType',80),actionType:text(data,'actionType',80),status:text(data,'status',30),configuration:json(data.get('configuration'))}},'Automatización guardada.');}
    if(kind==='settings-save')return run({type:'ADMIN_ORGANIZACION_ACTUALIZAR',entityId:text(data,'organizationId',200)||org,organizationId:org,baseRevision:rev(data),reason:text(data,'reason',500),payload:{name:text(data,'name',200),timezone:text(data,'timezone',100),locale:text(data,'locale',30)}},'Configuración actualizada.');
    return false;
  }
  function onSubmitEvent(event){
    void onSubmit(event).catch((error)=>toast(/ADMIN_CONFIGURATION_JSON_INVALID/.test(String(error?.message||error))?'La configuración JSON no es válida.':'No fue posible procesar la operación administrativa.'));
  }
  function onDirectoryFilter(event){
    if(!event.target?.closest?.('[data-admin-user-search],[data-admin-user-filter]'))return;
    applyUserDirectoryFilters(root);
  }
  return Object.freeze({
    mount(){
      root.addEventListener('submit',onSubmitEvent);
      root.addEventListener('input',onDirectoryFilter);
      root.addEventListener('change',onDirectoryFilter);
      clientWizard.mount();
      applyUserDirectoryFilters(root);
    },
    destroy(){
      clientWizard.destroy();
      root.removeEventListener('submit',onSubmitEvent);
      root.removeEventListener('input',onDirectoryFilter);
      root.removeEventListener('change',onDirectoryFilter);
    },
  });
}

export const __adminControllerInternals=Object.freeze({
  normalizeUserFilter,
  adminOperationLockKey,
  userDirectoryFilterState,
  applyUserDirectoryFilters,
});
