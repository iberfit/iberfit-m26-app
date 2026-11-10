// Decision support for Coach, using already owner-scoped, confirmed preparation.
// No scoring of health, automatic changes of training load, diagnosis or writes.
const MAX_CHECKIN_AGE_HOURS=72;
const ADVERSE_TRENDS=new Set(['energy','sleep','stress','fatigue','motivation']);
function score(value){
  return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10?value:null;
}
function recentTime(when,now,hours){
  if(typeof when!=='string'||!when.trim())return false;
  const at=Date.parse(when);
  return Number.isFinite(at)&&Number.isFinite(now)&&at<=now&&now-at<=hours*3600000;
}
function entry(kind,title,detail,source){
  return Object.freeze({kind,title,detail,source});
}
export function buildCoachSessionReviewCues(prep){
  const noEvidence=()=>Object.freeze({
    state:'insufficient-evidence',items:Object.freeze([]),
    automaticChange:false,coachReviewRequired:true,
  });
  if(prep?.kind!=='next-session-preparation'||prep?.safety?.coachConfirmationRequired!==true)return noEvidence();
  const now=Date.parse(prep.generatedAt);
  if(!Number.isFinite(now))return noEvidence();
  const items=[];
  const recent=recentTime(prep.progress?.latestCheckinAt,now,MAX_CHECKIN_AGE_HOURS);
  const checkin=prep.progress?.latestCheckin||{};
  const pain=recent?score(checkin.pain):null;
  if(pain!==null&&pain>0){
    items.push(entry('pain','Dolor comunicado',
      'Preguntar por localización, evolución y movimientos que producen molestias. Revisar alternativas o la conveniencia de entrenar antes de confirmar la sesión.',
      'Check-in confirmado reciente · dolor '+pain+'/10'));
  }
  const factors=recent?[
    ['energía',score(checkin.energy),value=>value<=3],
    ['sueño',score(checkin.sleep),value=>value<=3],
    ['estrés',score(checkin.stress),value=>value>=7],
    ['fatiga',score(checkin.fatigue),value=>value>=7],
  ].filter(([,value,adverse])=>value!==null&&adverse(value)):[];
  if(factors.length){
    items.push(entry('wellbeing','Condiciones del día',
      'Confirmar con la persona cómo se encuentra; si procede, valorar menos exigencia, más descanso o una variante antes de prescribir cualquier cambio.',
      'Percepción voluntaria confirmada: '+factors.map(([label,value])=>label+' '+value+'/10').join(' · ')));
  }
  const signals=recent&&prep.wellbeingShift?.available===true
    ?(Array.isArray(prep.wellbeingShift.signals)?prep.wellbeingShift.signals:[])
      .filter(row=>row&&ADVERSE_TRENDS.has(row.key)&&typeof row.delta==='number'
        &&Number.isFinite(row.delta)&&Math.abs(row.delta)>=2)
    :[];
  if(signals.length){
    items.push(entry('trend','Cambio respecto a registros anteriores',
      'Contrastar el cambio de bienestar con el Cliente. Revisar intensidad, volumen o recuperación solo después de escuchar su contexto.',
      'Comparación de cuatro check-ins · '+signals.slice(0,2).map(row=>String(row.key)).join(', ')));
  }
  // Wearable summaries are single-provider contextual daily records; even
  // recent data must never be treated as a medical recovery threshold.
  const wearable=prep.deviceContext||{};
  if(!items.length&&wearable.status==='recent'&&
      Number.isFinite(wearable.metrics?.sleepMinutes)&&
      wearable.metrics.sleepMinutes>=0&&wearable.metrics.sleepMinutes<=1440){
    items.push(entry('wearable','Descanso registrado',
      'Contrastar la percepción del descanso antes de decidir. Un valor diario no equivale a una medición clínica ni justifica por sí solo cambiar las cargas.',
      'Registro diario reciente de una sola fuente autorizada'));
  }
  return Object.freeze({
    state:items.length?'review-suggested':'insufficient-evidence',
    items:Object.freeze(items.slice(0,3)),
    automaticChange:false,coachReviewRequired:true,
  });
}
