const MAX_AGE_MS=120_000;
const CLIENT_PAGE_COUNT=7;
const COACH_MIN_PAGE_COUNT=13;

function reportFailure(message){
  document.documentElement.dataset.iriReportState='error';
  document.body.innerHTML=`<main class="iri-report-error" role="alert"><div><p>IBERFIT</p><h1>Informe no disponible</h1><p>${String(message||'No fue posible preparar el documento.')}</p><button type="button" data-iri-report-close>Cerrar</button></div></main>`;
  document.querySelector?.('[data-iri-report-close]')?.addEventListener?.('click',()=>globalThis.close?.());
}

async function waitForAssets(){
  const images=[...document.images];
  await Promise.all(images.map((image)=>image.complete?Promise.resolve():new Promise((resolve)=>{
    const done=()=>resolve();
    image.addEventListener('load',done,{once:true});
    image.addEventListener('error',done,{once:true});
    setTimeout(done,3000);
  })));
  if(document.fonts?.ready)await Promise.race([document.fonts.ready,new Promise((resolve)=>setTimeout(resolve,1500))]);
}

function validatedRecord(token){
  let record=null;
  try{record=JSON.parse(localStorage.getItem(token)||'null');}catch{}
  try{localStorage.removeItem(token);}catch{}
  if(!record?.html)return null;
  if(Date.now()-Number(record.createdAt||0)>MAX_AGE_MS)return null;
  if(!['client','coach'].includes(record.variant))return null;
  return record;
}

function reportPages(parsed,variant){
  const pages=[...parsed.body.querySelectorAll('.pdf-page')];
  const validCount=variant==='client'?pages.length===CLIENT_PAGE_COUNT:pages.length>=COACH_MIN_PAGE_COUNT;
  return validCount?pages:[];
}

function installToolbar(variant){
  const toolbar=document.createElement('nav');
  toolbar.className='iri-report-toolbar';
  toolbar.setAttribute('aria-label','Acciones del informe');
  toolbar.innerHTML=`<span>${variant==='client'?'Informe Cliente':'Informe Coach / Admin'}</span><button type="button" data-iri-report-print>Imprimir o guardar como PDF</button><button type="button" data-iri-report-close>Cerrar</button>`;
  toolbar.querySelector('[data-iri-report-print]')?.addEventListener('click',()=>globalThis.print?.());
  toolbar.querySelector('[data-iri-report-close]')?.addEventListener('click',()=>globalThis.close?.());
  document.body.prepend(toolbar);
}

async function load(){
  const autoPrint=new URLSearchParams(location.search).get('autoprint')!=='0'&&globalThis.navigator?.webdriver!==true;
  const token=decodeURIComponent(String(location.hash||'').slice(1));
  if(!token)return reportFailure('Falta la referencia temporal del informe. Vuelve a generarlo desde IBERFIT.');
  const record=validatedRecord(token);
  history.replaceState(null,'',location.pathname);
  if(!record)return reportFailure('La referencia del informe no existe o ha caducado. Vuelve a generarlo desde IBERFIT.');
  const parsed=new DOMParser().parseFromString(record.html,'text/html');
  const pages=reportPages(parsed,record.variant);
  if(!pages.length)return reportFailure('El documento no superó la comprobación de páginas. No se mostrará un informe incompleto.');
  document.title=parsed.title||'Informe IRI IBERFIT';
  document.body.replaceChildren(...pages.map((page)=>page.cloneNode(true)));
  installToolbar(record.variant);
  await waitForAssets();
  document.documentElement.dataset.iriReportState='ready';
  document.dispatchEvent(new CustomEvent('m26:iri-report-ready',{detail:{variant:record.variant,pages:pages.length}}));
  if(autoPrint)requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>globalThis.print?.(),250)));
}

void load().catch(()=>reportFailure('Ocurrió un error inesperado al preparar el documento. Vuelve a generarlo desde IBERFIT.'));

export const __iriReportPageInternals=Object.freeze({MAX_AGE_MS,CLIENT_PAGE_COUNT,COACH_MIN_PAGE_COUNT,validatedRecord,reportPages});
