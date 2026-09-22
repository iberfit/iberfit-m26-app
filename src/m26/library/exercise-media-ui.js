import {resolveExerciseMedia,resolveExerciseMediaExperience,resolveExerciseMediaMetadata,REPDB_MEDIA_ATTRIBUTION} from './exercise-media.js';
import {renderNativeExerciseVideo,renderExerciseTechnicalGuidance} from './exercise-video-player.js';
import {exerciseDisplayName,exerciseSearchNames} from '../exercises/names.js';

function e(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

const MUSCLE_LABELS=Object.freeze({
  movilidad:'Movilidad y activación',
  gluteos:'Glúteos',
  gluteo:'Glúteos',
  cuadriceps:'Cuádriceps',
  isquiotibiales:'Isquiotibiales',
  aductores:'Aductores',
  abductores:'Abductores',
  gemelos:'Pantorrilla',
  pantorrillas:'Pantorrilla',
  soleo:'Pantorrilla',
  pectorales:'Pectoral',
  pectoral:'Pectoral',
  dorsales:'Espalda',
  dorsal:'Espalda',
  espalda:'Espalda',
  trapecio:'Espalda',
  romboides:'Espalda',
  biceps:'Bíceps',
  triceps:'Tríceps',
  hombros:'Hombros',
  deltoides:'Hombros',
  core:'Zona media',
  abdominales:'Zona media',
  oblicuos:'Zona media',
  antebrazos:'Antebrazos y agarre',
  cuerpo_completo:'Cuerpo completo',
});

function fold(value){
  return String(value??'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/\s+/g,' ')
    .trim();
}

const VIEWER_TAG='m26-exercise-media-viewer';
const viewerState={dialog:null,opener:null};

function closeExerciseMediaViewer(){
  const dialog=viewerState.dialog;
  if(!dialog)return;
  if(typeof dialog.close==='function'&&dialog.open)dialog.close();
  else dialog.removeAttribute?.('open');
}

function viewerFrame(documentLike,sourceImage,label){
  const frame=documentLike.createElement('figure');
  frame.className='m26-exercise-media-viewer-frame';
  frame.dataset.state='loading';

  const image=documentLike.createElement('img');
  image.className='m26-exercise-media-viewer-image';
  image.src=sourceImage.currentSrc||sourceImage.getAttribute?.('src')||'';
  image.alt=sourceImage.alt||'';
  image.decoding='async';
  image.loading='eager';

  const fallback=documentLike.createElement('p');
  fallback.className='m26-exercise-media-viewer-error';
  fallback.hidden=true;
  fallback.textContent='No fue posible cargar esta referencia visual.';

  image.addEventListener?.('load',()=>{frame.dataset.state='ready';});
  image.addEventListener?.('error',()=>{
    frame.dataset.state='error';
    image.hidden=true;
    fallback.hidden=false;
  });

  frame.append(image,fallback);
  if(label){
    const caption=documentLike.createElement('figcaption');
    caption.textContent=label;
    frame.append(caption);
  }
  return frame;
}

function ensureExerciseMediaViewer(documentLike=globalThis.document){
  if(!documentLike?.body)return null;
  if(viewerState.dialog?.isConnected)return viewerState.dialog;

  const dialog=documentLike.createElement('dialog');
  dialog.className='iberfit-dialog m26-exercise-media-viewer-dialog';
  dialog.setAttribute('aria-labelledby','m26-exercise-media-viewer-title');
  dialog.setAttribute('aria-describedby','m26-exercise-media-viewer-description');

  const shell=documentLike.createElement('div');
  shell.className='m26-exercise-media-viewer-shell';

  const header=documentLike.createElement('header');
  header.className='m26-exercise-media-viewer-head';

  const copy=documentLike.createElement('div');
  const eyebrow=documentLike.createElement('p');
  eyebrow.className='m26-eyebrow';
  eyebrow.textContent='Referencia visual';
  const title=documentLike.createElement('h2');
  title.id='m26-exercise-media-viewer-title';
  title.dataset.exerciseMediaViewerTitle='';
  const description=documentLike.createElement('p');
  description.id='m26-exercise-media-viewer-description';
  description.className='m26-exercise-media-viewer-description';
  description.textContent='Vista ampliada de la ejecución. El protocolo y los datos permanecen en la tarjeta del ejercicio.';
  copy.append(eyebrow,title,description);

  const close=documentLike.createElement('button');
  close.type='button';
  close.className='m26-icon-button m26-exercise-media-viewer-close';
  close.setAttribute('aria-label','Cerrar referencia visual');
  close.dataset.exerciseMediaViewerClose='';
  close.textContent='×';
  header.append(copy,close);

  const body=documentLike.createElement('div');
  body.className='iberfit-dialog-body m26-exercise-media-viewer-body';
  body.dataset.exerciseMediaViewerBody='';

  shell.append(header,body);
  dialog.append(shell);
  documentLike.body.append(dialog);

  close.addEventListener('click',()=>closeExerciseMediaViewer());
  dialog.addEventListener('click',(event)=>{
    if(event.target===dialog)closeExerciseMediaViewer();
  });
  dialog.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&typeof dialog.close!=='function')closeExerciseMediaViewer();
  });
  dialog.addEventListener('close',()=>{
    const opener=viewerState.opener;
    viewerState.opener=null;
    if(opener?.isConnected)opener.focus?.({preventScroll:true});
  });

  viewerState.dialog=dialog;
  return dialog;
}

