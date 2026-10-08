// Sleep is persisted and normalized in minutes; only the presentation uses hours.
// Keep the value private to the data model, and make all client-facing views consistent.
export function formatSleepDuration(minutes,{perDay=false}={}){
  if(typeof minutes!=='number'||!Number.isFinite(minutes)||minutes<0)return null;
  const wholeMinutes=Math.round(minutes);
  const hours=Math.floor(wholeMinutes/60);
  const remainder=wholeMinutes%60;
  return `${hours} h ${String(remainder).padStart(2,'0')} min${perDay?'/día':''}`;
}
