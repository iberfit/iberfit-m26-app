import {
  parseWearableExportTextAsync,
  summarizeWearableData,
} from './normalization.js';
import {
  wearableProviderDefinition,
  normalizeWearableProvider,
} from './contracts.js';
import {
  wearableZeroCostPolicy,
} from './free-policy.js';
import {
  createWearableBridgeService,
} from './bridge-service.js';
import {
  createWearableRemoteSync,
} from './remote-sync.js';
import {
  createLatestTaskCoordinator,
} from '../platform/latest-task.js';
import {
  HEALTH_CONNECT_HISTORICAL_CAPABILITIES,
  createHealthConnectHistoricalPlan,
  healthConnectHistoricalMetricKeys,
} from './historical-acquisition.js';

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function setStatus(root,message,kind='info'){
  const node=root.querySelector?.('[data-wearable-status]');
  if(!node)return;
  node.textContent=message;
  node.dataset.status=kind;
}

function emitDiagnostic(stage,error){
  const raw=String(error?.message||error||'');
  const code=raw.match(/\bM26_[A-Z0-9_:-]{2,120}\b/u)?.[0]
    ||`M26_${String(stage||'wearable')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/gu,'_')
      .replace(/^_+|_+$/gu,'')
      .slice(0,70)}_FAILED`;

  try{
    console.error(`[IBERFIT:${stage}] ${code}`);
  }catch{}

  try{
    globalThis.dispatchEvent?.(
      new CustomEvent(
        'm26:diagnostic',
        {
          detail:Object.freeze({
            stage,
            code,
            status:Number.isInteger(error?.status)
              ?error.status
              :null,
          }),
        },
      ),
    );
  }catch{}

  return code;
}

function context(store){
  const state=store.getState();
  const role=String(state.identity?.role||'').toLowerCase();

  return {
    role,
    clientId:role==='client'
      ?state.identity?.clientId
      :state.selectedClientId,
  };
}

function metric(label,value,unit=''){
  return `<div class="m26-field"><span>${escapeHtml(label)}</span><strong>${value===null||value===undefined?'Sin dato':`${escapeHtml(value)}${unit?` ${escapeHtml(unit)}`:''}`}</strong></div>`;
}

function compactMetric(value,unit=''){
  return value===null||value===undefined
    ?null
    :`${value}${unit}`;
}

function wearableContextText(preview){
  if(!preview?.summary)return '';

  const {
    summary,
    providerLabel,
  }=preview;

  const values=[
    [
      'pasos medios',
      compactMetric(summary.metrics.steps),
    ],
    [
      'actividad',
      compactMetric(
        summary.metrics.activeMinutes,
        ' min/día',
      ),
    ],
    [
      'sueño',
      compactMetric(
        summary.metrics.sleepMinutes,
        ' min/día',
      ),
    ],
    [
      'FC reposo',
      compactMetric(
        summary.metrics.restingHeartRate,
        ' lpm',
      ),
    ],
    [
      summary.vfc?.method?`VFC (${summary.vfc.method.toUpperCase()})`:'VFC',
      compactMetric(
        summary.vfc?.valueMs??summary.metrics.hrvMs,
        ' ms',
      ),
    ],
    [
      'entrenamiento',
      compactMetric(
        summary.metrics.workoutMinutes,
        ' min/día',
      ),
    ],
  ]
    .filter(([,value])=>value!==null)
    .map(([label,value])=>`${label}: ${value}`);

  const reviewState=preview.synchronized===true
    ?'confirmado'
    :'revisado localmente';

  const syncNotice=preview.synchronized===true
    ?''
    :' Datos no sincronizados.';

  return `Contexto de dispositivos ${reviewState} (${providerLabel}, ${summary.daysWithData} día${summary.daysWithData===1?'':'s'}): ${values.length?values.join(' · '):'sin métricas válidas'}.${syncNotice}`;
}