function openExerciseMediaViewer(trigger){
  const documentLike=trigger?.ownerDocument||globalThis.document;
  const dialog=ensureExerciseMediaViewer(documentLike);
  if(!dialog)return false;
  const sourceImages=[...trigger.querySelectorAll?.('.m26-exercise-media-image')||[]];
  if(!sourceImages.length)return false;

  const title=dialog.querySelector('[data-exercise-media-viewer-title]');
  const body=dialog.querySelector('[data-exercise-media-viewer-body]');
  if(!title||!body)return false;
  title.textContent=trigger.getAttribute('data-exercise-media-name')||'Ejercicio IBERFIT';
  body.replaceChildren();
  body.dataset.frameCount=String(sourceImages.length);

  for(const sourceImage of sourceImages){
    const label=sourceImage.closest?.('.m26-exercise-media-frame')?.querySelector?.('small')?.textContent?.trim()||'';
    body.append(viewerFrame(documentLike,sourceImage,label));
  }

  viewerState.opener=trigger;
  if(typeof dialog.showModal==='function'){
    if(!dialog.open)dialog.showModal();
  }else{
    dialog.setAttribute('open','');
  }
  dialog.querySelector?.('[data-exercise-media-viewer-close]')?.focus?.({preventScroll:true});
  return true;
}

if(globalThis.customElements&&globalThis.HTMLElement&&!globalThis.customElements.get(VIEWER_TAG)){
  class ExerciseMediaViewerElement extends globalThis.HTMLElement{
    connectedCallback(){
      if(this.__iberfitViewerBound)return;
      this.__iberfitViewerBound=true;
      this.__iberfitViewerClick=(event)=>{
        const trigger=event.target?.closest?.('[data-exercise-media-open]');
        if(!trigger||!this.contains(trigger))return;
        event.preventDefault?.();
        openExerciseMediaViewer(trigger);
      };
      this.addEventListener('click',this.__iberfitViewerClick);
    }
    disconnectedCallback(){
      if(this.__iberfitViewerClick)this.removeEventListener('click',this.__iberfitViewerClick);
      this.__iberfitViewerBound=false;
      if(viewerState.opener&&this.contains(viewerState.opener))closeExerciseMediaViewer();
    }
  }
  globalThis.customElements.define(VIEWER_TAG,ExerciseMediaViewerElement);
}

export function exerciseMuscleGroupLabel(exercise={},manifest=null){
  const name=fold(exercise.name_es||exercise.name||'');
  const explicit=name.includes('abduccion')||name.includes('abductor')?'abductores':name.includes('aduccion')||name.includes('aductor')?'aductores':null;
  const mapped=resolveExerciseMediaMetadata(manifest,exercise.id)?.muscle_group;
  const raw=explicit||mapped||exercise.primary_muscles?.[0]||exercise.pattern||exercise.intent||'Otros';
  const key=fold(raw).replace(/\s+/g,'_');
  return MUSCLE_LABELS[key]||String(raw||'Otros');
}

