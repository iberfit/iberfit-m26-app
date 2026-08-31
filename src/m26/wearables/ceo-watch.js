const freeze=(value)=>Object.freeze(value);

export const CEO_WATCH_MODES=freeze({
  clasico:freeze({
    id:'clasico',
    label:'CLÁSICO',
    clock:'analogico',
    intent:'representacion',
    aod:'minimal',
    primary:['hora','fecha'],
    secondary:['bateria'],
    forbidden:['pasos','fc','kcal','cliente','sesion','pendientes'],
  }),
  control:freeze({
    id:'control',
    label:'CONTROL',
    clock:'digital',
    intent:'direccion',
    aod:'hora_estado',
    primary:['hora','proximaSesion'],
    secondary:['sesionesHoy','seguimientosPendientes','iriPendientes','bateria'],
    forbidden:['nombreCliente','telefono','email','diagnostico','pagos'],
  }),
  sesion:freeze({
    id:'sesion',
    label:'SESIÓN',
    clock:'digital',
    intent:'coach',
    aod:'tiempo_sesion',
    primary:['tiempoSesion','ejercicioActual','serieActual','descanso'],
    secondary:['siguienteEjercicio','proximaSesion','bateria'],
    forbidden:['nombreCliente','telefono','email','diagnostico','pagos'],
  }),
  entreno:freeze({
    id:'entreno',
    label:'ENTRENO',
    clock:'digital',
    intent:'rendimiento_personal',
    aod:'tiempo_fc',
    primary:['tiempoEntreno','fc','zona'],
    secondary:['fcMedia','fcMax','kcal','bateria'],
    forbidden:['cliente','agenda','pagos'],
  }),
});

export const CEO_WATCH_RELEASE=freeze({
  product:'IBERFIT Watch · Edición CEO',
  audience:'CEO IBERFIT',
  language:'es',
  privateProduct:true,
  brand:freeze({
    officialIsotypeOnly:true,
    inventedMarksAllowed:false,
    palette:freeze({
      fondo:'#06110D',
      verde:'#436A52',
      verdeTenue:'#243F33',
      dorado:'#FBDD8B',
      crema:'#F2E8D3',
    }),
  }),
  privacy:freeze({
    showClientFullName:false,
    showClientInitials:false,
    showPhone:false,
    showEmail:false,
    showDiagnosis:false,
    showPayments:false,
    showClinicalNotes:false,
    publicSurfacePolicy:'solo contexto operativo no identificable',
  }),
  architecture:freeze({
    watchFaceBundle:'WFF',
    nativeWearApp:'separada',
    nativeTelemetryProvider:'wear_os_health_services',
    historicalProvider:'samsung_health',
  }),
});

const asInt=(value,{min=0,max=Number.MAX_SAFE_INTEGER}={})=>{
  const n=Number(value);
  if(!Number.isFinite(n))return null;
  const rounded=Math.round(n);
  return rounded>=min&&rounded<=max?rounded:null;
};
const safeText=(value,{max=24}={})=>String(value||'').trim().replace(/\s+/g,' ').slice(0,max);
const hhmm=(value)=>{
  if(!value)return null;
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
};
const duration=(seconds)=>{
  const total=asInt(seconds,{min:0,max:60*60*24});
  if(total===null)return null;
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

export function ceoWatchModeDefinition(mode){
  const key=String(mode||'').trim().toLowerCase();
  return CEO_WATCH_MODES[key]||null;
}

export function sanitizeCeoWatchPayload(input={}){
  const source=input&&typeof input==='object'?input:{};
  const forbidden=new Set([
    'clientName','clientFullName','clientInitials','name','fullName','phone','telefono','email','diagnosis','diagnostico','clinicalNotes','notasClinicas','payment','payments','pagos','amount','rut','dni','address','direccion',
  ]);
  const output={};
  for(const [key,value] of Object.entries(source)){
    if(forbidden.has(key))continue;
    if(value===undefined)continue;
    output[key]=value;
  }
  return freeze(output);
}

function common({batteryPercent=null,now=new Date()}={}){
  return freeze({
    bateria:asInt(batteryPercent,{min:0,max:100}),
    hora:hhmm(now),
  });
}

export function buildCeoWatchViewModel({
  mode='clasico',
  now=new Date(),
  batteryPercent=null,
  agenda={},
  session={},
  telemetry={},
}={}){
  const definition=ceoWatchModeDefinition(mode);
  if(!definition)throw new Error('M26_CEO_WATCH_MODE_INVALID');
  const base=common({batteryPercent,now});

  if(definition.id==='clasico'){
    const date=now instanceof Date?now:new Date(now);
    return freeze({mode:definition.id,label:definition.label,...base,fecha:Number.isNaN(date.getTime())?null:new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short'}).format(date).toUpperCase()});
  }

  if(definition.id==='control'){
    const safe=sanitizeCeoWatchPayload(agenda);
    return freeze({
      mode:definition.id,label:definition.label,...base,
      proximaSesion:hhmm(safe.nextSessionAt),
      sesionesHoy:asInt(safe.sessionsToday,{min:0,max:30})??0,
      seguimientosPendientes:asInt(safe.pendingFollowups,{min:0,max:99})??0,
      iriPendientes:asInt(safe.pendingIri,{min:0,max:99})??0,
      estado:(asInt(safe.pendingFollowups,{min:0,max:99})||asInt(safe.pendingIri,{min:0,max:99}))?'PENDIENTES':'AL DÍA',
    });
  }

  if(definition.id==='sesion'){
    const safe=sanitizeCeoWatchPayload(session);
    const currentSet=asInt(safe.currentSet,{min:0,max:99});
    const totalSets=asInt(safe.totalSets,{min:0,max:99});
    return freeze({
      mode:definition.id,label:definition.label,...base,
      tiempoSesion:duration(safe.elapsedSeconds),
      ejercicioActual:safeText(safe.currentExercise,{max:20})||null,
      serieActual:currentSet!==null&&totalSets!==null?`${currentSet} / ${totalSets}`:null,
      descanso:duration(safe.restSeconds),
      siguienteEjercicio:safeText(safe.nextExercise,{max:20})||null,
      proximaSesion:hhmm(safe.nextSessionAt),
    });
  }

  const safe=sanitizeCeoWatchPayload(telemetry);
  return freeze({
    mode:definition.id,label:definition.label,...base,
    tiempoEntreno:duration(safe.elapsedSeconds),
    fc:asInt(safe.heartRateBpm,{min:25,max:240}),
    zona:safeText(safe.zoneLabel,{max:8}).toUpperCase()||null,
    fcMedia:asInt(safe.averageHeartRateBpm,{min:25,max:240}),
    fcMax:asInt(safe.maxHeartRateBpm,{min:25,max:240}),
    kcal:asInt(safe.activeEnergyKcal,{min:0,max:10000}),
  });
}

export function ceoWatchLaunchGate({isotypeOfficial=false,visibleLanguage='es',modes=[]}={}){
  const required=Object.keys(CEO_WATCH_MODES);
  const supplied=new Set((Array.isArray(modes)?modes:[]).map((item)=>String(item).toLowerCase()));
  const issues=[];
  if(isotypeOfficial!==true)issues.push('ISOTIPO_OFICIAL_REQUERIDO');
  if(String(visibleLanguage).toLowerCase()!=='es')issues.push('INTERFAZ_DEBE_ESTAR_EN_ESPANOL');
  for(const mode of required)if(!supplied.has(mode))issues.push(`MODO_FALTANTE_${mode.toUpperCase()}`);
  return freeze({ok:issues.length===0,issues:freeze(issues)});
}
