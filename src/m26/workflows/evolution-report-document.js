/* M44 private print preview. PDF bytes are produced by the browser's print-to-PDF flow,
 * never represented as a server-issued or published report by this module. */
const TYPES=Object.freeze({
  'post-session':'Informe post-sesión',
  weekly:'Resumen semanal',
  monthly:'Informe mensual',
  quarterly:'Informe trimestral',
  'year-in-iberfit':'Balance anual',
});
const TRUSTED_SOURCES=Object.freeze({
  sessionExecutions:'Sesiones IBERFIT confirmadas',
  'session_execution':'Sesión IBERFIT confirmada',
  'session_execution_period':'Historial de sesiones confirmadas',
  appointments:'Citas verificadas',
  checkins:'Registros de bienestar',
  'canonical-store':'Historial canónico IBERFIT',
  wearableDailySummaries:'Datos de dispositivo, solo contexto',
});
function esc(value){
  return String(value??'').replace(/[<>&"']/g,(c)=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}
function clean(value,max=2500){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function paragraphs(value,max=2500){
  const text=String(value??'').slice(0,max).replace(/\r\n?/g,'\n').trim();
  return text ? text.split(/\n{2,}/).map((p)=>'<p>'+esc(p.replace(/\n/g,' '))+'</p>').join(''):'<p class="m44-empty">Interpretación profesional pendiente.</p>';
}
function dateLabel(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return 'Fecha pendiente';
  const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));
  if(Number.isNaN(+date)||date.toISOString().slice(0,10)!==match[0])return 'Fecha pendiente';
  return new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
}
function evidenceList(rows,offset=0){
  return rows.map((item,index)=>{
    const source=TRUSTED_SOURCES[item.source]||clean(item.source,100);
    return '<li class="m44-evidence-item"><div class="m44-evidence-number">'+String(offset+index+1).padStart(2,'0')+'</div><div><h3>'+esc(clean(item.label,120))+'</h3><p>'+esc(clean(item.text,500))+'</p><small>Fuente: '+esc(source)+
      (item.quality?' · Calidad declarada: '+esc(clean(item.quality,60)):'')+'</small></div></li>';
  }).join('');
}
function footer(page,total){
  return '<footer class="m44-foot"><span><b>IBERFIT</b> · Diagnóstico, planificación, control y seguimiento</span><span>'+page+' / '+total+'</span></footer>';
}
function page(index,total,eyebrow,title,inner){
  return '<section class="m44-sheet m44-interior" aria-label="Página '+index+' de '+total+'"><header class="m44-page-head"><span class="m44-page-index">'+String(index-1).padStart(2,'0')+'</span><div><p class="m44-kicker">'+esc(eyebrow)+'</p><h2>'+esc(title)+'</h2></div></header><main class="m44-page-content">'+inner+'</main>'+footer(index,total)+'</section>';
}
export function buildEvolutionReportHtml({report,clientName='Cliente IBERFIT',coachName='Equipo IBERFIT',stylesheetHref='/m26/evolution-report.css?v=m44wip-1'}={}){
  if(!report||report.ready!==true||!Object.hasOwn(TYPES,report.id)||!Array.isArray(report.evidence)||!report.evidence.length)
    throw new Error('M44_REPORT_PREVIEW_EVIDENCE_REQUIRED');
  if(!report.periodStart||!report.periodEnd||dateLabel(report.periodStart)==='Fecha pendiente'||dateLabel(report.periodEnd)==='Fecha pendiente'||report.periodStart>report.periodEnd)
    throw new Error('M44_REPORT_PREVIEW_PERIOD_INVALID');
  if(!String(stylesheetHref).startsWith('/m26/evolution-report.css?')&&!/^https:\/\/[a-z0-9.-]+\/m26\/evolution-report\.css\?/i.test(String(stylesheetHref)))
    throw new Error('M44_REPORT_PREVIEW_STYLESHEET_UNTRUSTED');
  const lines=report.evidence.filter((item)=>item&&clean(item.label,120)&&clean(item.text,500)&&clean(item.source,120));
  if(lines.length!==report.evidence.length||lines.length>12)throw new Error('M44_REPORT_PREVIEW_EVIDENCE_INVALID');
  const name=clean(clientName,130)||'Cliente IBERFIT',coach=clean(coachName,130)||'Equipo IBERFIT';
  const title=clean(report.title,140)||TYPES[report.id];
  const maxRows=6;
  const evidenceChunks=[];
  for(let offset=0;offset<lines.length;offset+=maxRows)evidenceChunks.push(lines.slice(offset,offset+maxRows));
  const total=evidenceChunks.length+3;
  const pages=[];
  pages.push('<section class="m44-sheet m44-cover" aria-label="Portada del informe">'+
    '<div class="m44-cover-accent" aria-hidden="true"></div>'+
    '<div class="m44-brand"><img src="/public/isotipo-iberfit.png" alt="" width="66" height="66"><div><strong>IBERFIT</strong><small>ENTRENAMIENTO PERSONAL CON CRITERIO</small></div></div>'+
    '<p class="m44-cover-category">EVOLUCIÓN · SEGUIMIENTO PERSONALIZADO</p>'+
    '<h1>'+esc(TYPES[report.id])+'<span>Tu proceso,<br>con perspectiva.</span></h1>'+
    '<p class="m44-cover-description">No se trata solo de entrenar. Se trata de comprender lo realizado, valorar la evidencia y decidir con criterio qué hacer después.</p>'+
    '<div class="m44-cover-rule" aria-hidden="true"></div>'+
    '<div class="m44-cover-meta"><div><span>Preparado para</span><strong>'+esc(name)+'</strong></div><div><span>Periodo analizado</span><strong>'+esc(dateLabel(report.periodStart))+' — '+esc(dateLabel(report.periodEnd))+'</strong></div><div><span>Revisión profesional</span><strong>'+esc(coach)+'</strong></div></div>'+
    '<div class="m44-cover-bottom"><span>BORRADOR PRIVADO · VISTA PREVIA SIN PUBLICAR</span><span>IBERFIT · INFORME DE EVOLUCIÓN</span></div></section>');
  pages.push(page(2,total,'01 · LA LECTURA','Qué hemos hecho',
    '<p class="m44-section-lead">El periodo en contexto</p>'+
    '<div class="m44-prose m44-report-summary">'+paragraphs(report.summary,2500)+'</div>'+
    '<div class="m44-period-line"><div><span>Desde</span><strong>'+esc(dateLabel(report.periodStart))+'</strong></div><div><span>Hasta</span><strong>'+esc(dateLabel(report.periodEnd))+'</strong></div><div><span>Tipo de seguimiento</span><strong>'+esc(TYPES[report.id])+'</strong></div></div>'+
    '<div class="m44-reading-rule"><span>Cómo interpretar estos resultados</span><p>Los hechos describen lo que está confirmado; las conclusiones y próximos pasos corresponden a la revisión del coach. Un cambio de carga, volumen o frecuencia no implica por sí mismo una mejora funcional.</p></div>'));
  for(let i=0;i<evidenceChunks.length;i++){
    const chunk=evidenceChunks[i];
    const idx=3+i;
    pages.push(page(idx,total,'02 · EVIDENCIA','Resultados verificables',
      '<p class="m44-section-lead">Lo que podemos afirmar</p>'+
      '<p class="m44-evidence-context">Cada dato se acompaña de su procedencia. Cuando falta una medición o un protocolo comparable, no se completa por estimación.</p>'+
      '<ol class="m44-evidence-list" start="'+String(1+i*maxRows)+'">'+evidenceList(chunk,i*maxRows)+'</ol>'+
      '<p class="m44-subtle-note">Esta relación registra evidencias; no equivale a una clasificación automática del estado de salud ni a una recomendación individual.</p>'));
  }
  pages.push(page(total,total,'03 · CRITERIO PROFESIONAL','Decidir el siguiente paso',
    '<div class="m44-decision"><span>INTERPRETACIÓN PROFESIONAL</span><div class="m44-prose">'+paragraphs(report.conclusions,2500)+'</div></div>'+
    '<div class="m44-coach-voice"><span>LA MIRADA DE TU COACH</span><div class="m44-prose">'+paragraphs(report.coachComment,2500)+'</div><strong>'+esc(coach)+'</strong></div>'+
    '<div class="m44-next"><span>PRÓXIMO PASO PROPUESTO</span><div class="m44-prose">'+paragraphs(report.recommendations,2500)+'</div></div>'+
    '<div class="m44-method"><h3>Transparencia del informe</h3><p>Fuente principal: '+esc(TRUSTED_SOURCES[report.sourceType]||'Evidencia canónica IBERFIT')+'. Ventana: '+esc(dateLabel(report.periodStart))+' a '+esc(dateLabel(report.periodEnd))+'. Este documento es una previsualización; no confirma aprobación, publicación ni entrega. La evidencia de diagnóstico IRI inicial se mantiene separada de la evolución.</p><p>Los datos de dispositivos, si se utilizan, deben mostrar procedencia, frescura y calidad y nunca sustituir una sesión confirmada.</p></div>'));
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Vista previa IBERFIT · '+esc(name)+'</title><link rel="stylesheet" href="'+esc(stylesheetHref)+'" data-m44-report-css></head><body><nav class="m44-toolbar" aria-label="Acciones de la vista previa"><span data-m44-print-status>Verificando diseño A4…</span><button type="button" data-m44-print disabled>Imprimir o guardar como PDF</button><button type="button" data-m44-close>Cerrar</button></nav>'+pages.join('')+'</body></html>';
}
function pageOverflow(doc){
  return [...doc.querySelectorAll('.m44-sheet')].some((page)=>{
    const content=page.querySelector('.m44-page-content');
    const footer=page.querySelector('.m44-foot');
    if(!content||!footer)return Number(page.scrollHeight)>Number(page.clientHeight)+2;
    // Bounding rectangles alone miss clipped content in flex layouts.
    // Compare the full scroll height as well as the A4 footer boundary.
    return Number(content.scrollHeight)>Number(content.clientHeight)+2
      ||content.getBoundingClientRect().bottom>footer.getBoundingClientRect().top-8;
  });
}
async function verifyA4Layout(doc,popup,scope){
  // Mobile screen mode deliberately reflows sheets for readability. Check the
  // actual 210×297 mm desktop/print geometry in an off-screen viewport instead.
  if(!popup.matchMedia?.('(max-width: 825px)')?.matches)return !pageOverflow(doc);
  const frame=doc.createElement('iframe');
  frame.className='m44-layout-preflight';
  frame.setAttribute('aria-hidden','true');
  frame.setAttribute('tabindex','-1');
  doc.body.append(frame);
  try{
    const target=frame.contentDocument;
    if(!target?.head||!target?.body)return false;
    const link=target.createElement('link');
    link.rel='stylesheet';link.href=doc.querySelector('[data-m44-report-css]')?.href||'';
    target.head.append(link);
    target.body.replaceChildren(...[...doc.querySelectorAll('.m44-sheet')].map((page)=>target.importNode(page,true)));
    await Promise.race([
      new Promise((resolve)=>{if(link.sheet){resolve();return;}link.addEventListener('load',resolve,{once:true});link.addEventListener('error',resolve,{once:true});}),
      new Promise((resolve)=>scope.setTimeout(resolve,5000)),
    ]);
    if(!link.sheet)return false;
    await Promise.race([target.fonts?.ready||Promise.resolve(),new Promise(resolve=>scope.setTimeout(resolve,3000))]);
    const pages=[...target.querySelectorAll('.m44-sheet')];
    const geometries=pages.every(page=>{
      const styles=frame.contentWindow?.getComputedStyle(page);
      const height=parseFloat(styles?.height||'0'),width=parseFloat(styles?.width||'0');
      return height>=1050&&width>=740;
    });
    return geometries&&!pageOverflow(target);
  }finally{frame.remove();}
}
export function openEvolutionReportPreview({report,clientName,coachName,scope=globalThis}={}){
  const origin=String(scope.location?.origin||'');
  if(!/^https?:\/\/[^/]+$/i.test(origin))throw new Error('M44_REPORT_PREVIEW_ORIGIN_REQUIRED');
  const html=buildEvolutionReportHtml({report,clientName,coachName,stylesheetHref:origin+'/m26/evolution-report.css?v=m44wip-1'});
  const popup=scope.open?.('about:blank','_blank');
  if(!popup?.document)throw new Error('M44_REPORT_PREVIEW_POPUP_BLOCKED');
  try{
    popup.opener=null;
    const parsed=new popup.DOMParser().parseFromString(html,'text/html');
    popup.document.replaceChild(popup.document.importNode(parsed.documentElement,true),popup.document.documentElement);
    const doc=popup.document;
    const print=doc.querySelector('[data-m44-print]');
    const close=doc.querySelector('[data-m44-close]');
    const status=doc.querySelector('[data-m44-print-status]');
    const stylesheet=doc.querySelector('[data-m44-report-css]');
    let ready=false;
    const finish=async()=>{
      await Promise.race([doc.fonts?.ready||Promise.resolve(),new Promise((resolve)=>scope.setTimeout(resolve,3000))]);
      const logo=doc.querySelector('.m44-brand img');
      if(logo&&!logo.complete)await Promise.race([new Promise(resolve=>{logo.addEventListener('load',resolve,{once:true});logo.addEventListener('error',resolve,{once:true});}),new Promise(resolve=>scope.setTimeout(resolve,3000))]);
      if(!await verifyA4Layout(doc,popup,scope)){status.textContent='El contenido no cabe con seguridad en A4. Ajusta las notas antes de imprimir.';print.disabled=true;return;}
      ready=true;print.disabled=false;status.textContent='Vista previa privada · diseño A4 verificado';
    };
    stylesheet.addEventListener('load',()=>{void finish().catch(()=>{status.textContent='No se pudo validar el diseño.';});},{once:true});
    stylesheet.addEventListener('error',()=>{status.textContent='No se pudo cargar el diseño. No se puede imprimir.';},{once:true});
    if(stylesheet.sheet)void finish().catch(()=>{});
    print.addEventListener('click',async()=>{
      if(!ready)return;
      print.disabled=true;
      try{
        if(!await verifyA4Layout(doc,popup,scope)){
          ready=false;status.textContent='El ajuste A4 requiere revisión.';return;
        }
        popup.print();
      }catch{
        ready=false;status.textContent='No pudimos verificar el documento para imprimir.';
      }finally{print.disabled=!ready;}
    });
    close.addEventListener('click',()=>popup.close());
    popup.focus?.();
  }catch(error){try{popup.close?.();}catch{}throw error;}
  return Object.freeze({ok:true,mode:'private-a4-preview',published:false,downloaded:false});
}
export const __m44EvolutionReportTestables=Object.freeze({dateLabel,pageOverflow,esc,clean});