function renderPreview(root,parsed,provider){
  const summary=summarizeWearableData(
    parsed.accepted,
    {days:7},
  );

  const node=root.querySelector?.(
    '[data-wearable-preview]',
  );

  if(!node)return null;

  const providerLabel=
    wearableProviderDefinition(provider)?.label
    ||'Archivo';

  node.innerHTML=`
    <div class="m26-panel-heading">
      <div>
        <p class="m26-eyebrow">Vista previa protegida</p>
        <h3 tabindex="-1" data-wearable-preview-title>
          ${escapeHtml(providerLabel)} ·
          ${summary.daysWithData}
          día${summary.daysWithData===1?'':'s'}
        </h3>
      </div>
      <span class="m26-badge is-neutral">
        ${parsed.accepted.length} aceptados ·
        ${parsed.rejected.length} omitidos
      </span>
    </div>

    <div class="m26-field-grid">
      ${metric('Pasos medios',summary.metrics.steps)}
      ${metric(
        'Minutos activos',
        summary.metrics.activeMinutes,
        'min',
      )}
      ${metric(
        'Sueño medio',
        summary.metrics.sleepMinutes,
        'min',
      )}
      ${metric(
        'FC reposo media',
        summary.metrics.restingHeartRate,
        'lpm',
      )}
      ${metric(
        summary.vfc?.method?`VFC media (${summary.vfc.method.toUpperCase()})`:'VFC · Variabilidad de la frecuencia cardíaca',
        summary.vfc?.valueMs??summary.metrics.hrvMs,
        'ms',
      )}
      ${metric(
        'Entrenamiento',
        summary.metrics.workoutMinutes,
        'min',
      )}
    </div>

    <p class="m26-notice">
      Revisa el resumen antes de incorporarlo.
      El archivo original no se almacena.
    </p>

    <div class="m26-action-grid m26-wearable-preview-actions">
      <button
        type="button"
        class="m26-primary-action"
        data-wearable-action="confirm-import"
      >
        Confirmar e incorporar
      </button>

      <button
        type="button"
        data-wearable-action="use-in-checkin"
      >
        Añadir al bienestar
      </button>

      <button
        type="button"
        data-wearable-action="download-summary"
      >
        Descargar resumen
      </button>

      <button
        type="button"
        data-wearable-action="clear-preview"
      >
        Descartar
      </button>
    </div>
  `;

  node.hidden=false;

  node
    .querySelector?.('[data-wearable-preview-title]')
    ?.focus?.({preventScroll:false});

  return {
    provider,
    providerLabel,
    summary,
    records:parsed.accepted.map((record)=>
      structuredClone(record)
    ),
    acceptedCount:parsed.accepted.length,
    rejectedCount:parsed.rejected.length,
    generatedAt:new Date().toISOString(),
    synchronized:false,
  };
}

function downloadJson(data,fileName){
  const blob=new Blob(
    [JSON.stringify(data,null,2)],
    {type:'application/json'},
  );

  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');

  link.href=url;
  link.download=fileName;
  link.rel='noopener';
  link.click();

  setTimeout(
    ()=>URL.revokeObjectURL(url),
    0,
  );
}

function downloadTemplate(){
  const rows=[
    {
      date:new Date().toISOString().slice(0,10),
      steps:7500,
      activeMinutes:42,
      sleepMinutes:450,
      restingHeartRate:58,
      hrvMs:48,
      vfcMethod:'rmssd',
      activeEnergyKcal:520,
      workoutMinutes:35,
      quality:'media',
    },
  ];

  downloadJson(
    {records:rows},
    'iberfit-plantilla-dispositivos.json',
  );
}

function setFormBusy(form,busy){
  form?.setAttribute?.(
    'aria-busy',
    String(Boolean(busy)),
  );

  for(
    const control of
    form?.querySelectorAll?.(
      'button,input,select',
    )||[]
  ){
    control.disabled=Boolean(busy);
  }
}

