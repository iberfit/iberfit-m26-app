import test from 'node:test';
import assert from 'node:assert/strict';
import {createExerciseVideoExperienceController,recoveredExerciseVideoState,stopExerciseVideo,renderNativeExerciseVideo} from '../src/m26/library/exercise-video-player.js';

test('media reconnect preserves explicit retry when a requested video is still broken',()=>{
  assert.equal(recoveredExerciseVideoState({error:{code:2},readyState:0}), 'error');
  assert.equal(recoveredExerciseVideoState({networkState:3}), 'error');
  assert.equal(recoveredExerciseVideoState({readyState:1},{attempted:true}), 'error');
  assert.equal(recoveredExerciseVideoState({readyState:0}), 'idle');
  assert.equal(recoveredExerciseVideoState({readyState:3,paused:true}), 'ready');
  assert.equal(recoveredExerciseVideoState({readyState:3,paused:false}), 'playing');
  assert.equal(recoveredExerciseVideoState({ended:true}), 'ended');
});

test('network and pause events keep the correct controls without fetching or autoplaying',()=>{
  const listeners=new Map(),networkListeners=new Map(),attrs=new Map([['data-video-state','idle']]);
  const status={textContent:''},retry={hidden:true},pip={hidden:true};
  let loads=0,plays=0;
  const navigatorRef={onLine:true};
  const video={readyState:0,paused:true,networkState:0,
    matches:selector=>selector==='[data-exercise-video-element]',
    closest:()=>figure,load(){loads++},play(){plays++}};
  const figure={getAttribute:key=>attrs.get(key),setAttribute:(key,value)=>attrs.set(key,value),
    querySelector:selector=>({
      '[data-exercise-video-element]':video,'[data-exercise-video-retry]':retry,
      '[data-exercise-video-status]':status,'[data-exercise-video-pip]':pip
    })[selector]};
  const root={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key),
    querySelectorAll:()=>[figure]};
  const scope={addEventListener:(key,fn)=>networkListeners.set(key,fn),removeEventListener:key=>networkListeners.delete(key)};
  const controller=createExerciseVideoExperienceController({root,scope,navigatorRef,documentRef:{}});
  controller.mount();
  const fire=type=>listeners.get(type)({type,target:video});
  const change=online=>{navigatorRef.onLine=online;networkListeners.get(online?'online':'offline')()};
  change(false);change(true);
  assert.equal(attrs.get('data-video-state'),'idle');
  fire('loadstart');change(false);change(true);
  assert.equal(attrs.get('data-video-state'),'error');assert.equal(retry.hidden,false);
  video.readyState=4;video.paused=false;fire('playing');
  assert.equal(attrs.get('data-video-state'),'playing');
  video.paused=true;fire('pause');
  assert.equal(attrs.get('data-video-state'),'ready');
  video.ended=true;fire('pause');
  assert.equal(attrs.get('data-video-state'),'ended');
  assert.equal(loads,0);assert.equal(plays,0);
  controller.destroy();
  assert.equal(listeners.size,0);assert.equal(networkListeners.size,0);
});

test('stopping a video closes only its own PiP and tolerates browser rejection',async()=>{
  let paused=0,exited=0;
  const doc={pictureInPictureElement:null,exitPictureInPicture(){exited++;return Promise.reject(Error('closed'))}};
  const video={ownerDocument:doc,pause(){paused++}};
  stopExerciseVideo(video);assert.equal(paused,1);assert.equal(exited,0);
  doc.pictureInPictureElement=video;stopExerciseVideo(video);
  assert.equal(paused,2);assert.equal(exited,1);
  await Promise.resolve();
  doc.exitPictureInPicture=()=>{throw Error('already closed')};
  assert.doesNotThrow(()=>stopExerciseVideo(video));
});

test('video stays native, manual and preload-free',()=>{
  const markup=renderNativeExerciseVideo({video:{src:'/demo.mp4',type:'video/mp4'}});
  assert.match(markup,/controls playsinline preload="none"/u);
  assert.doesNotMatch(markup,/\bautoplay\b/u);
});
