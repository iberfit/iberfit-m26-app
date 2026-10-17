/* Confirmed executions are already scoped to the authenticated client by
 * the canonical data model. Only display completed results, not raw events,
 * private Coach notes, tokens, or unconfirmed work-in-progress. */
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const completed=new Set(['completada','completado','completed']);
function safeDate(value){
  if(!value)return 'Fecha pendiente';
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))return 'Fecha pendiente';
  return new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'long',year:'numeric',
    timeZone:'America/Santiago'}).format(parsed);
}
export function renderCompletedSessionHistory(vm,{hideEmpty=false}={}){
  const entries=(Array.isArray(vm?.executions)?vm.executions:[])
    .filter(item=>completed.has(String(item?.statusRaw||item?.body?.status||'').toLowerCase()))
    .sort((a,b)=>String(b?.body?.completedAt||b?.date||'')
      .localeCompare(String(a?.body?.completedAt||a?.date||'')))
    .slice(0,12);
  // When the current Client has neither published sessions nor any confirmed
  // execution, the introductory empty state already explains what happens next.
  if(hideEmpty&&entries.length===0)return '';
  const titles=new Map((vm?.rc39?.sessionProjections||[])
    .filter(item=>item?.id)
    .map(item=>[String(item.id),String(item.title||'').trim()]));
  const content=entries.map(item=>{
    const body=item?.body&&typeof item.body==='object'?item.body:{};
    const sessionId=String(body.sessionId||'');
    const title=titles.get(sessionId)
      ||String(body.sourceSnapshot?.title||body.planSnapshot?.title||'').trim()
      ||(item?.title&&item.title!=='Registro'?String(item.title):'Entrenamiento realizado');
    const resultRows=body.results;
    const count=Array.isArray(resultRows)?resultRows.length:
      resultRows&&typeof resultRows==='object'?Object.keys(resultRows).length:0;
    const effort=Number(body.feedback?.sessionRpe);
    const effortTag=body.feedback?.sessionRpe!==undefined
      &&Number.isFinite(effort)&&effort>=0&&effort<=10
      ?`<span>Esfuerzo percibido ${escape(effort)}/10</span>`:'';
    return `<article class="m26-rc39-history-item" data-m43-completed-session>
      <div><p class="m26-eyebrow">Sesión confirmada</p>
      <h4>${escape(title)}</h4><p>${escape(safeDate(body.completedAt||item.date))}</p></div>
      <div class="m26-rc39-history-item__metrics">
        ${count?`<span>${escape(count)} registros</span>`:''}${effortTag}
        <span class="m26-badge is-success">Completada</span>
      </div></article>`;
  }).join('');
  return `<section class="m26-panel m26-rc39-history" data-m43-session-history
    aria-label="Historial de entrenamientos">
    <div class="m26-panel-heading"><div><p class="m26-eyebrow">Tu progreso real</p>
    <h3>Sesiones realizadas</h3>
    <p>Entrenamientos finalizados y confirmados en tu expediente.</p></div></div>
    ${content?`<div class="m26-rc39-history-list">${content}</div>`:
      '<p class="m26-rc39-history-empty">Cuando completes una sesión, aparecerá aquí después de confirmarse.</p>'}
  </section>`;
}