function friendlyError(code){
  if(/SUPERSEDED|ABORTED/.test(code)){
    return 'La revisión anterior se canceló sin guardar datos.';
  }

  if(/TOO_LARGE/.test(code)){
    return 'El archivo supera el límite de 5 MB.';
  }

  if(/TOO_MANY_ROWS/.test(code)){
    return 'El archivo supera el límite de 10.000 registros.';
  }

  if(/REQUIRED/.test(code)){
    return 'Selecciona un archivo normalizado JSON o CSV.';
  }

  if(/NATIVE_BRIDGE|HEALTH_CONNECT/.test(code)){
    return 'Health Connect estará disponible desde la aplicación Android IBERFIT.';
  }

  return 'No fue posible completar la operación wearable.';
}

function supersededError(error){
  const next=error instanceof Error
    ?error
    :new Error(
      String(
        error
        ||'M26_WEARABLE_IMPORT_SUPERSEDED',
      ),
    );

  next.m26Silent=true;
  return next;
}

export function createWearableController({
  root,
  store,
  transport,
  getToken,
  refreshState=async()=>{},
  isOnline=()=>globalThis.navigator?.onLine!==false,
}={}){
  if(
    !root?.addEventListener
    ||!store?.getState
    ||!transport
    ||typeof getToken!=='function'
  ){
    throw new Error(
      'M26_WEARABLE_CONTROLLER_REQUIRED',
    );
  }

  let mounted=false;
  let currentPreview=null;
  let observer=null;

  const tasks=createLatestTaskCoordinator();

  const remoteSync=createWearableRemoteSync({
    transport,
    getToken,
    refreshState,
    isOnline,
  });

  const bridge=createWearableBridgeService({
    scope:globalThis,
  });

  async function analyze(form){
    const {
      role,
      clientId,
    }=context(store);

    if(role!=='client'||!clientId){
      throw new Error(
        'M26_WEARABLE_CLIENT_CONTROL_REQUIRED',
      );
    }

    const file=form.elements
      ?.namedItem?.('wearableFile')
      ?.files?.[0];

    if(!file){
      throw new Error(
        'M26_WEARABLE_FILE_REQUIRED',
      );
    }

    const provider=String(
      form.elements
        ?.namedItem?.('wearableProvider')
        ?.value
      ||'normalized_file',
    );

    const policy=wearableZeroCostPolicy(provider);

    if(provider!=='normalized_file'&&!policy){
      throw new Error(
        'M26_WEARABLE_PROVIDER_UNKNOWN',
      );
    }

    const task=tasks.begin();

    setFormBusy(form,true);

    setStatus(
      root,
      'Analizando el archivo en este dispositivo…',
      'pending',
    );

    try{
      const text=await file.text();

      if(!task.isCurrent()){
        throw supersededError(
          new Error(
            'M26_WEARABLE_IMPORT_SUPERSEDED',
          ),
        );
      }

      const parsed=
        await parseWearableExportTextAsync(
          text,
          {
            fileName:file.name,
            clientId,
            provider,
            signal:task.signal,
          },
        );

      if(!task.isCurrent()){
        throw supersededError(
          new Error(
            'M26_WEARABLE_IMPORT_SUPERSEDED',
          ),
        );
      }

      currentPreview=renderPreview(
        root,
        parsed,
        provider,
      );

      setStatus(
        root,
        parsed.accepted.length
          ?'Vista previa preparada. Confirma antes de incorporarla.'
          :'No se encontraron registros válidos.',
        parsed.accepted.length
          ?'success'
          :'info',
      );

      return parsed;
    }catch(error){
      if(
        !task.isCurrent()
        ||task.signal.aborted
      ){
        throw supersededError(error);
      }

      throw error;
    }finally{
      if(task.isCurrent()){
        setFormBusy(form,false);
        task.finish();
      }
    }
  }

  async function confirmImport(){
    const {
      role,
      clientId,
    }=context(store);

    if(
      role!=='client'
      ||!clientId
      ||!currentPreview?.records?.length
    ){
      throw new Error(
        'M26_WEARABLE_PREVIEW_REQUIRED',
      );
    }

    setStatus(
      root,
      'Protegiendo y sincronizando el resumen…',
      'pending',
    );

    const result=await remoteSync.stage({
      clientId,
      provider:currentPreview.provider,
      records:currentPreview.records,
    });

    currentPreview.synchronized=
      result.synced===true;

    const button=root.querySelector?.(
      '[data-wearable-action="confirm-import"]',
    );

    if(button){
      button.disabled=true;
      button.textContent=result.synced
        ?'Incorporado'
        :'Guardado para sincronizar';
    }

    setStatus(
      root,
      result.synced
        ?'Datos incorporados y verificados en tu expediente.'
        :'Guardado en este dispositivo · pendiente de sincronización.',
      'success',
    );

    return result;
  }

  async function syncPending(){
    setStatus(
      root,
      'Sincronizando datos pendientes…',
      'pending',
    );

    const result=await remoteSync.flush();

    setStatus(
      root,
      result.pending
        ?`${result.pending} registro${result.pending===1?'':'s'} pendiente${result.pending===1?'':'s'}.`
        :'Sincronización completada.',
      result.pending
        ?'pending'
        :'success',
    );

    return result;
  }

  async function connectNativeProvider(
    provider,
    {
      interactive=true,
      silent=false,
      metrics=null,
      startDate=null,
      endDate=null,
    }={}
  ){
    const {role,clientId}=context(store);
    if(role!=='client'||!clientId){
      throw new Error('M26_WEARABLE_CLIENT_CONTROL_REQUIRED');
    }

    const normalized=normalizeWearableProvider(provider);
    if(!normalized||!bridge.nativeProviders.includes(normalized)){
      throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
    }

    if(!bridge.isAvailable(normalized)){
      throw new Error(
        bridge.providerSupport(normalized).reason
        ||'M26_WEARABLE_NATIVE_BRIDGE_UNAVAILABLE'
      );
    }

    const requestedMetrics=
      Array.isArray(metrics)&&metrics.length
        ?[...new Set(metrics.filter((item)=>bridge.readScopes.includes(item)))]
        :normalized==='health_connect'
          ?[...healthConnectHistoricalMetricKeys()]
          :[...bridge.readScopes];

    if(!requestedMetrics.length){
      throw new Error('M26_WEARABLE_SCOPE_REQUIRED');
    }

    const existing=(
      store.getState().collections?.wearableConnections||[]
    ).find(
      (item)=>
        normalizeWearableProvider(item.provider||item.source)===normalized
    );

    let granted=Array.isArray(existing?.scopes)
      ?existing.scopes.filter((item)=>requestedMetrics.includes(item))
      :[];

    if(interactive||!granted.length){
      if(!silent){
        setStatus(
          root,
          'Solicitando únicamente los permisos seleccionados…',
          'pending',
        );
      }

      const authorization=await bridge.requestAuthorization({
        provider:normalized,
        clientId,
        scopes:requestedMetrics,
      });

      granted=authorization.granted;
      if(!granted.length){
        throw new Error('M26_WEARABLE_SCOPE_REQUIRED');
      }
    }

    const readable=requestedMetrics.filter((item)=>granted.includes(item));
    if(!readable.length){
      throw new Error('M26_WEARABLE_SCOPE_REQUIRED');
    }

    await bridge.setSyncEnabled({
      provider:normalized,
      clientId,
      enabled:true,
    });

    const resolvedEndDate=endDate||new Date().toISOString().slice(0,10);
    let resolvedStartDate=startDate;

    if(!resolvedStartDate){
      const start=new Date(`${resolvedEndDate}T00:00:00Z`);
      start.setUTCDate(start.getUTCDate()-29);
      resolvedStartDate=start.toISOString().slice(0,10);
    }

    const records=await bridge.readDailySummaries({
      provider:normalized,
      clientId,
      startDate:resolvedStartDate,
      endDate:resolvedEndDate,
      metrics:readable,
    });

    let result=Object.freeze({
      ok:true,
      queued:false,
      synced:true,
      imported:0,
      pending:0,
    });

    if(records.length){
      result=await remoteSync.stage({
        clientId,
        provider:normalized,
        records,
      });
    }

    if(!silent){
      const label=
        wearableProviderDefinition(normalized)?.label
        ||'Dispositivo';

      setStatus(
        root,
        records.length
          ?(
              result.synced
                ?`${label} sincronizado con ${readable.length} permiso${readable.length===1?'':'s'} de lectura.`
                :'Datos protegidos y pendientes de sincronización.'
            )
          :`${label} conectado. No hay resúmenes disponibles en el periodo seleccionado.`,
        'success',
      );
    }

    return Object.freeze({
      ...result,
      provider:normalized,
      connected:true,
      recordCount:records.length,
      requestedMetrics:Object.freeze([...requestedMetrics]),
      grantedMetrics:Object.freeze([...readable]),
      startDate:resolvedStartDate,
      endDate:resolvedEndDate,
    });
  }
  async function autoSyncNativeProviders(){
    const {role}=context(store);if(role!=='client'||!isOnline())return [];
    const rows=store.getState().collections?.wearableConnections||[];
    const providers=[...new Set(rows.filter((item)=>['active','connected','conectado'].includes(String(item.status||item.state||'').toLowerCase())).map((item)=>normalizeWearableProvider(item.provider||item.source)).filter((provider)=>provider&&bridge.nativeProviders.includes(provider)&&bridge.isAvailable(provider)))];
    const results=[];
    for(const provider of providers){try{results.push(await connectNativeProvider(provider,{interactive:false,silent:true}));}catch(error){emitDiagnostic('wearable-auto-sync',error);}}
    return results;
  }

  async function connectHealthConnect({capabilities=null}={}){
    if(!bridge.support.healthConnect.available){
      throw new Error('M26_WEARABLE_NATIVE_BRIDGE_UNAVAILABLE');
    }

    const plan=createHealthConnectHistoricalPlan({
      capabilities:
        Array.isArray(capabilities)&&capabilities.length
          ?capabilities
          :undefined,
      days:30,
    });

    return connectNativeProvider(
      'health_connect',
      {
        metrics:plan.metrics,
        startDate:plan.startDate,
        endDate:plan.endDate,
      },
    );
  }

  async function deleteAll(){
    const accepted=globalThis.confirm?.(
      'Se eliminarán de IBERFIT todos tus resúmenes y conexiones de dispositivos. Esta acción no elimina datos del dispositivo de origen.',
    );

    if(!accepted)return false;

    setStatus(
      root,
      'Eliminando tus datos de dispositivos…',
      'pending',
    );

    await remoteSync.deleteAll();
    clearPreview(false);

    setStatus(
      root,
      'Datos y conexiones wearable eliminados de IBERFIT.',
      'success',
    );

    return true;
  }

  async function onSubmit(event){
    const form=event.target.closest?.(
      '[data-wearable-import]',
    );

    if(!form)return;

    event.preventDefault?.();

    try{
      await analyze(form);
    }catch(error){
      if(error?.m26Silent)return;

      const code=emitDiagnostic(
        'wearable-import',
        error,
      );

      setStatus(
        root,
        `${friendlyError(code)} Código: ${code}.`,
        'error',
      );
    }
  }

  function clearPreview(showStatus=true){
    tasks.cancel();
    currentPreview=null;

    const node=root.querySelector?.(
      '[data-wearable-preview]',
    );

    if(node){
      node.innerHTML='';
      node.hidden=true;
    }

    const form=root.querySelector?.(
      '[data-wearable-import]',
    );

    form?.reset?.();
    setFormBusy(form,false);

    if(showStatus){
      setStatus(
        root,
        'Vista previa eliminada.',
        'success',
      );
    }
  }

  function useInCheckin(){
    if(!currentPreview){
      throw new Error(
        'M26_WEARABLE_PREVIEW_REQUIRED',
      );
    }

    const notes=root.querySelector?.(
      '[data-engagement-form="checkin"] textarea[name="notes"]',
    );

    if(!notes){
      throw new Error(
        'M26_WEARABLE_CHECKIN_FORM_REQUIRED',
      );
    }

    const text=wearableContextText(
      currentPreview,
    );

    const previous=String(
      notes.value||'',
    ).trim();

    if(!previous.includes(text)){
      notes.value=[
        previous,
        text,
      ]
        .filter(Boolean)
        .join('\n\n')
        .slice(0,1000);
    }

    notes.dispatchEvent?.(
      new Event(
        'input',
        {bubbles:true},
      ),
    );

    notes.focus?.({
      preventScroll:false,
    });

    setStatus(
      root,
      'Resumen añadido al registro de bienestar. Revísalo antes de enviarlo.',
      'success',
    );
  }

  function downloadSummary(){
    if(!currentPreview){
      throw new Error(
        'M26_WEARABLE_PREVIEW_REQUIRED',
      );
    }

    const {
      records,
      ...safePreview
    }=currentPreview;

    downloadJson(
      {
        schema:'iberfit-device-summary-v44',
        ...safePreview,
        notice:'Resumen sin archivo original, nombres, correos ni tokens.',
      },
      `iberfit-resumen-dispositivos-${new Date().toISOString().slice(0,10)}.json`,
    );

    setStatus(
      root,
      'Resumen descargado sin incluir el archivo original.',
      'success',
    );
  }

  function enhanceControls(){
    const {
      role,
    }=context(store);

    if(role!=='client')return;

    const form=root.querySelector?.(
      '[data-wearable-import]',
    );

    const actionGrid=form?.querySelector?.(
      '.m26-action-grid',
    );

    if(
      actionGrid
      &&!actionGrid.querySelector(
        '[data-wearable-action="sync-pending"]',
      )
    ){
      const syncButton=document.createElement(
        'button',
      );

      syncButton.type='button';
      syncButton.dataset.wearableAction=
        'sync-pending';
      syncButton.textContent=
        'Sincronizar pendientes';

      actionGrid.append(syncButton);

      const deleteButton=document.createElement(
        'button',
      );

      deleteButton.type='button';
      deleteButton.className=
        'm26-danger-action';
      deleteButton.dataset.wearableAction=
        'delete-all';
      deleteButton.textContent=
        'Eliminar mis datos';

      actionGrid.append(deleteButton);
    }

    const healthConnectCard=root.querySelector?.(
      '[data-provider="health_connect"]',
    );

    if(
      healthConnectCard
      &&bridge.support.healthConnect.available
      &&!healthConnectCard.querySelector(
        '[data-health-connect-capabilities]',
      )
    ){
      const fieldset=document.createElement('fieldset');
      fieldset.className='m26-health-connect-capabilities';
      fieldset.dataset.healthConnectCapabilities='true';

      const legend=document.createElement('legend');
      legend.textContent='Datos que quieres compartir con IBERFIT';
      fieldset.append(legend);

      const intro=document.createElement('p');
      intro.textContent=
        'Puedes autorizar solo las categorías que quieras. IBERFIT solicita lectura, no escritura.';
      fieldset.append(intro);

      for(const capability of HEALTH_CONNECT_HISTORICAL_CAPABILITIES){
        const label=document.createElement('label');
        label.className='m26-health-connect-capability';

        const input=document.createElement('input');
        input.type='checkbox';
        input.checked=true;
        input.value=capability.key;
        input.dataset.healthConnectCapability=capability.key;

        const copy=document.createElement('span');
        const strong=document.createElement('strong');
        strong.textContent=capability.label;
        const small=document.createElement('small');
        small.textContent=capability.purpose;

        copy.append(strong,small);
        label.append(input,copy);
        fieldset.append(label);
      }

      const privacy=document.createElement('p');
      privacy.className='m26-notice';
      privacy.textContent=
        'Lectura inicial limitada a 30 días. No se solicita historial completo ni lectura en segundo plano.';
      fieldset.append(privacy);

      healthConnectCard.append(fieldset);
    }

    const nativeLabels={apple_health:'Conectar Apple Watch',health_connect:'Autorizar Health Connect',samsung_health:'Conectar Samsung Health',wear_os_health_services:'Conectar reloj Wear OS',ble_direct:'Conectar sensor Bluetooth'};
    for(const provider of bridge.nativeProviders){
      const healthConnectAvailable=provider==='health_connect'
        ?bridge.support.healthConnect.available
        :bridge.isAvailable(provider);
      if(!healthConnectAvailable)continue;
      const card=root.querySelector?.(`[data-provider="${provider}"]`);
      const action=provider==='health_connect'
        ?'connect-health-connect'
        :'connect-native-provider';
      if(!card||card.querySelector(`[data-wearable-action="${action}"]`))continue;
      const button=document.createElement('button');
      button.type='button';
      button.className='m26-primary-action m26-wearable-native-action';
      button.dataset.wearableAction=action;
      button.dataset.provider=provider;
      button.textContent=nativeLabels[provider]||'Conectar dispositivo';
      card.append(button);
    }
  }

  async function onClick(event){
    const button=event.target.closest?.(
      '[data-wearable-action]',
    );

    if(!button)return;

    const action=button.getAttribute(
      'data-wearable-action',
    );

    event.preventDefault?.();

    try{
      if(action==='download-template'){
        downloadTemplate();

        setStatus(
          root,
          'Plantilla descargada. No incluyas nombres, correos ni identificadores personales.',
          'success',
        );
      }else if(action==='clear-preview'){
        clearPreview();
      }else if(action==='use-in-checkin'){
        useInCheckin();
      }else if(action==='download-summary'){
        downloadSummary();
      }else if(action==='confirm-import'){
        await confirmImport();
      }else if(action==='sync-pending'){
        await syncPending();
      }else if(action==='connect-health-connect'){
        const capabilities=[...root.querySelectorAll?.('[data-health-connect-capability]:checked')||[]].map((input)=>input.value);
        await connectHealthConnect({capabilities});
      }else if(action==='connect-native-provider'){
        await connectNativeProvider(button.dataset.provider);
      }else if(action==='delete-all'){
        await deleteAll();
      }
    }catch(error){
      const code=emitDiagnostic(
        `wearable-${action}`,
        error,
      );

      setStatus(
        root,
        `${friendlyError(code)} Código: ${code}.`,
        'error',
      );
    }
  }

  function onOnline(){
    void syncPending().catch((error)=>{
      emitDiagnostic(
        'wearable-online-sync',
        error,
      );
    });
  }

  return Object.freeze({
    mount(){
      if(mounted)return;

      root.addEventListener(
        'submit',
        onSubmit,
      );

      root.addEventListener(
        'click',
        onClick,
      );

      globalThis.addEventListener?.(
        'online',
        onOnline,
      );

      if(
        typeof MutationObserver==='function'
      ){
        observer=new MutationObserver(
          enhanceControls,
        );

        observer.observe(
          root,
          {
            childList:true,
            subtree:true,
          },
        );
      }

      enhanceControls();
      mounted=true;
      void autoSyncNativeProviders();

      if(isOnline()){
        void remoteSync.flush().catch(
          (error)=>{
            emitDiagnostic(
              'wearable-initial-sync',
              error,
            );
          },
        );
      }
    },

    destroy(){
      if(!mounted)return;

      tasks.cancel();
      currentPreview=null;
      observer?.disconnect?.();
      observer=null;

      root.removeEventListener(
        'submit',
        onSubmit,
      );

      root.removeEventListener(
        'click',
        onClick,
      );

      globalThis.removeEventListener?.(
        'online',
        onOnline,
      );

      mounted=false;
    },

    analyze,
    clearPreview,
    confirmImport,
    syncPending,
    connectHealthConnect,
    connectNativeProvider,
    autoSyncNativeProviders,
    getPreview:()=>currentPreview,
  });
}

export const __wearableControllerInternals=
  Object.freeze({
    wearableContextText,
    friendlyError,
  });
