const STYLE_ID='m27-exercise-history-window-styles';
const ROOT_STATE=new WeakMap();
const BOUND_ROOTS=new WeakSet();

const STYLES=`
.m27-exercise-window{display:grid;justify-items:end;gap:.3rem}
.m27-exercise-window>span{color:var(--m26-gold,#9a782d);font-size:.67rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.m27-exercise-window-actions{display:flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end}
.m27-exercise-window button{min-width:2.6rem;min-height:2.25rem;padding:.38rem .52rem;border:1px solid var(--m26-border,rgba(169,133,52,.22));border-radius:.52rem;background:transparent;color:var(--m26-text-muted,#6b675f);font:inherit;font-size:.71rem;font-weight:800;cursor:pointer}
.m27-exercise-window button[aria-pressed="true"]{border-color:var(--m26-gold,#9a782d);background:color-mix(in srgb,var(--m26-gold,#9a782d) 10%,transparent);color:var(--m26-text,#17231d)}
.m27-exercise-window-meta{display:flex;align-items:center;justify-content:flex-end;gap:.45rem;max-width:30rem;color:var(--m26-text-muted,#6b675f);font-size:.65rem;line-height:1.4;text-align:right}
.m27-exercise-window-count{font-variant-numeric:tabular-nums;color:var(--m26-text,#17231d);font-weight:800}
@media (max-width:720px){.m27-exercise-window{justify-items:start}.m27-exercise-window-actions{justify-content:flex-start}.m27-exercise-window-meta{text-align:left;justify-content:flex-start}}
@media (forced-colors:active){.m27-exercise-window button[aria-pressed="true"]{outline:2px solid CanvasText}}
@media print{.m27-exercise-window{display:none}}
`;

function installStyles(documentLike){
  if(!documentLike?.head||documentLike.getElementById?.(STYLE_ID))return;
  const style=documentLike.createElement('style');
  style.id=STYLE_ID;
  style.textContent=STYLES;
  documentLike.head.appendChild(style);
}

