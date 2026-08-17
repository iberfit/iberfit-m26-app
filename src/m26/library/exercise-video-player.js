export const EXERCISE_VIDEO_PLAYER_SCHEMA_VERSION='iberfit.exercise-video-player.v1';

export const NATIVE_EXERCISE_VIDEO_POLICY=Object.freeze({
  engine:'html5-native',
  autoplay:false,
  preload:'none',
  playsInline:true,
  captions:'webvtt',
  pictureInPicture:'native-when-supported',
  playbackRate:'native-browser-capability',
  analytics:'deferred-rc63.2',
  plyrAdopted:false,
});

function e(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function list(items=[]){
  return (Array.isArray(items)?items:[])
    .filter(Boolean)
    .map((item)=>`<li>${e(item)}</li>`)
    .join('');
}

export function renderNativeExerciseVideo({
  video,
  title='Video técnico',
  alt='Demostración técnica del ejercicio',
}={}){
  if(!video?.src)return '';
  const poster=video.poster?` poster="${e(video.poster)}"`:'';
  const tracks=(video.captions||[]).map((track)=>`<track kind="captions" src="${e(track.src)}" srclang="${e(track.srclang)}" label="${e(track.label)}"${track.default?' default':''}>`).join('');
  return `<figure class="m26-exercise-video" data-exercise-video data-video-state="idle"><video controls playsinline preload="none"${poster} aria-label="${e(alt)}" data-exercise-video-element><source src="${e(video.src)}" type="${e(video.type)}">${tracks}<p>Tu navegador no puede reproducir este video. Utiliza la guía escrita disponible para este ejercicio.</p></video><figcaption><strong>${e(title)}</strong><span>Video técnico IBERFIT · reproducción bajo demanda</span></figcaption></figure>`;
}

export function renderExerciseTechnicalGuidance(experience={}){
  const cues=list(experience.cues);
  const errors=list(experience.commonErrors);
  const regressions=list(experience.regressions);
  if(!cues&&!errors&&!regressions)return '';
  return `<details class="m26-exercise-technical-guidance"><summary>Guía técnica escrita</summary><div class="m26-exercise-technical-guidance-body">${cues?`<section><h4>Cues</h4><ul>${cues}</ul></section>`:''}${errors?`<section><h4>Errores comunes</h4><ul>${errors}</ul></section>`:''}${regressions?`<section><h4>Regresiones</h4><ul>${regressions}</ul></section>`:''}</div></details>`;
}

export const __exerciseVideoPlayerInternals=Object.freeze({e,list});