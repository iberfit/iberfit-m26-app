import Fuse from '../vendor/fuse-7.5.0.basic.min.js';

export const COACH_PRODUCTIVITY_SCHEMA_VERSION='iberfit.coach-productivity.v1';
export const FUSE_COACH_PRODUCTIVITY_VERSION='7.5.0';
export const COACH_PRODUCTIVITY_MAX_SAVED_VIEWS=10;
export const COACH_PRODUCTIVITY_MAX_RECENTS=6;

const DEFAULT_FUSE_OPTIONS=Object.freeze({
  includeScore:true,
  ignoreLocation:true,
  threshold:0.36,
  minMatchCharLength:2,
});

function text(value,max=300){
  return String(value??'').trim().slice(0,max);
}

export function foldCoachSearch(value){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu,'')
    .toLowerCase()
    .replace(/\s+/gu,' ')
    .trim();
}

function uniqueBy(items,keyOf){
  const seen=new Set();
  const out=[];
  for(const item of items){
    const key=keyOf(item);
    if(!key||seen.has(key))continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function safePriority(value){
  const number=Number(value);
  return Number.isFinite(number)?number:99;
}

export function normalizeClientSearchDocument(input={},index=0){
  return Object.freeze({
    id:text(input.id??index,160)||String(index),
    name:text(input.name,180),
    text:foldCoachSearch(input.text),
    iri:foldCoachSearch(input.iri),
    modality:foldCoachSearch(input.modality),
    stage:foldCoachSearch(input.stage),
    priority:safePriority(input.priority),
    index:Number.isFinite(Number(index))?Number(index):0,
  });
}

export function rankCoachClientDocuments(documents=[],{
  query='',
  filters={},
  sort='priority',
}={}){
  const normalized=(Array.isArray(documents)?documents:[])
    .map((item,index)=>normalizeClientSearchDocument(item,index));
  const normalizedFilters={
    iri:foldCoachSearch(filters?.iri),
    modality:foldCoachSearch(filters?.modality),
    stage:foldCoachSearch(filters?.stage),
  };
  const filtered=normalized.filter((item)=>{
    if(normalizedFilters.iri&&item.iri!==normalizedFilters.iri)return false;
    if(normalizedFilters.modality&&!item.modality.includes(normalizedFilters.modality))return false;
    if(normalizedFilters.stage&&item.stage!==normalizedFilters.stage)return false;
    return true;
  });
  const q=foldCoachSearch(query);
  if(q){
    const fuse=new Fuse(filtered,{
      ...DEFAULT_FUSE_OPTIONS,
      keys:[
        {name:'name',weight:0.44},
        {name:'text',weight:0.56},
      ],
    });
    return Object.freeze(fuse.search(q).map((result)=>result.item));
  }
  const ordered=[...filtered].sort((a,b)=>
    sort==='name'
      ?a.name.localeCompare(b.name,'es',{sensitivity:'base'})||a.index-b.index
      :a.priority-b.priority||a.name.localeCompare(b.name,'es',{sensitivity:'base'})||a.index-b.index
  );
  return Object.freeze(ordered);
}

export function buildCoachCommandEntries({areas=[],clients=[],selectedClientId=null}={}){
  const areaEntries=uniqueBy(
    (Array.isArray(areas)?areas:[])
      .map((item)=>({
        id:`area:${text(item?.area,100)}`,
        type:'area',
        target:text(item?.area,100),
        label:text(item?.label,160)||text(item?.area,100),
        group:'Navegación',
        keywords:foldCoachSearch(`${item?.label||''} ${item?.area||''} abrir ir módulo`),
      }))
      .filter((item)=>item.target&&item.label),
    (item)=>item.id
  );
  const clientEntries=uniqueBy(
    (Array.isArray(clients)?clients:[])
      .map((client)=>({
        id:`client:${text(client?.id,160)}`,
        type:'client',
        target:text(client?.id,160),
        label:`Abrir ${text(client?.name,160)||'cliente'}`,
        group:'Clientes',
        keywords:foldCoachSearch([
          client?.name,
          client?.modality,
          client?.profile?.primaryObjective,
          client?.experience?.stageLabel,
          client?.id===selectedClientId?'expediente activo':'',
        ].filter(Boolean).join(' ')),
      }))
      .filter((item)=>item.target),
    (item)=>item.id
  );
  return Object.freeze([...areaEntries,...clientEntries].map(Object.freeze));
}

export function rankCoachCommandEntries(entries=[],query='',{limit=12}={}){
  const safeEntries=Array.isArray(entries)?entries:[];
  const q=foldCoachSearch(query);
  if(!q)return Object.freeze(safeEntries.slice(0,Math.max(1,Number(limit)||12)));
  const fuse=new Fuse(safeEntries,{
    ...DEFAULT_FUSE_OPTIONS,
    threshold:0.4,
    keys:[
      {name:'label',weight:0.56},
      {name:'keywords',weight:0.32},
      {name:'group',weight:0.12},
    ],
  });
  return Object.freeze(
    fuse.search(q,{limit:Math.max(1,Number(limit)||12)}).map((result)=>result.item)
  );
}

export function coachProductivityStorageKey(ownerId){
  const owner=text(ownerId,180).replace(/[^a-zA-Z0-9._-]/gu,'_');
  if(!owner)throw new Error('M26_COACH_PRODUCTIVITY_OWNER_REQUIRED');
  return `iberfit-m26:coach-productivity:${owner}`;
}

export function normalizeCoachSavedView(input={}){
  const name=text(input.name,60);
  if(!name)throw new Error('M26_COACH_SAVED_VIEW_NAME_REQUIRED');
  return Object.freeze({
    id:text(input.id,120)||`view-${Date.now()}`,
    name,
    query:text(input.query,160),
    iri:text(input.iri,40),
    modality:text(input.modality,60),
    stage:text(input.stage,60),
    sort:['priority','name'].includes(String(input.sort||''))?String(input.sort):'priority',
    updatedAt:text(input.updatedAt,60)||new Date().toISOString(),
  });
}

function emptyWorkspace(){
  return {schemaVersion:COACH_PRODUCTIVITY_SCHEMA_VERSION,savedViews:[],recents:[]};
}

function readWorkspace(storage,key){
  if(!storage?.getItem)return emptyWorkspace();
  try{
    const parsed=JSON.parse(storage.getItem(key)||'null');
    if(!parsed||typeof parsed!=='object')return emptyWorkspace();
    const savedViews=(Array.isArray(parsed.savedViews)?parsed.savedViews:[])
      .map((item)=>{
        try{return normalizeCoachSavedView(item);}catch{return null;}
      })
      .filter(Boolean)
      .slice(0,COACH_PRODUCTIVITY_MAX_SAVED_VIEWS);
    const recents=uniqueBy(
      (Array.isArray(parsed.recents)?parsed.recents:[])
        .map((value)=>text(value,160))
        .filter(Boolean),
      (value)=>value
    ).slice(0,COACH_PRODUCTIVITY_MAX_RECENTS);
    return {schemaVersion:COACH_PRODUCTIVITY_SCHEMA_VERSION,savedViews,recents};
  }catch{
    return emptyWorkspace();
  }
}

function writeWorkspace(storage,key,workspace){
  if(!storage?.setItem)return false;
  try{
    storage.setItem(key,JSON.stringify({
      schemaVersion:COACH_PRODUCTIVITY_SCHEMA_VERSION,
      savedViews:(workspace.savedViews||[]).slice(0,COACH_PRODUCTIVITY_MAX_SAVED_VIEWS),
      recents:(workspace.recents||[]).slice(0,COACH_PRODUCTIVITY_MAX_RECENTS),
    }));
    return true;
  }catch{
    return false;
  }
}

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function currentClientFilterState(root){
  const value=(selector)=>text(root.querySelector?.(selector)?.value,160);
  return {
    query:value('[data-client-search]'),
    iri:value('[data-client-filter="iri"]'),
    modality:value('[data-client-filter="modality"]'),
    stage:value('[data-client-filter="stage"]'),
    sort:value('[data-client-sort]')||'priority',
  };
}

function dispatchInput(node){
  if(!node?.dispatchEvent)return;
  const EventCtor=globalThis.Event;
  if(typeof EventCtor==='function')node.dispatchEvent(new EventCtor('input',{bubbles:true}));
}

function renderCommandResult(entry){
  const action=entry.type==='client'
    ?`data-m26-select-client="${escapeHtml(entry.target)}"`
    :`data-m26-area="${escapeHtml(entry.target)}"`;
  return `<button type="button" class="m26-coach-command-result" data-coach-command-result="${escapeHtml(entry.id)}" ${action}><span>${escapeHtml(entry.label)}</span><small>${escapeHtml(entry.group)}</small></button>`;
}

export function createCoachProductivityController({
  root,
  store,
  ownerId,
  storage=globalThis.localStorage,
}={}){
  if(!root?.addEventListener||!store?.getState)throw new Error('M26_COACH_PRODUCTIVITY_REQUIRED');
  const storageKey=coachProductivityStorageKey(ownerId);
  let mounted=false;
  let observer=null;
  let hydrationQueued=false;

  function workspace(){return readWorkspace(storage,storageKey);}
  function persist(next){return writeWorkspace(storage,storageKey,next);}
  function role(){return String(store.getState()?.identity?.role||'').toLowerCase();}
  function enabled(){return ['coach','admin'].includes(role());}

  function commandAreas(){
    const items=[];
    for(const node of root.querySelectorAll?.('[data-m26-area]')||[]){
      const area=text(node.getAttribute?.('data-m26-area'),100);
      const label=text(node.textContent,160);
      if(area&&label)items.push({area,label});
    }
    return uniqueBy(items,(item)=>item.area);
  }

  function commandEntries(){
    const state=store.getState();
    return buildCoachCommandEntries({
      areas:commandAreas(),
      clients:state?.collections?.clients||[],
      selectedClientId:state?.selectedClientId||null,
    });
  }

  function renderPalette(query=''){
    const host=root.querySelector?.('[data-coach-command-results]');
    if(!host)return [];
    const results=rankCoachCommandEntries(commandEntries(),query,{limit:14});
    host.innerHTML=results.length
      ?results.map(renderCommandResult).join('')
      :'<p class="m26-coach-command-empty">Sin coincidencias dentro de tu alcance actual.</p>';
    const status=root.querySelector?.('[data-coach-command-status]');
    if(status)status.textContent=`${results.length} ${results.length===1?'resultado':'resultados'}.`;
    return results;
  }

  function openPalette(){
    if(!enabled())return false;
    const palette=root.querySelector?.('[data-coach-command-palette]');
    const input=root.querySelector?.('[data-coach-command-search]');
    if(!palette||!input)return false;
    palette.hidden=false;
    palette.setAttribute('data-open','true');
    input.value='';
    renderPalette('');
    queueMicrotask(()=>input.focus?.({preventScroll:false}));
    return true;
  }

  function closePalette(){
    const palette=root.querySelector?.('[data-coach-command-palette]');
    if(!palette)return false;
    palette.hidden=true;
    palette.removeAttribute('data-open');
    return true;
  }

  function status(message,kind='info'){
    const node=root.querySelector?.('[data-coach-productivity-status]');
    if(!node)return;
    node.textContent=String(message||'');
    node.dataset.status=kind;
  }

  function savedViewOptions(){
    const select=root.querySelector?.('[data-coach-saved-view]');
    if(!select)return;
    const current=String(select.value||'');
    const views=workspace().savedViews;
    select.innerHTML='<option value="">Seleccionar vista…</option>'+views.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
    if(views.some((item)=>item.id===current))select.value=current;
  }

  function renderRecents(){
    const host=root.querySelector?.('[data-coach-recents]');
    if(!host)return;
    const state=store.getState();
    const byId=new Map((state?.collections?.clients||[]).map((client)=>[String(client.id),client]));
    const recentClients=workspace().recents.map((id)=>byId.get(id)).filter(Boolean);
    host.innerHTML=recentClients.length
      ?`<span>Recientes</span>${recentClients.map((client)=>`<button type="button" data-m26-select-client="${escapeHtml(client.id)}">${escapeHtml(client.name||'Cliente')}</button>`).join('')}`
      :'<span>Recientes</span><small>Aparecerán al abrir expedientes.</small>';
  }

  function hydrate(){
    hydrationQueued=false;
    if(!enabled())return;
    savedViewOptions();
    renderRecents();
  }

  function queueHydrate(){
    if(hydrationQueued)return;
    hydrationQueued=true;
    queueMicrotask(hydrate);
  }

  function rememberClient(clientId){
    const id=text(clientId,160);
    if(!id)return;
    const state=workspace();
    const recents=[id,...state.recents.filter((item)=>item!==id)]
      .slice(0,COACH_PRODUCTIVITY_MAX_RECENTS);
    persist({...state,recents});
    renderRecents();
  }

  function saveView(){
    const name=text(root.querySelector?.('[data-coach-view-name]')?.value,60);
    if(!name){status('Escribe un nombre para guardar esta vista.','error');return false;}
    const filters=currentClientFilterState(root);
    const current=workspace();
    const existing=current.savedViews.find((item)=>foldCoachSearch(item.name)===foldCoachSearch(name));
    const saved=normalizeCoachSavedView({...filters,name,id:existing?.id});
    const savedViews=[saved,...current.savedViews.filter((item)=>item.id!==saved.id)]
      .slice(0,COACH_PRODUCTIVITY_MAX_SAVED_VIEWS);
    if(!persist({...current,savedViews})){
      status('No fue posible guardar la vista en este dispositivo.','error');
      return false;
    }
    const nameInput=root.querySelector?.('[data-coach-view-name]');
    if(nameInput)nameInput.value='';
    savedViewOptions();
    const select=root.querySelector?.('[data-coach-saved-view]');
    if(select)select.value=saved.id;
    status(`Vista “${saved.name}” guardada en este dispositivo.`,'success');
    return true;
  }

  function applyView(id){
    const view=workspace().savedViews.find((item)=>item.id===String(id||''));
    if(!view)return false;
    const fields=[
      ['[data-client-search]',view.query],
      ['[data-client-filter="iri"]',view.iri],
      ['[data-client-filter="modality"]',view.modality],
      ['[data-client-filter="stage"]',view.stage],
      ['[data-client-sort]',view.sort],
    ];
    for(const [selector,value] of fields){
      const node=root.querySelector?.(selector);
      if(node)node.value=value;
    }
    dispatchInput(root.querySelector?.('[data-client-search]'));
    status(`Vista “${view.name}” aplicada.`,'success');
    return true;
  }

  function deleteView(){
    const select=root.querySelector?.('[data-coach-saved-view]');
    const id=String(select?.value||'');
    if(!id){status('Selecciona una vista guardada para eliminarla.','error');return false;}
    const current=workspace();
    const target=current.savedViews.find((item)=>item.id===id);
    const savedViews=current.savedViews.filter((item)=>item.id!==id);
    persist({...current,savedViews});
    savedViewOptions();
    if(select)select.value='';
    status(target?`Vista “${target.name}” eliminada.`:'Vista eliminada.','success');
    return true;
  }

  function onClick(event){
    const open=event.target.closest?.('[data-coach-command-open]');
    if(open){event.preventDefault?.();openPalette();return;}
    const close=event.target.closest?.('[data-coach-command-close]');
    if(close){event.preventDefault?.();closePalette();return;}
    const save=event.target.closest?.('[data-coach-save-view]');
    if(save){event.preventDefault?.();saveView();return;}
    const remove=event.target.closest?.('[data-coach-delete-view]');
    if(remove){event.preventDefault?.();deleteView();return;}
    const client=event.target.closest?.('[data-m26-select-client]');
    if(client&&enabled())rememberClient(client.getAttribute?.('data-m26-select-client'));
    const result=event.target.closest?.('[data-coach-command-result]');
    if(result)closePalette();
  }

  function onInput(event){
    const input=event.target.closest?.('[data-coach-command-search]');
    if(input)renderPalette(input.value);
  }

  function onChange(event){
    const saved=event.target.closest?.('[data-coach-saved-view]');
    if(saved&&saved.value)applyView(saved.value);
  }

  function onKeydown(event){
    if(!enabled())return;
    const key=String(event.key||'').toLowerCase();
    if(key==='k'&&(event.ctrlKey||event.metaKey)&&!event.altKey){
      event.preventDefault?.();
      openPalette();
      return;
    }
    const palette=root.querySelector?.('[data-coach-command-palette]');
    if(!palette||palette.hidden)return;
    if(key==='escape'){
      event.preventDefault?.();
      closePalette();
      return;
    }
    if(key==='enter'&&event.target.closest?.('[data-coach-command-search]')){
      const first=root.querySelector?.('[data-coach-command-result]');
      if(first){event.preventDefault?.();first.click?.();}
    }
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      root.addEventListener('click',onClick);
      root.addEventListener('input',onInput);
      root.addEventListener('change',onChange);
      globalThis.addEventListener?.('keydown',onKeydown);
      if(typeof globalThis.MutationObserver==='function'){
        observer=new globalThis.MutationObserver(()=>queueHydrate());
        observer.observe(root,{childList:true,subtree:true});
      }
      queueHydrate();
      mounted=true;
    },
    destroy(){
      if(!mounted)return;
      observer?.disconnect?.();
      observer=null;
      root.removeEventListener('click',onClick);
      root.removeEventListener('input',onInput);
      root.removeEventListener('change',onChange);
      globalThis.removeEventListener?.('keydown',onKeydown);
      mounted=false;
    },
    openPalette,
    closePalette,
    renderPalette,
    clearOwner(){try{storage?.removeItem?.(storageKey);return true;}catch{return false;}},
  });
}

export const __coachProductivityInternals=Object.freeze({
  readWorkspace,
  writeWorkspace,
  currentClientFilterState,
  uniqueBy,
  safePriority,
});