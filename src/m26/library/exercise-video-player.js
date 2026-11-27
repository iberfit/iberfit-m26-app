import {
  createExerciseMediaTechnicalAnalytics,
  mediaLoadLatencyBucket,
} from './exercise-media-observability.js';

export const EXERCISE_VIDEO_PLAYER_SCHEMA_VERSION='iberfit.exercise-video-player.v2';

export const NATIVE_EXERCISE_VIDEO_POLICY=Object.freeze({
  engine:'html5-native',
  autoplay:false,
  preload:'none',
  playsInline:true,
  captions:'webvtt',
  pictureInPicture:'explicit-when-supported',
  playbackRate:'explicit-cycle',
  analytics:'memory-only-minimized',
  plyrAdopted:false,
});

const MEDIA_EVENTS=Object.freeze([
  'loadstart',
  'loadedmetadata',
  'canplay',
  'playing',
  'pause',
  'waiting',
  'stalled',
  'error',
  'ended',
  'emptied',
]);
const PLAYBACK_RATES=Object.freeze([1,0.75,0.5,1.25,1.5,2]);

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

function networkState(navigatorRef=globalThis.navigator){
  return navigatorRef?.onLine===false?'offline':'online';
}

function mediaErrorClass(error){
  switch(Number(error?.code||0)){
    case 1:return 'aborted';
    case 2:return 'network';
    case 3:return 'decode';
    case 4:return 'source';
    default:return 'unknown';
  }
}

function mediaStateForEvent(type,{online=true}={}){
  if(!online&&['loadstart','waiting','stalled','error','emptied'].includes(type))return 'offline';
  switch(type){
    case 'loadstart':return 'loading';
    case 'loadedmetadata':
    case 'canplay':return 'ready';
    case 'playing':return 'playing';
    case 'pause':return 'ready';
    case 'waiting':
    case 'stalled':return 'buffering';
    case 'error':return 'error';
    case 'ended':return 'ended';
    case 'emptied':return 'idle';
    default:return 'idle';
  }
}

function analyticsEventForMediaEvent(type){
  return {
    loadstart:'load_start',
    loadedmetadata:'metadata_ready',
    canplay:'ready',
    playing:'play',
    waiting:'buffering',
    stalled:'stalled',
    error:'error',
    ended:'ended',
  }[type]||null;
}

function statusText(state,network){
  if(network==='offline'&&state!=='playing'){
    return 'Sin conexión. El video puede no estar disponible; la guía técnica escrita sigue accesible.';
  }
  return {
    idle:'Video disponible bajo demanda.',
    loading:'Cargando referencia técnica…',
    ready:'Video listo para reproducir.',
    playing:'Reproduciendo video técnico.',
    buffering:'La reproducción está esperando datos de red…',
    error:'No fue posible cargar el video. Puedes reintentar o continuar con la guía escrita.',
    ended:'Video técnico finalizado.',
    offline:'Sin conexión. Continúa con la guía técnica escrita.',
  }[state]||'Video disponible bajo demanda.';
}

function nextPlaybackRate(current){
  const value=Number(current)||1;
  const index=PLAYBACK_RATES.findIndex((rate)=>Math.abs(rate-value)<0.001);
  return PLAYBACK_RATES[(index+1+PLAYBACK_RATES.length)%PLAYBACK_RATES.length];
}

function canUsePictureInPicture(video,documentRef=globalThis.document){
  return Boolean(
    documentRef?.pictureInPictureEnabled&&
    typeof video?.requestPictureInPicture==='function'&&
    typeof documentRef?.exitPictureInPicture==='function'
  );
}

// The browser owns playback. Never reload or autoplay on a network event.
export function recoveredExerciseVideoState(video,{attempted=false}={}){
  if(video?.ended)return 'ended';
  if(video?.error||Number(video?.networkState)===3)return 'error';
  if(Number(video?.readyState||0)>=3)return video?.paused===false?'playing':'ready';
  return attempted?'error':'idle';
}

