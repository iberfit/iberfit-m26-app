const EMPTY_TELEMETRY=Object.freeze({
  totalCount:0,
  pendingCount:0,
  terminalCount:0,
  dueCount:0,
});

function safeCount(value){
  const number=Number(value);
  return Number.isInteger(number)&&number>=0?number:0;
}

async function inspect(label,fn,fallback,failures){
  try{
    return await fn();
  }catch(error){
    failures.push(Object.freeze({
      source:label,
      code:String(error?.message||error||'M26_DEVICE_DATA_INSPECTION_FAILED').slice(0,160),
    }));
    return fallback;
  }
}

export async function inspectOwnerDeviceData({
  operations,
  drafts,
  recovery,
  telemetry,
  wearables,
  sessionTemplates,
}={}){
  const failures=[];

  const operationRows=await inspect(
    'operations',
    ()=>operations?.list?.()??Promise.reject(new Error('M26_DEVICE_OPERATIONS_INSPECT_UNAVAILABLE')),
    [],
    failures
  );
  const draftRows=await inspect(
    'drafts',
    ()=>drafts?.list?.()??Promise.reject(new Error('M26_DEVICE_DRAFTS_INSPECT_UNAVAILABLE')),
    [],
    failures
  );
  const recoveryRows=await inspect(
    'recovery',
    ()=>recovery?.list?.({includeSettled:true})??Promise.reject(new Error('M26_DEVICE_RECOVERY_INSPECT_UNAVAILABLE')),
    [],
    failures
  );
  const telemetrySummary=await inspect(
    'telemetry',
    ()=>telemetry?.summary?.()??Promise.reject(new Error('M26_DEVICE_TELEMETRY_INSPECT_UNAVAILABLE')),
    EMPTY_TELEMETRY,
    failures
  );
  const wearablePending=await inspect(
    'wearables',
    ()=>wearables?.pendingCount?.()??Promise.reject(new Error('M26_DEVICE_WEARABLE_INSPECT_UNAVAILABLE')),
    0,
    failures
  );
  const templateRows=await inspect(
    'sessionTemplates',
    async()=>sessionTemplates?.list?.()??Promise.reject(new Error('M26_DEVICE_TEMPLATES_INSPECT_UNAVAILABLE')),
    [],
    failures
  );

  const operationCount=Array.isArray(operationRows)?operationRows.length:0;
  const draftCount=Array.isArray(draftRows)?draftRows.length:0;
  const recoveryCount=Array.isArray(recoveryRows)?recoveryRows.length:0;
  const telemetryTotal=safeCount(telemetrySummary?.totalCount);
  const telemetryPending=safeCount(telemetrySummary?.pendingCount);
  const telemetryTerminal=safeCount(telemetrySummary?.terminalCount);
  const wearablePendingCount=safeCount(wearablePending);
  const templateCount=Array.isArray(templateRows)?templateRows.length:0;

  const atRiskCount=
    operationCount+
    draftCount+
    recoveryCount+
    telemetryTotal+
    wearablePendingCount;

  return Object.freeze({
    operationCount,
    draftCount,
    recoveryCount,
    telemetryTotal,
    telemetryPending,
    telemetryTerminal,
    wearablePendingCount,
    templateCount,
    atRiskCount,
    knownLocalCount:atRiskCount+templateCount,
    inspectionFailures:Object.freeze([...failures]),
    inspectionComplete:failures.length===0,
  });
}

export function ownerDeviceClearPrompt(summary={}){
  const atRisk=safeCount(summary.atRiskCount);
  const failures=Array.isArray(summary.inspectionFailures)
    ?summary.inspectionFailures.length
    :0;

  const base=
    'Los datos que ya están guardados en IBERFIT no se eliminarán. '+
    'Esta acción solo borra los datos locales de esta cuenta en este dispositivo.';

  if(failures){
    return (
      'No se pudo comprobar por completo si existen datos pendientes de sincronización. '+
      'Si continúas, algunos datos locales podrían perderse de forma permanente. '+
      `${base} ¿Cerrar sesión y borrar los datos de este dispositivo?`
    );
  }

  if(atRisk>0){
    return (
      `Hay ${atRisk} elemento${atRisk===1?'':'s'} local${atRisk===1?'':'es'} `+
      'que pueden no estar sincronizados o confirmados. Si continúas, podrían perderse de forma permanente. '+
      `${base} ¿Cerrar sesión y borrar los datos de este dispositivo?`
    );
  }

  return `${base} ¿Cerrar sesión y borrar los datos de este dispositivo?`;
}

async function clearTarget(name,fn,results,failures){
  try{
    if(typeof fn!=='function'){
      throw new Error('M26_DEVICE_CLEAR_TARGET_UNAVAILABLE');
    }
    const value=await fn();
    if(value===false){
      throw new Error('M26_DEVICE_CLEAR_NOT_CONFIRMED');
    }
    results.push(name);
  }catch(error){
    failures.push(Object.freeze({
      source:name,
      code:String(error?.message||error||'M26_DEVICE_CLEAR_FAILED').slice(0,160),
    }));
  }
}

export async function clearOwnerDeviceData({
  operations,
  drafts,
  recovery,
  telemetry,
  wearables,
  sessionTemplates,
  productivity,
  clearPreferences,
}={}){
  const cleared=[];
  const failures=[];

  const targets=[
    ['operations',()=>operations?.clearOwner?.()],
    ['drafts',()=>drafts?.clearOwner?.()],
    ['recovery',()=>recovery?.clearOwner?.()],
    ['telemetry',()=>telemetry?.clearOwner?.()],
    ['wearables',()=>wearables?.clearOwner?.()],
    ['sessionTemplates',()=>sessionTemplates?.clearOwner?.()],
    ['productivity',()=>productivity?.clearOwner?.()],
    ['preferences',clearPreferences],
  ];

  for(const [name,fn] of targets){
    await clearTarget(name,fn,cleared,failures);
  }

  return Object.freeze({
    ok:failures.length===0,
    attempted:targets.length,
    cleared:Object.freeze(cleared),
    failures:Object.freeze(failures),
  });
}
