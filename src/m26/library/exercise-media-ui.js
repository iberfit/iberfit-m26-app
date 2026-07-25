import {resolveExerciseMedia,resolveExerciseMediaMetadata,REPDB_MEDIA_ATTRIBUTION} from './exercise-media.js';

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

export function exerciseMuscleGroupLabel(exercise={},manifest=null){
  const mapped=resolveExerciseMediaMetadata(manifest,exercise.id)?.muscle_group;
  const raw=mapped||exercise.primary_muscles?.[0]||exercise.pattern||exercise.intent||'Otros';
  const key=fold(raw).replace(/\s+/g,'_');
  return MUSCLE_LABELS[key]||String(raw||'Otros');
}

export function renderExerciseMediaCredit({compact=false}={}){
  return `<p class="m26-exercise-media-credit${compact?' is-compact':''}">Datos e ilustraciones de ejercicios: <a href="${e(REPDB_MEDIA_ATTRIBUTION.url)}" target="_blank" rel="noopener noreferrer">RepDB (repdb.co)</a></p>`;
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
}={}){
  const media=resolveExerciseMedia(manifest,exerciseId,{role});
  const name=exercise?.name_es||exercise?.name||'Ejercicio';

  if(!media){
    if(!fallback)return '';
    return `<div class="m26-exercise-media-fallback${compact?' is-compact':''}" aria-hidden="true">${e(String(name).slice(0,1)||'I')}</div>`;
  }

  const labels=media.mode==='start_peak'
    ?['Posición inicial','Posición final']
    :['Referencia visual'];

  const frames=media.images.map((src,index)=>`<span class="m26-exercise-media-frame"><img class="m26-exercise-media-image" src="${e(src)}" alt="${e(`${name} · ${labels[index]||'referencia visual'}`)}" loading="lazy" decoding="async"><small>${e(labels[index]||'Referencia')}</small></span>`).join('');

  const quality=showQuality&&media.quality.startsWith('C')
    ?'<p class="m26-exercise-media-quality" role="status">Referencia visual pendiente de validación individual por el entrenador.</p>'
    :'';

  return `<figure class="m26-exercise-media${compact?' is-compact':''}" data-exercise-media="${e(exerciseId)}"><div class="m26-exercise-media-frames">${frames}</div>${quality}${showCredit?renderExerciseMediaCredit({compact}):''}</figure>`;
}

export function renderLibraryExerciseCard(item,manifest,{role='coach'}={}){
  const searchText=[
    item.name_es,item.pattern,item.equipment,
    ...(item.primary_muscles||[]),
    ...(item.secondary_muscles||[]),
  ].join(' ').toLowerCase();

  const media=renderExerciseMedia({
    manifest,
    exercise:item,
    role,
    compact:true,
    showQuality:role!=='client',
    fallback:true,
  });

  const instructions=(item.instructions_es||item.cues||[]).slice(0,4);
  const precautions=(item.precautions||[]).slice(0,2);
  const detail=instructions.length||precautions.length
    ?`<details class="m26-library-details"><summary>Ver indicaciones</summary>${instructions.length?`<ol>${instructions.map((line)=>`<li>${e(line)}</li>`).join('')}</ol>`:''}${precautions.length?`<p><strong>Precauciones:</strong> ${e(precautions.join(' · '))}</p>`:''}</details>`
    :'';

  return `<article class="m26-library-card" data-library-text="${e(searchText)}" data-exercise-id="${e(item.id)}">${media}<div class="m26-library-copy"><h3>${e(item.name_es||'Ejercicio')}</h3><p>${e(item.pattern||'Patrón')} · ${e(item.equipment||'Sin equipo')}</p><small>${e((item.primary_muscles||[]).join(' · ')||exerciseMuscleGroupLabel(item,manifest))}</small>${detail}</div></article>`;
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
