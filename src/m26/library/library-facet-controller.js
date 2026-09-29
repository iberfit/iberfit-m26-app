const FACET_TAG='m26-library-facet-controller';
const FACET_KEYS=Object.freeze(['equipment','pattern','difficulty','intent']);
const ADMIN_FACET_KEYS=Object.freeze(['difficulty','intent']);
const facetCache=Object.fromEntries(FACET_KEYS.map((key)=>[key,new Map()]));
const adminFacetState={difficulty:'',intent:''};
let lastRole='';

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

export function normalizeLibraryFacet(value){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim();
}

function humanizeFacet(value){
  const text=String(value??'').replaceAll('_',' ').trim();
  return text?`${text.slice(0,1).toLocaleUpperCase('es')}${text.slice(1)}`:'';
}

export function libraryFacetValues(items=[],key=''){
  if(!FACET_KEYS.includes(key))return Object.freeze([]);
  const values=new Map();
  for(const item of Array.isArray(items)?items:[]){
    const raw=String(item?.[key]??'').trim();
    const normalized=normalizeLibraryFacet(raw);
    if(raw&&normalized&&!values.has(normalized))values.set(normalized,raw);
  }
  return Object.freeze([...values.values()].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})));
}

function facetPayload(items=[]){
  return Object.fromEntries(FACET_KEYS.map((key)=>[key,libraryFacetValues(items,key)]));
}

function mergeFacetPayload(payload={}){
  for(const key of FACET_KEYS){
    const cache=facetCache[key];
    for(const raw of Array.isArray(payload?.[key])?payload[key]:[]){
      const normalized=normalizeLibraryFacet(raw);
      if(normalized&&!cache.has(normalized))cache.set(normalized,String(raw).trim());
    }
  }
}

function cachedFacetValues(key){
  return [...(facetCache[key]?.values?.()||[])].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
}

function parsedPayload(element){
  try{return JSON.parse(element.getAttribute('data-library-facets')||'{}')||{};}catch{return {};}
}

function replaceSelectOptions(select,values,allLabel,{selectedValue=select?.value||''}={}){
  if(!select?.ownerDocument)return;
  const documentLike=select.ownerDocument;
  const normalizedSelected=normalizeLibraryFacet(selectedValue);
  const options=[];
  const all=documentLike.createElement('option');
  all.value='';
  all.textContent=allLabel;
  options.push(all);
  for(const raw of values){
    const option=documentLike.createElement('option');
    option.value=String(raw);
    option.textContent=humanizeFacet(raw);
    options.push(option);
  }
  select.replaceChildren(...options);
  const matching=values.find((value)=>normalizeLibraryFacet(value)===normalizedSelected);
  select.value=matching||'';
}

function ensureAdminFacetControl(controls,key,label,allLabel){
  const documentLike=controls?.ownerDocument;
  if(!documentLike)return null;
  let wrapper=controls.querySelector(`[data-library-admin-facet="${key}"]`);
  if(!wrapper){
    wrapper=documentLike.createElement('label');
    wrapper.dataset.libraryAdminFacet=key;
    wrapper.append(documentLike.createTextNode(label));
    const select=documentLike.createElement('select');
    select.dataset.libraryFilter=key;
    wrapper.append(select);
    const visualLabel=controls.querySelector('[data-library-filter="visual"]')?.closest?.('label');
    if(visualLabel)controls.insertBefore(wrapper,visualLabel);
    else controls.insertBefore(wrapper,controls.querySelector('[data-library-clear]')||null);
  }
  const select=wrapper.querySelector(`[data-library-filter="${key}"]`);
  replaceSelectOptions(select,cachedFacetValues(key),allLabel,{selectedValue:adminFacetState[key]});
  adminFacetState[key]=normalizeLibraryFacet(select?.value||'');
  return wrapper;
}

function removeAdminFacetControls(controls){
  for(const node of controls?.querySelectorAll?.('[data-library-admin-facet]')||[])node.remove?.();
  for(const key of ADMIN_FACET_KEYS)adminFacetState[key]='';
}

function allowedFilterKeys(role){
  if(role==='admin')return new Set(['equipment','pattern','difficulty','intent','visual']);
  if(role==='coach')return new Set(['equipment','pattern']);
  return new Set();
}

function syncControlVisibility(controls,role){
  const allowed=allowedFilterKeys(role);
  for(const select of controls?.querySelectorAll?.('[data-library-filter]')||[]){
    const key=String(select.getAttribute('data-library-filter')||'');
    const wrapper=select.closest?.('label')||select;
    const visible=allowed.has(key);
    wrapper.hidden=!visible;
    if(!visible)select.value='';
  }
  const clear=controls?.querySelector?.('[data-library-clear]');
  if(clear)clear.textContent=role==='client'?'Limpiar búsqueda':'Limpiar filtros';
}

