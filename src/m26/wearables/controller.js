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
import {formatSleepDuration} from './duration-format.js';
import {assertWearableClientContinuity,createWearableForegroundSync,isCertifiedNativeAutoSyncSource} from './foreground-sync.js';
import {
  createConnected360QaNativeChannel,
  isConnected360QaNativeAvailable,
} from './qa-native-channel.js';
import {createConnected360QaImporter} from './qa-native-import.js';
import {createConnected360V46QaImporter} from './v46-qa-import.js';
import {createConnected360V46QaNativeChannel} from './v46-qa-native-channel.js';
import {createConnected360V46ProdNativeChannel,isConnected360ProdNativeAvailable} from './v46-prod-native-channel.js';
import {createConnected360ProductionSync} from './v46-production-sync.js';
import {formatConnected360ProductionSummary} from './v46-production-summary.js';
import {createAppleHealthQaNativeChannel,isAppleHealthQaNativeAvailable} from './apple-qa-native-channel.js';
import {
  createLatestTaskCoordinator,
} from '../platform/latest-task.js';
import {
  HEALTH_CONNECT_HISTORICAL_CAPABILITIES,
  createHealthConnectHistoricalPlan,
  healthConnectHistoricalMetricKeys,
  healthConnectLocalCivilDate,
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
    // Server-projected immutable auth uid, never a client-editable label.
    ownerId:state.identity?.id??null,
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
        formatSleepDuration(summary.metrics.sleepMinutes),
        '/día',
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
        formatSleepDuration(summary.metrics.sleepMinutes),
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
      Elegir ${escapeHtml(providerLabel)} identifica únicamente el origen del archivo: no conecta ningún dispositivo ni activa una sincronización automática.
      Al seleccionar «Autorizar e incorporar», permites guardar en IBERFIT las métricas mostradas de esta fuente.
      Puedes desconectarla o eliminar esos datos desde Ajustes.
    </p>

    <div class="m26-action-grid m26-wearable-preview-actions">
      <button
        type="button"
        class="m26-primary-action"
        data-wearable-action="confirm-import"
      >
        Autorizar e incorporar
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
  if(/(?:APPLE_QA|HEALTH)_LOCAL_APPROVAL_EXPIRED/u.test(code)){
    return 'La autorización local caducó. Vuelve a pulsar «Permitir UNA lectura» en la aplicación de pruebas.';
  }
  if(/CONNECTED360_(?:SCOPE_EXPANSION_REQUIRES_REVOKE|IMPORT_SCOPE_FORBIDDEN)/u.test(code)){
    return 'Este archivo solicita nuevas métricas. Desconecta la fuente y vuelve a autorizarla con los permisos actualizados.';
  }
  if(/CONNECTED360_(?:CONSENT_VERSION_CONFLICT|GRANT_REVOKED|GRANT_STALE|CONSENT_REVOKED)/u.test(code)){
    return 'La autorización ha cambiado o se revocó desde otro dispositivo. Revisa la fuente y confirma de nuevo solo si quieres volver a compartirla.';
  }
  if(/CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED/u.test(code)){
    return 'Para conceder permisos nuevos necesitas conexión. El archivo sigue bajo tu control.';
  }
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
  ownerId,
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
  let lastOnline=null;
  let nativeIdentityEpoch=0;
  let productionSummaryEpoch=0;

  const tasks=createLatestTaskCoordinator();

  const remoteSync=createWearableRemoteSync({
    transport,
    getToken,
    ownerId,
    refreshState,
    isOnline,
  });

  const bridge=createWearableBridgeService({
    scope:globalThis,
  });
  // This isolated debug-only channel cannot mark devices as linked,
  // persist health data, issue consent or bypass productionAllowed=false.
  const qaClientIdentity=()=>{
    const identity=store.getState().identity||{};
    return {
      role:identity.role,
      clientId:identity.role==='client'?identity.clientId:null,
      // A changed signed-in user must not inherit the old controller's
      // captured owner. Never substitute the stale ownerId on login switch.
      ownerId:identity.id&&String(identity.id)===String(ownerId)
        ?String(identity.id):null,
    };
  };
  const qaNative=createConnected360QaNativeChannel({
    scope:globalThis,
    getIdentity:qaClientIdentity,
    getToken,
  });
  const qaV46Native=createConnected360V46QaNativeChannel({
    scope:globalThis,
    getIdentity:qaClientIdentity,
    getToken,
  });
  let qaV46ReadEpoch=0;
  const productionAndroid=isConnected360ProdNativeAvailable(globalThis);
  const productionNative=productionAndroid
    ?createConnected360V46ProdNativeChannel({
      scope:globalThis,getIdentity:qaClientIdentity,getToken,
    }):null;
  const productionSync=productionAndroid&&
      typeof transport?.connected360ProductionCapabilities==='function'
    ?createConnected360ProductionSync({
      transport,native:productionNative,getIdentity:qaClientIdentity,
      getToken,isOnline,refreshState,
    }):null;
  const appleQaNative=createAppleHealthQaNativeChannel({
    scope:globalThis,
    getIdentity:qaClientIdentity,
    getToken,
  });
  let appleReadEpoch=0;
  let qaReadEpoch=0;
  // Normal web/Coach/Admin and isolated controller tests must remain fully
  // operational without QA bridge or a native import transport.
  const qaImportAvailable=isConnected360QaNativeAvailable(globalThis)
    &&typeof transport?.importConnected360QaV45==='function';
  const qaImporter=qaImportAvailable
    ?createConnected360QaImporter({
      scope:globalThis,
      transport,
      remoteSync,
      getToken,
      getIdentity:qaClientIdentity,
      isOnline,
      refreshState,
    })
    :Object.freeze({
      clear:()=>{},
      destroy:()=>{},
      hasPreview:()=>false,
      isBusy:()=>false,
      capture:()=>{throw new Error('M26_HEALTH_QA_IMPORT_UNAVAILABLE');},
      commit:async()=>{throw new Error('M26_HEALTH_QA_IMPORT_UNAVAILABLE');},
    });

  const qaV46ImportAvailable=isConnected360QaNativeAvailable(globalThis)
    &&typeof transport?.importConnected360QaV46==='function';
  const qaV46Importer=qaV46ImportAvailable
    ?createConnected360V46QaImporter({
      transport,remoteSync,getIdentity:qaClientIdentity,
      getToken,isOnline,refreshState,
    })
    :Object.freeze({
      clear:()=>{},destroy:()=>{},hasPreview:()=>false,
      isBusy:()=>false,
      capture:()=>{throw new Error('M26_V46_QA_IMPORT_UNAVAILABLE');},
      commit:async()=>{throw new Error('M26_V46_QA_IMPORT_UNAVAILABLE');},
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

    // Imported files from every declared provider use the same consent gate.
    // No silent grant issuance during native/background synchronization.
    if(!isOnline())throw new Error('M26_CONNECTED360_ONLINE_REAUTHORIZE_REQUIRED');
    const fields=['steps','activeMinutes','sleepMinutes','restingHeartRate',
      'hrvMs','activeEnergyKcal','workoutMinutes'];
    const scopes=fields.filter((field)=>
      currentPreview.records.some((record)=>Number.isFinite(record?.metrics?.[field]))
    );
    if(!scopes.length)throw new Error('M26_CONNECTED360_SCOPE_REQUIRED');
    const consent=await remoteSync.reauthorize({provider:currentPreview.provider,scopes});
    const grant=consent.grantId;
    const result=await remoteSync.stage({
      clientId,
      provider:currentPreview.provider,
      records:currentPreview.records,
      authorizationGrant:grant,
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
      result.discarded
        ?'Se descartaron registros locales antiguos porque la autorización fue revocada desde otro dispositivo.'
        :result.pending
          ?`${result.pending} registro${result.pending===1?'':'s'} pendiente${result.pending===1?'':'s'}.`
          :'Sincronización completada.',
      result.discarded?'info':result.pending?'pending':'success',
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
      signal=null,
    }={}
  ){
    const {role,clientId,ownerId:sessionOwner}=context(store);
    if(role!=='client'||!clientId){
      throw new Error('M26_WEARABLE_CLIENT_CONTROL_REQUIRED');
    }
    if(!sessionOwner||String(sessionOwner)!==String(ownerId)){
      throw new Error('M26_WEARABLE_ACCOUNT_CHANGED');
    }

    const identityEpoch=nativeIdentityEpoch;
    const requireSameClient=()=>{
      if(signal?.aborted)throw new Error('M26_WEARABLE_SYNC_INVALIDATED');
      if(identityEpoch!==nativeIdentityEpoch)throw new Error('M26_WEARABLE_ACCOUNT_CHANGED');
      assertWearableClientContinuity(
        {role:'client',clientId,ownerId:sessionOwner},context(store)
      );
    };
    requireSameClient();
    const normalized=normalizeWearableProvider(provider);
    if(!normalized||!bridge.nativeProviders.includes(normalized)){
      throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
    }

    // Native bridges are development-only until certified for production.
    const nativePolicy=wearableZeroCostPolicy(normalized);
    if(!nativePolicy?.productionAllowed){
      throw new Error(nativePolicy?.reason||'M26_ZERO_COST_POLICY_BLOCKED');
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

    // Returning from background may sync existing grants, never open a new permission ceremony.
    if(!interactive&&!granted.length){
      return Object.freeze({ok:true,skipped:true,reason:'permission-pending',provider:normalized,recordCount:0});
    }
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

      requireSameClient();
      granted=authorization.granted;
      if(!granted.length){
        throw new Error('M26_WEARABLE_SCOPE_REQUIRED');
      }
    }

    const readable=requestedMetrics.filter((item)=>granted.includes(item));
    if(!readable.length){
      throw new Error('M26_WEARABLE_SCOPE_REQUIRED');
    }

    // Device permissions never authorize uploading health records. An explicit
    // Client click acquires the server grant; passive resume can only reuse a
    // currently valid grant and never calls the reauthorization RPC.
    const consent=interactive
      ?await remoteSync.reauthorize({provider:normalized,scopes:readable})
      :await remoteSync.currentAuthorization({provider:normalized,scopes:readable});
    requireSameClient();
    if(!consent?.grantId)throw new Error('M26_CONNECTED360_GRANT_STALE');

    await bridge.setSyncEnabled({
      provider:normalized,
      clientId,
      enabled:true,
    });
    requireSameClient();

    const resolvedEndDate=endDate||healthConnectLocalCivilDate(new Date());
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
    requireSameClient();

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
        authorizationGrant:consent.grantId,
      });
      requireSameClient();
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
          :`Permisos de ${label} concedidos. No hay datos para incorporar todavía.`,
        'success',
      );
    }

    return Object.freeze({
      ...result,
      provider:normalized,
      connected:records.length>0&&result.synced===true,
      permissionGranted:true,
      recordCount:records.length,
      requestedMetrics:Object.freeze([...requestedMetrics]),
      grantedMetrics:Object.freeze([...readable]),
      startDate:resolvedStartDate,
      endDate:resolvedEndDate,
    });
  }
  async function refreshProductionSummary(wrap){
    if(!productionSync||!wrap?.isConnected)return;
    const target=wrap.querySelector?.('[data-prod-connected360-summary]');
    if(!target)return;
    const requestEpoch=++productionSummaryEpoch;
    const identityEpoch=nativeIdentityEpoch;
    const expected=qaClientIdentity();
    if(expected.role!=='client'||!expected.ownerId||!expected.clientId)return;
    const stillCurrent=()=>{
      const current=qaClientIdentity();
      return mounted&&wrap.isConnected&&requestEpoch===productionSummaryEpoch
        &&identityEpoch===nativeIdentityEpoch&&current.role==='client'
        &&expected.ownerId===current.ownerId&&expected.clientId===current.clientId;
    };
    try{
      const token=await getToken();
      if(!stillCurrent())return;
      const response=await transport.connected360ProductionSummary(token);
      if(stillCurrent())target.textContent=formatConnected360ProductionSummary(response);
    }catch{
      if(stillCurrent())target.textContent='No se ha podido actualizar el historial. '+
        'Los datos existentes se conservan y se reintentará al volver a abrir IBERFIT.';
    }
  }
  async function autoSyncNativeProviders({signal=null}={}){
    const session=context(store);
    if(signal?.aborted||session.role!=='client'||!session.ownerId||
      String(session.ownerId)!==String(ownerId)||!isOnline())return [];
    const rows=store.getState().collections?.wearableConnections||[];
    const providers=[...new Set(rows.filter(isCertifiedNativeAutoSyncSource).map((item)=>normalizeWearableProvider(item.provider||item.source)).filter((provider)=>provider&&bridge.nativeProviders.includes(provider)&&wearableZeroCostPolicy(provider)?.productionAllowed&&bridge.isAvailable(provider)))];
    const results=[];
    if(productionSync&&!signal?.aborted){
      try{
        const result=await productionSync.sync({signal});
        if(!signal?.aborted){
          results.push(result);
          if(result?.ok===true){
            const wrap=root.querySelector?.('[data-prod-connected360]');
            if(wrap?.isConnected){
              const status=wrap.querySelector?.('[data-prod-connected360-status]');
              if(status)status.textContent='Sincronización automática completada. '+
                'Actualizando las mediciones disponibles…';
              void refreshProductionSummary(wrap);
            }
          }
        }
      }catch(error){
        if(signal?.aborted)return results;
        emitDiagnostic('connected360-prod-foreground',error);
      }
    }
    for(const provider of providers){
      if(signal?.aborted)break;
      try{
        assertWearableClientContinuity(session,context(store));
        const result=await connectNativeProvider(provider,{interactive:false,silent:true,signal});
        if(signal?.aborted)break;
        assertWearableClientContinuity(session,context(store));
        results.push(result);
      }catch(error){
        // Account rotation is not a recoverable per-provider failure:
        // stop the entire cycle before reaching another native source.
        if(signal?.aborted||
          error?.message==='M26_WEARABLE_SYNC_INVALIDATED'||
          error?.message==='M26_WEARABLE_ACCOUNT_CHANGED')break;
        emitDiagnostic('wearable-auto-sync',error);
      }
    }
    return results;
  }

  const foregroundSync=createWearableForegroundSync({
    run:autoSyncNativeProviders,
    canRun:()=>{
      const {role,clientId}=context(store);
      const doc=root.ownerDocument||globalThis.document;
      return mounted&&role==='client'&&Boolean(clientId)&&Boolean(isOnline())
        &&doc?.visibilityState!=='hidden';
    },
  });

  function requestForegroundSync({force=false}={}){
    void foregroundSync.trigger({force}).catch((error)=>{
      emitDiagnostic('wearable-foreground-sync',error);
    });
  }

  function onForegroundVisibility(){
    const doc=root.ownerDocument||globalThis.document;
    if(doc?.visibilityState==='hidden'){
      foregroundSync.invalidate();
      productionSync?.invalidate();
      return;
    }
    if(doc?.visibilityState==='visible')requestForegroundSync();
  }

  function onPageHide(){
    // Background/BFCache must not resume a stale health read or identity lease.
    foregroundSync.invalidate();
    productionSync?.invalidate();
  }

  function onPageShow(){
    const doc=root.ownerDocument||globalThis.document;
    if(doc?.visibilityState!=='hidden')requestForegroundSync();
  }
  function onNativeHealthPermissionsReturned(){
    // Android only signals that its permission screen returned, NOT whether
    // the user granted it. A previous no-permission read must never be reused.
    if(!mounted||!productionSync)return;
    const expected=qaClientIdentity();
    const epoch=nativeIdentityEpoch;
    if(expected.role!=='client'||!expected.ownerId||!expected.clientId)return;
    const stillCurrent=()=>{
      const current=qaClientIdentity();
      return mounted&&epoch===nativeIdentityEpoch&&
        current.role==='client'&&current.ownerId===expected.ownerId&&
        current.clientId===expected.clientId;
    };
    foregroundSync.invalidate();
    productionSync.invalidate();
    const outcome=(confirmed)=>{
      if(!stillCurrent())return;
      // UI confirmation only: consent, authorization and uploads remain
      // guarded by productionSync. No health records enter this DOM event.
      root.dispatchEvent?.(new CustomEvent('m26:connected360-native-permission-outcome',{
        detail:{confirmed:confirmed===true},
      }));
    };
    void foregroundSync.trigger({force:true}).then((results)=>{
      if(!stillCurrent())return;
      const nativeResult=Array.isArray(results)?results[0]:null;
      outcome(nativeResult?.ok===true||nativeResult?.skipped==='no-recent-observations');
    }).catch(error=>{
      emitDiagnostic('connected360-prod-os-permissions-return',error);
      outcome(false);
    });
  }

  // Same authenticated native route for the first-day welcome and the
  // Devices screen. No implicit grant, background consent or legacy QA path.
  async function startProductionHealthConnection(scopes){
    if(!mounted||!productionSync||!productionNative)
      throw new Error('M26_V46_PROD_NATIVE_REQUIRED');
    if(!Array.isArray(scopes)||!scopes.length||scopes.length>5
      ||new Set(scopes).size!==scopes.length
      ||scopes.some(metric=>!['steps','sleepMinutes','restingHeartRate',
        'generalHeartRate','exerciseSessions'].includes(metric)))
      throw new Error('M26_V46_PROD_EXPLICIT_CONSENT_REQUIRED');
    const flags=await productionSync.availability();
    if(flags.serverEnabled!==true)throw new Error('M26_V46_PROD_NOT_ACTIVATED');
    await productionSync.authorize(scopes);
    // Android shows its own independent grant ceremony only after explicit
    // user action and after the server has accepted the selected categories.
    productionNative.requestPermissions(scopes);
    return Object.freeze({requested:true});
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

    qaReadEpoch+=1;
    qaV46ReadEpoch+=1;
    appleReadEpoch+=1;
    qaImporter.clear();
    productionSync?.invalidate();
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

  function clearQaSensitiveSurface(){
    root.querySelectorAll?.('[data-apple-qa-status]')?.forEach?.(node=>{
      node.textContent='';
    });
    root.querySelectorAll?.('[data-qa-health-preview]')?.forEach?.(preview=>{
      preview.hidden=true;
    });
    root.querySelectorAll?.('[data-qa-health-records]')?.forEach?.(list=>{
      list.textContent='';
    });
    root.querySelectorAll?.('[data-qa-health-status]')?.forEach?.(node=>{
      node.textContent='';
    });
    root.querySelectorAll?.('[data-qa-v46-evidence-status]')?.forEach?.(node=>{
      node.textContent='';
    });
    root.querySelectorAll?.('[data-qa-v46-scope]')?.forEach?.(input=>{
      input.checked=false;input.disabled=true;
    });
    root.querySelectorAll?.('[data-wearable-action="qa-v46-evidence-confirm"]')?.forEach?.(button=>{
      button.disabled=true;
    });
    root.querySelectorAll?.('[data-qa-health-consent]')?.forEach?.(input=>{
      input.checked=false;
      input.disabled=true;
    });
    root.querySelectorAll?.('[data-wearable-action="qa-health-confirm"]')?.forEach?.(btn=>{
      btn.disabled=true;
    });
  }

  function clearPreview(showStatus=true){
    tasks.cancel();
    currentPreview=null;
    qaReadEpoch+=1;
    qaV46ReadEpoch+=1;
    appleReadEpoch+=1;
    qaImporter.clear();
    qaV46Importer.clear();
    clearQaSensitiveSurface();
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

    if(productionSync){
      const nativeCard=root.querySelector?.('[data-provider="health_connect"]');
      if(nativeCard&&!nativeCard.querySelector?.('[data-prod-connected360]')){
        const wrap=document.createElement('section');
        wrap.dataset.prodConnected360='true';
        wrap.className='m26-wearable-native-connect';
        const intro=document.createElement('p');
        intro.textContent='Conecta tus datos de actividad con Health Connect. Elige qué compartir. '+
          'IBERFIT sincronizará al abrir la aplicación cuando haya conexión y permiso. '+
          'Los datos proceden de fuentes de salud autorizadas; no se presupone que sean del reloj.';
        const consentArea=document.createElement('div');
        consentArea.dataset.prodConnected360Scopes='true';
        for(const [metric,copy] of [
          ['steps','Compartir mis pasos diarios'],
          ['sleepMinutes','Compartir mi duración de sueño'],
          ['restingHeartRate','Compartir mi frecuencia cardíaca en reposo'],
          ['generalHeartRate','Compartir mi frecuencia cardíaca general (no FC en reposo)'],
          ['exerciseSessions','Compartir mis actividades y entrenamientos observados'],
        ]){
          const label=document.createElement('label');
          label.className='m26-wearable-qa-consent';
          const checkbox=document.createElement('input');
          checkbox.type='checkbox';
          checkbox.dataset.prodConnected360Scope=metric;
          const span=document.createElement('span');span.textContent=copy;
          label.append(checkbox,span);consentArea.append(label);
        }
        const permissions=document.createElement('button');
        permissions.type='button';
        permissions.dataset.wearableAction='prod-connected360-permissions';
        permissions.textContent='Elegir permisos en Android';
        const connect=document.createElement('button');
        connect.type='button';
        connect.dataset.wearableAction='prod-connected360-connect';
        connect.textContent='Conectar mi reloj a IBERFIT';
        const note=document.createElement('p');
        note.dataset.prodConnected360Status='true';
        note.setAttribute('role','status');
        note.textContent='Verificando disponibilidad segura…';
        const results=document.createElement('p');
        results.dataset.prodConnected360Summary='true';
        results.setAttribute('role','status');
        results.textContent='Datos de salud: consultando registros disponibles…';
        wrap.append(intro,consentArea,permissions,connect,note,results);
        nativeCard.append(wrap);
        const generation=nativeIdentityEpoch;
        void refreshProductionSummary(wrap);
        void productionSync.availability().then(flags=>{
          if(generation!==nativeIdentityEpoch||!wrap.isConnected)return;
          const enabled=flags.serverEnabled===true;
          connect.disabled=!enabled;
          note.textContent=enabled
            ?'Listo para conectar con consentimiento independiente por categoría.'
            :'Integración nativa instalada; activación sanitaria pendiente de certificación.';
        }).catch(()=>{
          connect.disabled=true;
          if(generation===nativeIdentityEpoch)note.textContent=
            'No se ha podido verificar la conexión de salud. Reintenta al recuperar la red.';
        });
      }
    }

    // Show only inside the Android Canary QA container. Never create a
    // production device-link button or bypass source activation policy.
    if(isConnected360QaNativeAvailable(globalThis)){
      const qaCard=root.querySelector?.('[data-provider="health_connect"]');
      if(qaCard&&!qaCard.querySelector?.('[data-wearable-action="qa-health-read"]')){
        // A replaced card must not authorize an unseen, older local preview.
        if(qaImportAvailable&&qaImporter.hasPreview()&&!qaImporter.isBusy())
          qaImporter.clear();
        const control=document.createElement('button');
        control.type='button';
        control.dataset.wearableAction='qa-health-read';
        control.textContent='Probar lectura local Android (QA)';
        const status=document.createElement('p');
        status.dataset.qaHealthStatus='true';
        status.setAttribute('role','status');
        status.textContent='Primero autoriza una lectura en la app Android de pruebas. Esta prueba no guarda ni vincula datos.';
        const details=document.createElement('details');
        details.dataset.qaHealthPreview='true';
        details.hidden=true;
        const summary=document.createElement('summary');
        summary.textContent='Ver días y métricas de la lectura local';
        const daily=document.createElement('ul');
        daily.dataset.qaHealthRecords='true';
        details.append(summary,daily);
        const consent=document.createElement('label');
        consent.className='m26-wearable-qa-consent';
        const check=document.createElement('input');
        check.type='checkbox';
        check.dataset.qaHealthConsent='true';
        check.disabled=!qaImporter.hasPreview();
        const copy=document.createElement('span');
        copy.textContent='Acepto guardar estos resúmenes en mi cuenta IBERFIT de pruebas. Puedo desconectar o borrarlos después.';
        consent.append(check,copy);
        const confirm=document.createElement('button');
        confirm.type='button';
        confirm.dataset.wearableAction='qa-health-confirm';
        confirm.textContent='Autorizar e incorporar (QA)';
        confirm.disabled=true;
        const discard=document.createElement('button');
        discard.type='button';
        discard.dataset.wearableAction='qa-health-discard';
        discard.textContent='Descartar lectura local (QA)';
        if(qaImportAvailable){
          qaCard.append(control,status,details,consent,confirm,discard);
        }else{
          qaCard.append(control,status,details);
        }
        const v46Button=document.createElement('button');
        v46Button.type='button';
        v46Button.dataset.wearableAction='qa-v46-evidence-read';
        v46Button.textContent='Consultar FC general y entrenamientos · QA';
        const v46Status=document.createElement('p');
        v46Status.dataset.qaV46EvidenceStatus='true';
        v46Status.setAttribute('role','status');
        v46Status.textContent='Solo lectura en Android: primero autoriza una lectura en la app QA. No se envían datos.';
        qaCard.append(v46Button,v46Status);
        if(qaV46ImportAvailable){
          // No remote write is triggered by Android read, resume or connectivity.
          // Each category needs an independent, deliberate check and final click.
          const consentRows=document.createElement('div');
          consentRows.dataset.qaV46ConsentArea='true';
          const choices=[
            ['generalHeartRate','Acepto incorporar mi frecuencia cardíaca general a IBERFIT QA.'],
            ['exerciseSessions','Acepto incorporar mis actividades deportivas observadas a IBERFIT QA.'],
          ];
          for(const [metric,labelText] of choices){
            const label=document.createElement('label');
            label.className='m26-wearable-qa-consent';
            const input=document.createElement('input');
            input.type='checkbox';
            input.dataset.qaV46Scope=metric;
            input.disabled=true;
            const copy=document.createElement('span');
            copy.textContent=labelText;
            label.append(input,copy);
            consentRows.append(label);
          }
          const commitButton=document.createElement('button');
          commitButton.type='button';
          commitButton.dataset.wearableAction='qa-v46-evidence-confirm';
          commitButton.textContent='Autorizar e incorporar estas categorías (QA)';
          commitButton.disabled=true;
          consentRows.addEventListener('change',()=>{
            commitButton.disabled=!qaV46Importer.hasPreview()||
              qaV46Importer.isBusy()||
              ![...consentRows.querySelectorAll('[data-qa-v46-scope]')]
                .some(input=>input.checked===true&&!input.disabled);
          });
          qaCard.append(consentRows,commitButton);
        }
      }
    }

    // Signed iPhone DEBUG QA: local data only, no watch linkage or upload.
    if(isAppleHealthQaNativeAvailable(globalThis)){
      const appleCard=root.querySelector?.('[data-provider="apple_health"]');
      if(appleCard&&!appleCard.querySelector?.('[data-wearable-action="qa-apple-health-read"]')){
        const button=document.createElement('button');
        button.type='button';
        button.dataset.wearableAction='qa-apple-health-read';
        button.textContent='Consultar Apple Salud en este iPhone (QA)';
        const note=document.createElement('p');
        note.dataset.appleQaStatus='true';
        note.setAttribute('role','status');
        note.textContent='Autoriza una lectura local desde la app iPhone QA. No se guardarán ni sincronizarán registros.';
        appleCard.append(button,note);
      }
    }

    const nativeLabels={apple_health:'Conectar Apple Watch',health_connect:'Autorizar Health Connect',samsung_health:'Conectar Samsung Health',wear_os_health_services:'Conectar reloj Wear OS',ble_direct:'Conectar sensor Bluetooth'};
    for(const provider of bridge.nativeProviders){
      const healthConnectAvailable=provider==='health_connect'
        ?bridge.support.healthConnect.available
        :bridge.isAvailable(provider);
      if(!healthConnectAvailable||!wearableZeroCostPolicy(provider)?.productionAllowed)continue;
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
      }else if(action==='prod-connected360-permissions'){
        if(!productionNative)throw new Error('M26_V46_PROD_NATIVE_REQUIRED');
        productionNative.requestPermissions();
        setStatus(root,'Gestiona los permisos en Android y vuelve a IBERFIT.','info');
      }else if(action==='prod-connected360-connect'){
        if(!productionSync||!productionNative)
          throw new Error('M26_V46_PROD_NATIVE_REQUIRED');
        const card=button.closest?.('[data-prod-connected360]');
        const scopes=[...(card?.querySelectorAll?.('[data-prod-connected360-scope]')||[])]
          .filter(item=>item.checked===true).map(item=>item.dataset.prodConnected360Scope);
        if(!scopes.length)throw new Error('M26_V46_PROD_EXPLICIT_CONSENT_REQUIRED');
        button.disabled=true;
        const note=card?.querySelector?.('[data-prod-connected360-status]');
        if(note)note.textContent='Registrando tu consentimiento para las categorías seleccionadas…';
        try{
          await startProductionHealthConnection(scopes);
          if(note)note.textContent='Consentimiento guardado. Confirma los permisos de Android; al volver, IBERFIT sincronizará los datos disponibles.';
          card?.querySelectorAll?.('[data-prod-connected360-scope]')?.forEach?.(item=>{
            item.checked=false;
          });
        }catch(error){
          if(note)note.textContent='No se pudo completar la conexión. Tu autorización existente se conserva; puedes reintentar.';
          throw error;
        }finally{button.disabled=false;}
      }else if(action==='qa-apple-health-read'){
        const epoch=++appleReadEpoch;
        const card=button.closest?.('[data-provider="apple_health"]');
        const note=card?.querySelector?.('[data-apple-qa-status]');
        if(note)note.textContent='Consultando Apple Salud de forma local…';
        const result=await appleQaNative.readLocal({days:7});
        if(epoch!==appleReadEpoch)return;
        const latest=result.rows.at(-1)||null;
        if(note){
          const stats=latest?.metrics||{};
          const sleep=stats.sleepMinutes;
          note.textContent=latest
            ?'Lectura local, no sincronizada · '+latest.date+
              ' · pasos: '+(stats.steps??'Sin dato')+
              ' · sueño: '+(sleep===undefined?'Sin dato':formatSleepDuration(sleep))+
              ' · FC reposo: '+(stats.restingHeartRate??'Sin dato')+
              '. Apple no revela si se concedió cada permiso de lectura. No se ha enviado información al servidor.'
            :'Sin datos disponibles o permisos de lectura no concedidos. No se han enviado registros.';
        }
      }else if(action==='qa-v46-evidence-read'){
        const epoch=++qaV46ReadEpoch;
        const card=button.closest?.('[data-provider="health_connect"]');
        const note=card?.querySelector?.('[data-qa-v46-evidence-status]');
        if(note)note.textContent='Leyendo FC general y sesiones deportivas del teléfono…';
        qaV46Importer.clear();
        card?.querySelectorAll?.('[data-qa-v46-scope]')?.forEach?.(input=>{
          input.checked=false;input.disabled=true;
        });
        const write=card?.querySelector?.('[data-wearable-action="qa-v46-evidence-confirm"]');
        if(write)write.disabled=true;
        const result=await qaV46Native.readLocal();
        if(epoch!==qaV46ReadEpoch)return;
        const available=qaV46ImportAvailable&&(
          result.envelope.heartRateDaily.length||result.envelope.exerciseEvidence.length
        );
        if(available){
          const snapshot=qaV46Importer.capture(result);
          card?.querySelectorAll?.('[data-qa-v46-scope]')?.forEach?.(input=>{
            input.disabled=input.dataset.qaV46Scope==='generalHeartRate'
              ?snapshot.generalHeartRate<1:snapshot.exerciseSessions<1;
          });
        }
        const hrDays=result.envelope.heartRateDaily.length;
        const workouts=result.envelope.exerciseEvidence.length;
        const observed=result.envelope.heartRateDaily.reduce(
          (sum,row)=>sum+row.sampleCount,0
        );
        if(note)note.textContent=
          'Lectura V46 SOLO local: '+hrDays+' día(s) de FC general ('+
          observed+' muestras), '+workouts+' actividad(es) deportiva(s). '+
          'FC general no es FC en reposo. No se han enviado datos a IBERFIT. '+
          (result.metrics.length<2?'Permisos parciales; algunas métricas no están disponibles.':'');
      }else if(action==='qa-v46-evidence-confirm'){
        const card=button.closest?.('[data-provider="health_connect"]');
        const note=card?.querySelector?.('[data-qa-v46-evidence-status]');
        const checks=[...(card?.querySelectorAll?.('[data-qa-v46-scope]')||[])];
        const selected=Object.fromEntries(checks.map(input=>[
          input.dataset.qaV46Scope,input.checked===true&&!input.disabled
        ]));
        if(!qaV46Importer.hasPreview()||qaV46Importer.isBusy()||
          !Object.values(selected).some(Boolean))
          throw new Error('M26_V46_QA_EXPLICIT_CONSENT_REQUIRED');
        button.disabled=true;
        if(note)note.textContent='Comprobando consentimiento y guardando únicamente las categorías elegidas…';
        try{
          const result=await qaV46Importer.commit(selected);
          if(note)note.textContent='Datos autorizados e incorporados en IBERFIT QA. '+
            'Nuevos: '+result.inserted+' · actualizados: '+result.updated+
            ' · sin cambios: '+result.unchanged+'. Sin sincronización automática.';
          for(const input of checks){input.checked=false;input.disabled=true;}
          qaV46ReadEpoch+=1;
        }catch(error){
          if(note)note.textContent='No se ha podido confirmar la importación. '+
            'Revisa tu autorización y vuelve a realizar la lectura si es necesario.';
          throw error;
        }finally{
          button.disabled=!qaV46Importer.hasPreview();
        }
      }else if(action==='qa-health-read'){
        if(qaImporter.isBusy())throw new Error('M26_HEALTH_QA_BUSY');
        const epoch=++qaReadEpoch;
        const card=button.closest?.('[data-provider="health_connect"]');
        const node=card?.querySelector?.('[data-qa-health-status]');
        const confirm=card?.querySelector?.('[data-wearable-action="qa-health-confirm"]');
        const check=card?.querySelector?.('[data-qa-health-consent]');
        const list=card?.querySelector?.('[data-qa-health-records]');
        const details=card?.querySelector?.('[data-qa-health-preview]');
        if(list)list.textContent='';
        if(details)details.hidden=true;
        qaImporter.clear();
        if(confirm)confirm.disabled=true;
        if(check){
          check.checked=false;
          check.disabled=true;
        }
        if(node)node.textContent='Leyendo datos autorizados en el teléfono…';
        const local=await qaNative.readLocal({days:7});
        if(epoch!==qaReadEpoch)return;
        const latest=local.rows.at(-1)||null;
        if(list&&details&&local.rows.length){
          for(const row of local.rows){
            const item=document.createElement('li');
            const values=row.metrics||{};
            const sleep=values.sleepMinutes;
            item.textContent=row.date+' · pasos: '+(values.steps??'Sin dato')+
              ' · sueño: '+(sleep===undefined?'Sin dato':formatSleepDuration(sleep))+
              ' · FC reposo: '+(values.restingHeartRate??'Sin dato');
            list.append(item);
          }
          details.hidden=false;
        }
        if(local.rows.length&&qaImportAvailable){
          qaImporter.capture(local);
          if(check)check.disabled=false;
        }
        if(node){
          const sleep=latest?.metrics?.sleepMinutes;
          node.textContent=latest
            ?'Vista local (no sincronizada) · '+latest.date+
              ' · pasos: '+(latest.metrics.steps??'Sin dato')+
              ' · sueño: '+(sleep===undefined?'Sin dato':formatSleepDuration(sleep))+
              ' · FC reposo: '+(latest.metrics.restingHeartRate??'Sin dato')+
              '. Ningún registro se ha enviado a IBERFIT. La hora de lectura no acredita cuándo lo actualizó el reloj.'
            :'No hay datos del dispositivo en los últimos siete días. No se han enviado registros.';
        }
      }else if(action==='qa-health-confirm'){
        const card=button.closest?.('[data-provider="health_connect"]');
        const check=card?.querySelector?.('[data-qa-health-consent]');
        if(!qaImporter.hasPreview()||check?.checked!==true)
          throw new Error('M26_HEALTH_QA_EXPLICIT_CONSENT_REQUIRED');
        button.disabled=true;
        const note=button.closest?.('[data-provider="health_connect"]')
          ?.querySelector?.('[data-qa-health-status]');
        if(note)note.textContent='Incorporando únicamente los datos autorizados en IBERFIT QA…';
        try{
          const confirmed=await qaImporter.commit({confirmed:true});
          if(note)note.textContent=
            'Incorporados '+confirmed.imported+' resúmenes · '+
            confirmed.unchanged+' sin cambios. Es una importación manual, no una conexión automática. La hora de lectura no certifica la fecha de medición.';
          if(check){
            check.checked=false;
            check.disabled=true;
          }
        }catch(error){
          if(note)note.textContent='No se completó la incorporación. Puedes revisar el error y reintentar.';
          throw error;
        }finally{
          button.disabled=!qaImporter.hasPreview()||check?.checked!==true;
        }
      }else if(action==='qa-health-discard'){
        const card=button.closest?.('[data-provider="health_connect"]');
        if(qaImporter.isBusy()){
          const note=card?.querySelector?.('[data-qa-health-status]');
          if(note)note.textContent='La incorporación está en curso. Si necesitas retirarla, usa Desconectar y borrar datos.';
          return;
        }
        qaReadEpoch+=1;
        qaImporter.clear();
        const preview=card?.querySelector?.('[data-qa-health-preview]');
        if(preview)preview.hidden=true;
        const list=card?.querySelector?.('[data-qa-health-records]');
        if(list)list.textContent='';
        const check=card?.querySelector?.('[data-qa-health-consent]');
        if(check){
          check.checked=false;
          check.disabled=true;
        }
        const confirm=card?.querySelector?.('[data-wearable-action="qa-health-confirm"]');
        if(confirm)confirm.disabled=true;
        const note=card?.querySelector?.('[data-qa-health-status]');
        if(note)note.textContent='Vista previa local eliminada. Ningún dato se ha guardado.';
      }else if(action==='connect-health-connect'){
        const capabilities=[...root.querySelectorAll?.('[data-health-connect-capability]:checked')||[]].map((input)=>input.value);
        await connectHealthConnect({capabilities});
      }else if(action==='connect-native-provider'){
        await connectNativeProvider(button.dataset.provider);
      }else if(action==='revoke-source'||action==='remove-source-data'){
        const {role}=context(store);
        if(role!=='client')throw new Error('M26_WEARABLE_CLIENT_CONTROL_REQUIRED');
        const provider=normalizeWearableProvider(button.dataset.provider);
        if(!provider)throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
        const erase=action==='remove-source-data';
        const approved=globalThis.confirm?.(erase
          ?'¿Desconectar la fuente y eliminar sus datos de IBERFIT? No afecta al dispositivo original.'
          :'¿Desconectar esta fuente? No se admitirán nuevas sincronizaciones hasta que vuelvas a autorizarla.');
        if(!approved)return;
        qaReadEpoch+=1;
        appleReadEpoch+=1;
        qaImporter.clear();
        await remoteSync.revoke({provider,deleteData:erase});
        clearPreview(false);
        setStatus(root,erase?'Fuente desconectada y datos retirados.':'Fuente desconectada. Puedes borrar los datos guardados cuando quieras.','success');
      }else if(action==='delete-all'){
        await deleteAll();
      }
    }catch(error){
      const code=emitDiagnostic(
        `wearable-${action}`,
        error,
      );
      if(action==='qa-apple-health-read'){
        const note=button.closest?.('[data-provider="apple_health"]')?.querySelector?.('[data-apple-qa-status]');
        if(note)note.textContent='No se pudo completar la lectura local de Apple Salud. Código: '+code;
      }
      if(action==='qa-health-read'){
        const note=button.closest?.('[data-provider="health_connect"]')
          ?.querySelector?.('[data-qa-health-status]');
        if(note)note.textContent='Lectura local no completada. Revisa la sesión y la autorización en Android. Código: '+code;
      }

      setStatus(
        root,
        `${friendlyError(code)} Código: ${code}.`,
        'error',
      );
    }
  }

  function onChange(event){
    const consent=event.target.closest?.('[data-qa-health-consent]');
    if(!consent)return;
    const card=consent.closest?.('[data-provider="health_connect"]');
    const confirm=card?.querySelector?.('[data-wearable-action="qa-health-confirm"]');
    if(confirm){
      confirm.disabled=!consent.checked||!qaImporter.hasPreview();
    }
  }

  function onOnline(){
    const online=Boolean(isOnline());
    if(!online){
      lastOnline=false;
      return;
    }

    const reconnected=lastOnline===false;
    lastOnline=true;
    if(!reconnected)return;

    const {role,clientId}=context(store);
    if(role!=='client'||!clientId)return;

    void syncPending().catch((error)=>{
      emitDiagnostic(
        'wearable-online-sync',
        error,
      );
    });
    requestForegroundSync({force:true});
  }

  function onOffline(){
    lastOnline=false;
    // A network loss must retire in-flight native reads and any old grant lease.
    foregroundSync.invalidate();
  }

  return Object.freeze({
    mount({syncInitial=true}={}){
      if(mounted)return;

      root.addEventListener(
        'submit',
        onSubmit,
      );

      root.addEventListener(
        'click',
        onClick,
      );
      root.addEventListener('change',onChange);

      lastOnline=Boolean(isOnline());

      globalThis.addEventListener?.(
        'online',
        onOnline,
      );

      globalThis.addEventListener?.(
        'offline',
        onOffline,
      );
      globalThis.addEventListener?.('pageshow',onPageShow);
      globalThis.addEventListener?.('pagehide',onPageHide);
      globalThis.addEventListener?.('m26:native-health-permissions-returned',onNativeHealthPermissionsReturned);
      root.ownerDocument?.addEventListener?.('visibilitychange',onForegroundVisibility);

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

      if(syncInitial){
        requestForegroundSync({force:true});

        const {role,clientId}=context(store);
        if(role==='client'&&clientId&&lastOnline){
          void remoteSync.flush().catch(
            (error)=>{
              emitDiagnostic(
                'wearable-initial-sync',
                error,
              );
            },
          );
        }
      }
    },

    destroy(){
      if(!mounted)return;
      nativeIdentityEpoch+=1;
      productionSummaryEpoch+=1;
      foregroundSync.invalidate();
      mounted=false;

      tasks.cancel();
      currentPreview=null;
      qaReadEpoch+=1;
      appleReadEpoch+=1;
      qaNative.destroy();
      qaV46Native.destroy();
      appleQaNative.destroy();
      qaImporter.destroy();
      qaV46Importer.destroy();
      productionSync?.destroy();
      clearQaSensitiveSurface();
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
      root.removeEventListener('change',onChange);

      globalThis.removeEventListener?.(
        'online',
        onOnline,
      );

      globalThis.removeEventListener?.(
        'offline',
        onOffline,
      );
      globalThis.removeEventListener?.('pageshow',onPageShow);
      globalThis.removeEventListener?.('pagehide',onPageHide);
      globalThis.removeEventListener?.('m26:native-health-permissions-returned',onNativeHealthPermissionsReturned);
      root.ownerDocument?.removeEventListener?.('visibilitychange',onForegroundVisibility);

      lastOnline=null;
    },

    analyze,
    clearPreview,
    confirmImport,
    syncPending,
    connectHealthConnect,
    startProductionHealthConnection,
    productionHealthReady:()=>mounted&&Boolean(productionSync),
    connectNativeProvider,
    autoSyncNativeProviders,
    // Authenticated, signed-native post-login only: schedule non-blocking
    // reconciliation after quiet mount without waiting in the login path.
    queueNativeInitialSync:()=>{
      if(mounted&&productionSync)requestForegroundSync({force:true});
    },
    pendingCount:()=>remoteSync.pendingCount(),
    clearOwner:()=>{
      nativeIdentityEpoch+=1;
      productionSummaryEpoch+=1;
      foregroundSync.invalidate();
      qaReadEpoch+=1;
      appleReadEpoch+=1;
      qaNative.destroy();
      qaV46Native.destroy();
      appleQaNative.destroy();
      qaImporter.destroy();
      qaV46Importer.destroy();
      productionSync?.destroy();
      clearQaSensitiveSurface();
      return remoteSync.clearOwner();
    },
    getPreview:()=>currentPreview,
  });
}

export const __wearableControllerInternals=
  Object.freeze({
    wearableContextText,
    friendlyError,
  });
