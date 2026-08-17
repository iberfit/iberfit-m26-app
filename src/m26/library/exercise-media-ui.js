import {resolveExerciseMedia,resolveExerciseMediaExperience,resolveExerciseMediaMetadata,REPDB_MEDIA_ATTRIBUTION} from './exercise-media.js';
import {renderNativeExerciseVideo,renderExerciseTechnicalGuidance} from './exercise-video-player.js';

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
}={}){
  const media=resolveExerciseMedia(manifest,exerciseId,{role});
  const experience=resolveExerciseMediaExperience(manifest,exerciseId,{role});
  const name=exercise?.name_es||exercise?.name||'Ejercicio';

  if(!media&&!experience){
    if(!fallback)return '';
    return `<div class="m26-exercise-media-fallback${compact?' is-compact':''}" role="img" aria-label="Sin referencia visual validada para ${e(name)}"><span>Sin referencia visual</span><small>Consulta la ejecución escrita</small></div>`;
  }

  let visual='';
  if(media){
    const labels=media.mode==='start_peak'
      ?['Posición inicial','Posición final']
      :['Referencia visual'];

    const frames=media.images.map((src,index)=>`<span class="m26-exercise-media-frame"><img class="m26-exercise-media-image" src="${e(src)}" alt="${e(`${name} · ${labels[index]||'referencia visual'}`)}" loading="lazy" decoding="async"><small>${e(labels[index]||'Referencia')}</small></span>`).join('');

    const quality=showQuality&&media.quality.startsWith('C')
      ?'<p class="m26-exercise-media-quality" role="status">Referencia visual pendiente de validación individual por el entrenador.</p>'
      :'';

    const credit=showCredit?renderExerciseMediaCredit({compact,attribution:media.attribution}):'';
    visual=`<figure class="m26-exercise-media${compact?' is-compact':''}" data-exercise-media="${e(exerciseId)}" data-exercise-media-source="${e(media.provider||'')}"><div class="m26-exercise-media-frames">${frames}</div>${quality}${credit}</figure>`;
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
    item.name_es,item.pattern,item.equipment,item.difficulty,item.intent,
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

  return `<article class="m26-library-card" data-library-text="${e(searchText)}" data-exercise-id="${e(item.id)}">${media}<div class="m26-library-copy"><h3>${e(item.name_es||'Ejercicio')}</h3><p>${e(item.pattern||'Patrón por definir')} · ${e(item.equipment||'Sin material')}</p><small>${e(primary)}</small>${detail}</div></article>`;
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