export function stopExerciseVideo(video){
  if(!video)return;
  try{video.pause?.();}catch{/* detached or unsupported media */}
  const doc=video.ownerDocument;
  if(doc?.pictureInPictureElement!==video)return;
  // A browser may revoke PiP while the exercise is being removed.
  try{void doc.exitPictureInPicture?.()?.catch?.(()=>{});}catch{/* already closed */}
}

function renderProvenance(provenance){
  if(!provenance?.licenseLabel)return '';
  const rights=provenance.rightsBasis?` · ${provenance.rightsBasis.replaceAll('_',' ')}`:'';
  return `<small class="m26-exercise-media-provenance" data-exercise-media-provenance>Origen: IBERFIT · ${e(provenance.licenseLabel)}${e(rights)}</small>`;
}

export function renderNativeExerciseVideo({
  video,
  title='Video técnico',
  alt='Demostración técnica del ejercicio',
  provenance=null,
}={}){
  if(!video?.src)return '';
  const poster=video.poster?` poster="${e(video.poster)}"`:'';
  const tracks=(video.captions||[]).map((track)=>`<track kind="captions" src="${e(track.src)}" srclang="${e(track.srclang)}" label="${e(track.label)}"${track.default?' default':''}>`).join('');
  return `<figure class="m26-exercise-video" data-exercise-video data-video-state="idle" data-video-network="unknown"><video controls playsinline preload="none"${poster} aria-label="${e(alt)}" data-exercise-video-element><source src="${e(video.src)}" type="${e(video.type)}">${tracks}<p>Tu navegador no puede reproducir este video. Utiliza la guía escrita disponible para este ejercicio.</p></video><figcaption><div><strong>${e(title)}</strong><span>Video técnico IBERFIT · reproducción bajo demanda</span>${renderProvenance(provenance)}</div><div class="m26-exercise-video-actions"><button type="button" class="m26-text-action" data-exercise-video-speed aria-label="Cambiar velocidad de reproducción">1×</button><button type="button" class="m26-text-action" data-exercise-video-pip hidden>PiP</button></div></figcaption><div class="m26-exercise-video-status"><p role="status" aria-live="polite" data-exercise-video-status>Video disponible bajo demanda.</p><button type="button" class="m26-text-action" data-exercise-video-retry hidden>Reintentar video</button></div></figure>`;
}

export function renderExerciseTechnicalGuidance(experience={}){
  const cues=list(experience.cues);
  const errors=list(experience.commonErrors);
  const regressions=list(experience.regressions);
  if(!cues&&!errors&&!regressions)return '';
  return `<details class="m26-exercise-technical-guidance"><summary>Guía técnica escrita</summary><div class="m26-exercise-technical-guidance-body">${cues?`<section><h4>Cues</h4><ul>${cues}</ul></section>`:''}${errors?`<section><h4>Errores comunes</h4><ul>${errors}</ul></section>`:''}${regressions?`<section><h4>Regresiones</h4><ul>${regressions}</ul></section>`:''}</div></details>`;
}