export function renderExerciseMediaCredit({compact=false,attribution=REPDB_MEDIA_ATTRIBUTION}={}){
  if(!attribution?.url)return '';
  const label=attribution.label||attribution.text||'Fuente visual';
  return `<p class="m26-exercise-media-credit${compact?' is-compact':''}">Datos e ilustraciones de ejercicios: <a href="${e(attribution.url)}" target="_blank" rel="noopener noreferrer">${e(label)}</a></p>`;
}

export function renderExerciseMedia({
  manifest,
  exercise,
  exerciseId=exercise?.id,
  role='client',
  compact=false,
  showCredit=false,
  showQuality=false,
  fallback=true,
  priority=!compact,
  enableViewer=false,
}={}){
  const media=resolveExerciseMedia(manifest,exerciseId,{role});
  const experience=resolveExerciseMediaExperience(manifest,exerciseId,{role});
  const name=exerciseDisplayName(exercise);

  if(!media&&!experience){
    if(!fallback)return '';
    return `<div class="m26-exercise-media-fallback${compact?' is-compact':''}" role="img" aria-label="Sin referencia visual validada para ${e(name)}"><span>Sin referencia visual</span><small>Consulta la ejecución escrita</small></div>`;
  }

  let visual='';
  if(media){
    const labels=media.mode==='start_peak'
      ?['Posición inicial','Posición final']
      :['Referencia visual'];
    const imageLoading=priority
      ?'loading="eager" fetchpriority="high"'
      :compact
        ?'loading="lazy" fetchpriority="low"'
        :'loading="lazy"';

    const frames=media.images.map((src,index)=>`<span class="m26-exercise-media-frame"><img class="m26-exercise-media-image" src="${e(src)}" alt="${e(`${name} · ${labels[index]||'referencia visual'}`)}" ${imageLoading} decoding="async"><small>${e(labels[index]||'Referencia')}</small></span>`).join('');
    const frameGroup=`<div class="m26-exercise-media-frames">${frames}</div>`;
    const interactiveFrames=enableViewer
      ?`<${VIEWER_TAG}><button type="button" class="m26-exercise-media-open" data-exercise-media-open data-exercise-media-name="${e(name)}" aria-label="Ver ${e(name)} en grande">${frameGroup}<span class="m26-exercise-media-open-label" aria-hidden="true">Ver en grande</span></button></${VIEWER_TAG}>`
      :frameGroup;

    const quality=showQuality&&media.quality.startsWith('C')
      ?'<p class="m26-exercise-media-quality" role="status">Referencia visual pendiente de validación individual por el entrenador.</p>'
      :'';

    const credit=showCredit?renderExerciseMediaCredit({compact,attribution:media.attribution}):'';
    visual=`<figure class="m26-exercise-media${compact?' is-compact':''}" data-exercise-media="${e(exerciseId)}" data-exercise-media-source="${e(media.provider||'')}">${interactiveFrames}${quality}${credit}</figure>`;
  }

  if(!experience)return visual;

  const video=experience.video
    ?renderNativeExerciseVideo({video:experience.video,title:experience.title,alt:experience.alt,provenance:experience.provenance})
    :'';
  const guidance=renderExerciseTechnicalGuidance(experience);
  return `<div class="m26-exercise-media-experience" data-exercise-media-experience="${e(exerciseId)}">${video}${visual}${guidance}</div>`;
}

