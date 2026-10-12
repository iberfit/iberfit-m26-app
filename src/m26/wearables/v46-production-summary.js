const DAY=/^\d{4}-\d\d-\d\d$/u;
const bpm=n=>typeof n==='number'&&Number.isFinite(n)&&n>=25&&n<=240?n:null;
export function formatConnected360ProductionSummary(p){
  if(!p||p.ok!==true||p.provider!=='health_connect'||
    !Array.isArray(p.heartRateDaily)||!Array.isArray(p.exerciseEvidence))
    throw new Error('M26_V46_PROD_SUMMARY_INVALID');
  const days=p.heartRateDaily.slice(0,7).filter(x=>DAY.test(String(x?.date||'')));
  days.sort((a,b)=>b.date.localeCompare(a.date));
  const day=days[0],activities=p.exerciseEvidence.slice(0,10).length;
  if(!day&&activities===0)return 'Todavía no hay mediciones sincronizadas en IBERFIT. Comprueba los permisos de Android. Al volver a abrir IBERFIT se intentará sincronizar automáticamente.';
  const minimum=bpm(day?.minBpm),maximum=bpm(day?.maxBpm);
  const count=Number.isSafeInteger(day?.samples)&&day.samples>=0&&day.samples<=200000?day.samples:null;
  const general=day?'FC general del '+day.date+(count!==null?' · '+count+' mediciones':'')+
    (minimum!==null&&maximum!==null&&minimum<=maximum?' · rango '+minimum+'–'+maximum+' lpm':''):
    'Sin frecuencia cardíaca general registrada';
  return general+'. Actividades observadas (7 días): '+activities+
    '. No son entrenamientos confirmados. La FC general no equivale a FC en reposo; el origen físico del reloj no está verificado.';
}