function bindFacetState(controls){
  if(!controls||controls.__iberfitLibraryFacetBound)return;
  controls.__iberfitLibraryFacetBound=true;
  controls.addEventListener('change',(event)=>{
    const select=event.target?.closest?.('[data-library-filter="difficulty"],[data-library-filter="intent"]');
    if(!select)return;
    const key=String(select.getAttribute('data-library-filter')||'');
    if(ADMIN_FACET_KEYS.includes(key))adminFacetState[key]=normalizeLibraryFacet(select.value);
  });
  controls.addEventListener('click',(event)=>{
    if(!event.target?.closest?.('[data-library-clear]'))return;
    for(const key of ADMIN_FACET_KEYS)adminFacetState[key]='';
  });
}

export function libraryCardMatchesFacets(dataset={},filters={}){
  const difficulty=normalizeLibraryFacet(dataset.libraryDifficulty??dataset.difficulty);
  const intent=normalizeLibraryFacet(dataset.libraryIntent??dataset.intent);
  const selectedDifficulty=normalizeLibraryFacet(filters.difficulty);
  const selectedIntent=normalizeLibraryFacet(filters.intent);
  if(selectedDifficulty&&difficulty!==selectedDifficulty)return false;
  if(selectedIntent&&intent!==selectedIntent)return false;
  return true;
}

function applyAdminDomFacets(element){
  if(String(element.getAttribute('data-library-role')||'')!=='admin')return;
  const grid=element.closest?.('[data-library-grid]');
  const panel=element.closest?.('.m26-panel');
  if(!grid||!panel)return;
  const filters={...adminFacetState};
  let visibleCount=0;
  for(const card of grid.querySelectorAll?.('.m26-library-card')||[]){
    const visible=libraryCardMatchesFacets(card.dataset,filters);
    card.hidden=!visible;
    if(visible)visibleCount+=1;
  }
  for(const group of grid.querySelectorAll?.('.m26-library-group')||[]){
    const visible=[...(group.querySelectorAll?.('.m26-library-card')||[])].filter((card)=>!card.hidden).length;
    group.hidden=visible===0;
    const count=group.querySelector?.('.m26-library-group-heading span');
    if(count)count.textContent=`${visible} ${visible===1?'ejercicio':'ejercicios'}`;
  }
  let empty=grid.querySelector?.('[data-library-admin-empty]');
  if(visibleCount===0){
    if(!empty&&grid.ownerDocument){
      empty=grid.ownerDocument.createElement('p');
      empty.className='m26-empty-copy';
      empty.dataset.libraryAdminEmpty='';
      empty.textContent='No hay ejercicios que coincidan con estos filtros.';
      grid.append(empty);
    }
    if(empty)empty.hidden=false;
  }else if(empty)empty.hidden=true;
  const status=panel.querySelector?.('[data-library-status]');
  if(status)status.textContent=`${visibleCount} ${visibleCount===1?'ejercicio visible':'ejercicios visibles'} con los filtros actuales.`;
}

function syncLibraryFacetController(element){
  const role=String(element.getAttribute('data-library-role')||'coach').trim().toLowerCase();
  if(lastRole&&lastRole!==role){
    for(const key of ADMIN_FACET_KEYS)adminFacetState[key]='';
  }
  lastRole=role;
  mergeFacetPayload(parsedPayload(element));
  const panel=element.closest?.('.m26-panel');
  const controls=panel?.querySelector?.('.m26-library-controls');
  if(!controls)return;
  controls.dataset.libraryRole=role;
  bindFacetState(controls);

  const equipment=controls.querySelector?.('[data-library-filter="equipment"]');
  const pattern=controls.querySelector?.('[data-library-filter="pattern"]');
  if(equipment)replaceSelectOptions(equipment,cachedFacetValues('equipment'),'Todo el material');
  if(pattern)replaceSelectOptions(pattern,cachedFacetValues('pattern'),'Todos los patrones');

  if(role==='admin'){
    ensureAdminFacetControl(controls,'difficulty','Dificultad','Todas');
    ensureAdminFacetControl(controls,'intent','Objetivo','Todos');
  }else removeAdminFacetControls(controls);

  syncControlVisibility(controls,role);
  globalThis.queueMicrotask?.(()=>applyAdminDomFacets(element));
}

if(globalThis.customElements&&globalThis.HTMLElement&&!globalThis.customElements.get(FACET_TAG)){
  class LibraryFacetControllerElement extends globalThis.HTMLElement{
    connectedCallback(){syncLibraryFacetController(this);}
  }
  globalThis.customElements.define(FACET_TAG,LibraryFacetControllerElement);
}

export function renderLibraryFacetController(items=[],{role='coach'}={}){
  const payload=facetPayload(items);
  return `<${FACET_TAG} hidden data-library-role="${escapeHtml(role)}" data-library-facets="${escapeHtml(JSON.stringify(payload))}"></${FACET_TAG}>`;
}