export function renderLibraryExerciseCard(item,manifest,{role='coach'}={}){
  const searchText=[
    ...exerciseSearchNames(item),item.pattern,item.equipment,item.difficulty,item.intent,
    ...(item.primary_muscles||[]),
    ...(item.secondary_muscles||[]),
    ...(item.tags||[]),
    ...(item.aliases||[]),
  ].join(' ').toLowerCase();

  const media=renderExerciseMedia({
    manifest,
    exercise:item,
    role,
    compact:true,
    showQuality:role!=='client',
    fallback:true,
    enableViewer:true,
  });

  const instructions=(item.instructions_es||item.cues||[]).slice(0,6);
  const precautions=(item.precautions||[]).slice(0,4);
  const primary=(item.primary_muscles||[]).join(' · ')||exerciseMuscleGroupLabel(item,manifest);
  const secondary=(item.secondary_muscles||[]).join(' · ');
  const units=(item.units||[]).join(' · ');
  const facts=[
    item.difficulty?`<span><strong>Dificultad</strong>${e(item.difficulty)}</span>`:'',
    item.pattern?`<span><strong>Patrón</strong>${e(item.pattern)}</span>`:'',
    item.equipment?`<span><strong>Material</strong>${e(item.equipment)}</span>`:'',
    units?`<span><strong>Registro</strong>${e(units)}</span>`:'',
  ].filter(Boolean).join('');
  const detail=`<details class="m26-library-details"><summary><span>Protocolo y detalles</span><span class="m26-library-details-action" aria-hidden="true"></span></summary><div class="m26-library-details-panel"><div class="m26-library-facts">${facts}</div><p><strong>Músculos principales:</strong> ${e(primary)}</p>${secondary?`<p><strong>Músculos secundarios:</strong> ${e(secondary)}</p>`:''}${instructions.length?`<h4>Ejecución</h4><ol>${instructions.map((line)=>`<li>${e(line)}</li>`).join('')}</ol>`:'<p class="m26-notice is-warning">Este ejercicio necesita un protocolo de ejecución más detallado antes de utilizarse con clientes.</p>'}${precautions.length?`<p><strong>Precauciones:</strong> ${e(precautions.join(' · '))}</p>`:'<p><strong>Precauciones:</strong> Detener ante dolor, mareo o pérdida de control técnico.</p>'}</div></details>`;

  const adminRename=role==='admin'
    ?`<details class="m26-library-details m26-library-admin-edit">
        <summary><span>Editar nombre global</span><span class="m26-library-details-action" aria-hidden="true"></span></summary>
        <div class="m26-library-details-panel">
          <form data-exercise-rename-form data-exercise-id="${e(item.id)}" data-expected-revision="${e(item.revision||0)}">
            <label>
              Nombre canónico en español
              <input name="nameEs" value="${e(item.name_es||'')}" minlength="2" maxlength="160" autocomplete="off" required>
            </label>
            <p class="m26-data-footnote">El ID del ejercicio permanece estable. IBERFIT actualizará el nombre global y generará automáticamente inglés, francés y portugués antes de confirmar el cambio.</p>
            <div class="m26-inline-actions">
              <button type="submit" class="m26-primary-action">Guardar nombre global</button>
            </div>
            <p class="m26-data-footnote" data-exercise-rename-status role="status" aria-live="polite"></p>
          </form>
        </div>
      </details>`
    :'';

  return `<article class="m26-library-card" data-library-text="${e(searchText)}" data-exercise-id="${e(item.id)}">${media}<div class="m26-library-copy"><h3>${e(exerciseDisplayName(item))}</h3><p>${e(item.pattern||'Patrón por definir')} · ${e(item.equipment||'Sin material')}</p><small>${e(primary)}</small>${detail}${adminRename}</div></article>`;
}

export function renderExerciseLibraryGroups(items=[],manifest,{role='coach'}={}){
  const groups=new Map();
  for(const item of items){
    const label=exerciseMuscleGroupLabel(item,manifest);
    if(!groups.has(label))groups.set(label,[]);
    groups.get(label).push(item);
  }

  return [...groups.entries()]
    .sort(([a],[b])=>a.localeCompare(b,'es',{sensitivity:'base'}))
    .map(([label,records])=>`<section class="m26-library-group" data-muscle-group="${e(label)}"><div class="m26-library-group-heading"><h3>${e(label)}</h3><span>${records.length} ${records.length===1?'ejercicio':'ejercicios'}</span></div><div class="m26-library-grid">${records.map((item)=>renderLibraryExerciseCard(item,manifest,{role})).join('')}</div></section>`)
    .join('');
}