export function createExerciseVideoExperienceController({
  root,
  scope=globalThis,
  documentRef=globalThis.document,
  navigatorRef=globalThis.navigator,
  analytics=createExerciseMediaTechnicalAnalytics(),
}={}){
  if(!root?.addEventListener)throw new Error('M26_EXERCISE_VIDEO_ROOT_REQUIRED');

  const loadStarted=new WeakMap();
  let observer=null;
  let mounted=false;
  let activeVideo=null;

  function figureFor(video){
    return video?.closest?.('[data-exercise-video]')||null;
  }

  function updateFigure(figure,state){
    if(!figure)return;
    const network=networkState(navigatorRef);
    if(figure.getAttribute?.('data-video-state')!==state)figure.setAttribute?.('data-video-state',state);
    if(figure.getAttribute?.('data-video-network')!==network)figure.setAttribute?.('data-video-network',network);
    const status=figure.querySelector?.('[data-exercise-video-status]');
    const nextText=statusText(state,network);
    if(status&&status.textContent!==nextText)status.textContent=nextText;
    const retry=figure.querySelector?.('[data-exercise-video-retry]');
    if(retry)retry.hidden=!['error','offline'].includes(state);
  }

  function refreshFigure(figure){
    const video=figure.querySelector?.('[data-exercise-video-element]');
    const pip=figure.querySelector?.('[data-exercise-video-pip]');
    if(pip)pip.hidden=!canUsePictureInPicture(video,documentRef);
    const state=String(figure.getAttribute?.('data-video-state')||'idle');
    updateFigure(figure,state);
  }
  function refreshCapabilities(){
    for(const figure of root.querySelectorAll?.('[data-exercise-video]')||[])refreshFigure(figure);
  }
  function refreshAddedFigures(records){
    // Updating an aria-live status or typing in a training form is not a new
    // media mount. Inspect only added element subtrees, once per batch.
    const figures=new Set(),removedVideos=new Set();
    for(const record of records||[]){
      for(const node of record.removedNodes||[]){
        if(node?.nodeType!==1)continue;
        if(node.matches?.('[data-exercise-video-element]'))removedVideos.add(node);
        for(const video of node.querySelectorAll?.('[data-exercise-video-element]')||[])removedVideos.add(video);
      }
      for(const node of record.addedNodes||[]){
        if(node?.nodeType!==1)continue;
        if(node.matches?.('[data-exercise-video]'))figures.add(node);
        for(const figure of node.querySelectorAll?.('[data-exercise-video]')||[])figures.add(figure);
      }
    }
    for(const video of removedVideos)if(root.contains?.(video)===false){
      stopExerciseVideo(video);
      if(activeVideo===video)activeVideo=null;
    }
    for(const figure of figures)if(root.contains?.(figure)!==false)refreshFigure(figure);
  }

  function recordMedia(eventType,state,{video,errorClass='none',latencyBucket='none'}={}){
    analytics.record({
      eventType,
      state,
      network:networkState(navigatorRef),
      errorClass,
      latencyBucket,
      ignoredExerciseId:video?.dataset?.exerciseId,
      ignoredSrc:video?.currentSrc,
    });
  }

  function onMediaEvent(event){
    const video=event.target?.matches?.('[data-exercise-video-element]')?event.target:null;
    if(!video||!mounted||root.contains?.(video)===false)return;
    if(event.type==='playing'){
      const previous=activeVideo;activeVideo=video;
      if(previous&&previous!==video)stopExerciseVideo(previous);
    }else if(['pause','ended','error','emptied'].includes(event.type)&&activeVideo===video){activeVideo=null;}
    const figure=figureFor(video);
    const online=networkState(navigatorRef)==='online';
    let state=mediaStateForEvent(event.type,{online});
    if(event.type==='pause'){
      if(video.ended)state='ended';
      else if(video.error)state=online?'error':'offline';
      else if(!online&&Number(video.readyState||0)<3)state='offline';
    }
    if(event.type==='canplay'&&video.paused===false&&
      figure?.getAttribute?.('data-video-state')==='playing')state='playing';
    if(event.type==='loadedmetadata'&&Number(video.readyState||0)<3)
      state=online?'loading':'offline';
    let latencyBucket='none';

    if(event.type==='loadstart'){
      loadStarted.set(video,Number(scope?.performance?.now?.()??Date.now()));
    }else if(event.type==='canplay'){
      const started=loadStarted.get(video);
      if(Number.isFinite(started)){
        latencyBucket=mediaLoadLatencyBucket(Number(scope?.performance?.now?.()??Date.now())-started);
      }
    }

    updateFigure(figure,state);
    const eventType=analyticsEventForMediaEvent(event.type);
    if(eventType){
      recordMedia(eventType,state,{
        video,
        errorClass:event.type==='error'?mediaErrorClass(video.error):'none',
        latencyBucket,
      });
    }
  }

  async function onClick(event){
    const speed=event.target?.closest?.('[data-exercise-video-speed]');
    if(speed){
      const figure=speed.closest?.('[data-exercise-video]');
      const video=figure?.querySelector?.('[data-exercise-video-element]');
      if(!video)return;
      const next=nextPlaybackRate(video.playbackRate);
      try{video.playbackRate=next;}catch{return;}
      const actual=Number(video.playbackRate)||1;
      speed.textContent=`${actual}×`;
      speed.setAttribute?.('aria-label',`Velocidad actual ${actual}×. Cambiar velocidad de reproducción`);
      analytics.record({eventType:'rate_change',state:String(figure.getAttribute?.('data-video-state')||'idle'),network:networkState(navigatorRef)});
      return;
    }

    const retry=event.target?.closest?.('[data-exercise-video-retry]');
    if(retry){
      const figure=retry.closest?.('[data-exercise-video]');
      const video=figure?.querySelector?.('[data-exercise-video-element]');
      if(!video)return;
      if(networkState(navigatorRef)==='offline'){
        updateFigure(figure,'offline');
        return;
      }
      analytics.record({eventType:'retry',state:'loading',network:'online'});
      updateFigure(figure,'loading');
      // A synchronous browser failure must leave a visible retry action,
      // not a permanent loading indicator. Never autoplay after retry.
      try{video.load?.();}catch{updateFigure(figure,'error');}
      return;
    }

    const pip=event.target?.closest?.('[data-exercise-video-pip]');
    if(pip){
      const figure=pip.closest?.('[data-exercise-video]');
      const video=figure?.querySelector?.('[data-exercise-video-element]');
      if(!video||!canUsePictureInPicture(video,documentRef))return;
      try{
        if(documentRef.pictureInPictureElement===video){
          await documentRef.exitPictureInPicture();
          analytics.record({eventType:'pip_exit',state:String(figure.getAttribute?.('data-video-state')||'idle'),network:networkState(navigatorRef)});
        }else{
          await video.requestPictureInPicture();
          // The user may have navigated to another exercise while PiP was
          // awaiting permission. Do not leave an obsolete video floating.
          if(!mounted||root.contains?.(video)===false){
            stopExerciseVideo(video);
            return;
          }
          analytics.record({eventType:'pip_enter',state:String(figure.getAttribute?.('data-video-state')||'idle'),network:networkState(navigatorRef)});
        }
      }catch{
        analytics.record({eventType:'error',state:String(figure.getAttribute?.('data-video-state')||'idle'),network:networkState(navigatorRef),errorClass:'unsupported'});
      }
    }
  }

  function onNetwork(){
    const network=networkState(navigatorRef);
    analytics.record({eventType:network==='online'?'network_online':'network_offline',state:network==='online'?'idle':'offline',network});
    for(const figure of root.querySelectorAll?.('[data-exercise-video]')||[]){
      const video=figure.querySelector?.('[data-exercise-video-element]');
      const current=String(figure.getAttribute?.('data-video-state')||'idle');
      if(network==='offline'&&current!=='playing'&&Number(video?.readyState||0)<3){
        updateFigure(figure,'offline');
      }else if(network==='online'&&current==='offline'){
        updateFigure(figure,recoveredExerciseVideoState(video,{attempted:loadStarted.has(video)}));
      }else{
        updateFigure(figure,current);
      }
    }
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      for(const type of MEDIA_EVENTS)root.addEventListener(type,onMediaEvent,true);
      root.addEventListener('click',onClick);
      scope?.addEventListener?.('online',onNetwork);
      scope?.addEventListener?.('offline',onNetwork);
      if(typeof scope?.MutationObserver==='function'){
        observer=new scope.MutationObserver(refreshAddedFigures);
        observer.observe(root,{childList:true,subtree:true});
      }
      refreshCapabilities();
    },
    destroy(){
      if(!mounted)return;
      mounted=false;
      for(const type of MEDIA_EVENTS)root.removeEventListener(type,onMediaEvent,true);
      root.removeEventListener('click',onClick);
      scope?.removeEventListener?.('online',onNetwork);
      scope?.removeEventListener?.('offline',onNetwork);
      observer?.disconnect?.();
      observer=null;
      if(activeVideo)stopExerciseVideo(activeVideo);
      activeVideo=null;
    },
    analyticsSnapshot:()=>analytics.snapshot(),
  });
}

export const __exerciseVideoPlayerInternals=Object.freeze({
  MEDIA_EVENTS,
  PLAYBACK_RATES,
  e,
  list,
  networkState,
  mediaErrorClass,
  mediaStateForEvent,
  analyticsEventForMediaEvent,
  statusText,
  nextPlaybackRate,
  canUsePictureInPicture,
  renderProvenance,
});