function parsePoints(value){
  try{
    const parsed=JSON.parse(String(value||'[]'));
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

function windowLimit(value){
  if(String(value)==='all')return Number.POSITIVE_INFINITY;
  const parsed=Number(value);
  return [4,8,12].includes(parsed)?parsed:8;
}

function stateFor(root){
  let state=ROOT_STATE.get(root);
  if(state)return state;
  state={
    window:'8',
    seriesByCard:new WeakMap(),
  };
  ROOT_STATE.set(root,state);
  return state;
}

function activeCard(root){
  return root.querySelector?.(
    '[data-m27-exercise-focus] [data-m27-exercise-active] .m26-exercise-progress-card'
  )||null;
}

function primaryChart(card){
  return card?.querySelector?.('.m26-exercise-progress-echart')||null;
}

function seriesFor(state,card){
  const cached=state.seriesByCard.get(card);
  if(cached)return cached;
  const chart=primaryChart(card);
  const points=parsePoints(chart?.getAttribute?.('data-points'));
  const ariaLabel=String(chart?.getAttribute?.('aria-label')||'').trim();
  const series=Object.freeze({
    points:Object.freeze(points),
    ariaLabel,
  });
  state.seriesByCard.set(card,series);
  return series;
}

function updateControls(root,state,visibleCount,totalCount){
  const workspace=root.querySelector?.('[data-m27-exercise-focus]');
  if(!workspace)return;
  for(const button of workspace.querySelectorAll?.('[data-m27-exercise-window]')||[]){
    button.setAttribute(
      'aria-pressed',
      String(button.getAttribute('data-m27-exercise-window'))===state.window?'true':'false',
    );
  }
  const count=workspace.querySelector?.('[data-m27-exercise-window-count]');
  if(count){
    count.textContent=totalCount?String(visibleCount)+'/'+String(totalCount):'—';
  }
}

function applyWindow(root,value){
  const state=stateFor(root);
  const selected=String(value||state.window||'8');
  const limit=windowLimit(selected);
  const card=activeCard(root);
  if(!card)return false;

  state.window=selected;
  const series=seriesFor(state,card);
  const chart=primaryChart(card);
  let visibleCount=0;

  if(chart&&series.points.length>=2){
    const visible=Number.isFinite(limit)
      ?series.points.slice(-limit)
      :series.points;
    visibleCount=visible.length;
    const clone=chart.cloneNode(false);
    clone.setAttribute('data-points',JSON.stringify(visible));
    if(series.ariaLabel){
      clone.setAttribute(
        'aria-label',
        String(visible.length)+'/'+String(series.points.length)+'. '+series.ariaLabel,
      );
    }
    chart.replaceWith(clone);
  }

  const rows=[...(card.querySelectorAll?.('.m26-exercise-progress-table tbody tr')||[])];
  rows.forEach((row,index)=>{
    row.hidden=Number.isFinite(limit)&&index>=limit;
  });

  updateControls(
    root,
    state,
    visibleCount||Math.min(rows.length,Number.isFinite(limit)?limit:rows.length),
    series.points.length||rows.length,
  );
  return true;
}

function defer(callback){
  if(typeof globalThis.queueMicrotask==='function'){
    globalThis.queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

function bindRoot(root){
  if(BOUND_ROOTS.has(root))return;
  BOUND_ROOTS.add(root);
  root.addEventListener('click',(event)=>{
    const workspace=event.target?.closest?.('[data-m27-exercise-focus]');
    if(!workspace)return;

    const windowButton=event.target.closest?.('[data-m27-exercise-window]');
    if(windowButton){
      applyWindow(
        root,
        String(windowButton.getAttribute('data-m27-exercise-window')||'8'),
      );
      return;
    }

    if(event.target.closest?.('[data-m27-exercise-select]')){
      defer(()=>applyWindow(root,stateFor(root).window));
    }
  });
}

function buildControls(documentLike,state){
  const box=documentLike.createElement('div');
  box.className='m27-exercise-window';
  box.setAttribute('data-m27-exercise-window-controls','true');
  box.setAttribute('aria-label','Ventana visual del historial del ejercicio');

  const title=documentLike.createElement('span');
  title.textContent='Ventana visual';

  const actions=documentLike.createElement('div');
  actions.className='m27-exercise-window-actions';

  for(const value of ['4','8','12','all']){
    const button=documentLike.createElement('button');
    button.type='button';
    button.textContent=value==='all'?'Todo':value;
    button.setAttribute('data-m27-exercise-window',value);
    button.setAttribute('aria-pressed',value===state.window?'true':'false');
    actions.appendChild(button);
  }

  const meta=documentLike.createElement('small');
  meta.className='m27-exercise-window-meta';
  meta.append(
    documentLike.createTextNode(
      'El contador corresponde a la gráfica principal; la tabla conserva sus últimas referencias renderizadas y el estudio Coach su lectura confirmada. '
    ),
  );
  const count=documentLike.createElement('strong');
  count.className='m27-exercise-window-count';
  count.setAttribute('data-m27-exercise-window-count','true');
  count.setAttribute('aria-label','Registros visibles en la gráfica');
  count.textContent='—';
  meta.appendChild(count);

  box.append(title,actions,meta);
  return box;
}

export function enhanceExerciseHistoryWindow({root,viewModel}={}){
  if(!root?.querySelector||!root.ownerDocument)return false;
  const role=String(viewModel?.identity?.role||'').trim().toLowerCase();
  const area=String(viewModel?.activeArea||'').trim().toLowerCase();
  if(!['coach','admin'].includes(role)||area!=='progreso')return false;

  const workspace=root.querySelector?.('[data-m27-exercise-focus]');
  const tools=workspace?.querySelector?.('.m27-exercise-focus-tools');
  if(!workspace||!tools)return false;

  installStyles(root.ownerDocument);
  bindRoot(root);
  const state=stateFor(root);

  if(!tools.querySelector?.('[data-m27-exercise-window-controls]')){
    tools.appendChild(buildControls(root.ownerDocument,state));
  }

  return applyWindow(root,state.window);
}

export const __exerciseHistoryWindowInternals=Object.freeze({
  parsePoints,
  windowLimit,
});
