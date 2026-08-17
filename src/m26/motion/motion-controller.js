export const M26_MOTION_SCHEMA_VERSION='iberfit.motion.v1';

export const M26_MOTION_PRESETS=Object.freeze({
  feedback:Object.freeze({
    duration:180,
    easing:'cubic-bezier(0.16, 1, 0.3, 1)',
    keyframes:Object.freeze([
      Object.freeze({opacity:.72,transform:'scale(.985)'}),
      Object.freeze({opacity:1,transform:'scale(1)'}),
    ]),
  }),
  set:Object.freeze({
    duration:220,
    easing:'cubic-bezier(0.16, 1, 0.3, 1)',
    keyframes:Object.freeze([
      Object.freeze({transform:'scale(.985)',opacity:.78}),
      Object.freeze({transform:'scale(1.015)',opacity:1}),
      Object.freeze({transform:'scale(1)',opacity:1}),
    ]),
  }),
  reorder:Object.freeze({
    duration:180,
    easing:'cubic-bezier(0.16, 1, 0.3, 1)',
    keyframes:Object.freeze([
      Object.freeze({transform:'translateY(6px)',opacity:.78}),
      Object.freeze({transform:'translateY(0)',opacity:1}),
    ]),
  }),
  filter:Object.freeze({
    duration:160,
    easing:'ease',
    keyframes:Object.freeze([
      Object.freeze({opacity:.72}),
      Object.freeze({opacity:1}),
    ]),
  }),
  status:Object.freeze({
    duration:200,
    easing:'cubic-bezier(0.16, 1, 0.3, 1)',
    keyframes:Object.freeze([
      Object.freeze({opacity:0,transform:'translateY(4px)'}),
      Object.freeze({opacity:1,transform:'translateY(0)'}),
    ]),
  }),
  entrance:Object.freeze({
    duration:180,
    easing:'cubic-bezier(0.16, 1, 0.3, 1)',
    keyframes:Object.freeze([
      Object.freeze({opacity:0}),
      Object.freeze({opacity:1}),
    ]),
  }),
});

const SESSION_ACTION_INTENTS=Object.freeze({
  'save-draft':'feedback',
  'save-template':'feedback',
  'load-template':'feedback',
  'publish':'feedback',
  'complete-set':'set',
  'finish':'set',
  'next':'reorder',
  'previous':'reorder',
  'move-up':'reorder',
  'move-down':'reorder',
  'add-exercise':'reorder',
  'duplicate-block':'reorder',
  'remove-block':'reorder',
  'add-group':'reorder',
  'close-group':'reorder',
});

function text(value,max=160){
  return String(value??'').trim().slice(0,max);
}

export function prefersReducedMotion(scope=globalThis){
  try{
    return Boolean(scope?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  }catch{
    return false;
  }
}

export function motionIntentForSessionAction(action){
  return SESSION_ACTION_INTENTS[text(action,80)]||null;
}

export function animateM26Node(node,presetName='feedback',{
  reduced=prefersReducedMotion(),
}={}){
  const preset=M26_MOTION_PRESETS[presetName]||M26_MOTION_PRESETS.feedback;
  if(!node){
    return Object.freeze({animated:false,reason:'target_missing',preset:presetName});
  }
  if(reduced){
    try{node.dataset.motionState='reduced';}catch{}
    return Object.freeze({animated:false,reason:'reduced_motion',preset:presetName});
  }
  if(typeof node.animate!=='function'){
    return Object.freeze({animated:false,reason:'waapi_unavailable',preset:presetName});
  }
  const animation=node.animate(
    preset.keyframes.map((frame)=>({...frame})),
    {
      duration:preset.duration,
      easing:preset.easing,
      fill:'none',
    },
  );
  return Object.freeze({animated:true,reason:'waapi',preset:presetName,animation});
}

function candidate(root,selector){
  try{return root?.querySelector?.(selector)||null;}catch{return null;}
}

function blockCandidate(root,blockId){
  const id=text(blockId,160);
  if(!id)return null;
  for(const node of root?.querySelectorAll?.('[data-block-id]')||[]){
    if(String(node.getAttribute?.('data-block-id')||'')===id)return node;
  }
  return null;
}

function actionTarget(root,action,button){
  const blockId=button?.getAttribute?.('data-block-id')||null;
  if(blockId){
    const block=blockCandidate(root,blockId);
    if(block)return block;
  }
  if(['save-draft','save-template','load-template','publish'].includes(action)){
    return candidate(root,'.m26-action-state')||button||candidate(root,'.m26-session-builder');
  }
  if(action==='complete-set'||action==='finish'){
    return candidate(root,'[data-session-action="complete-set"]')||
      candidate(root,'.m26-session-timers')||
      candidate(root,'.m26-session-builder');
  }
  return candidate(root,'.m26-session-builder')||button;
}

function queueAfterEvent(scope,callback){
  const schedule=typeof scope?.requestAnimationFrame==='function'
    ?scope.requestAnimationFrame.bind(scope)
    :(fn)=>setTimeout(fn,0);
  queueMicrotask(()=>schedule(callback));
}

function isFilterControl(target){
  return Boolean(
    target?.closest?.(
      '[data-client-search],[data-client-filter],[data-client-sort],[data-session-search]'
    )
  );
}

function interestingMutationNodes(record){
  const nodes=[];
  for(const added of record?.addedNodes||[]){
    if(added?.nodeType===1)nodes.push(added);
  }
  if(record?.target?.nodeType===1)nodes.push(record.target);
  return nodes;
}

export const M26_MOTION_STATE_SELECTOR=[
  '.m26-sync-banner',
  '.m26-action-state.is-success',
  '.m26-action-state.is-error',
  '.m26-empty-copy',
  '.m26-skeleton',
  '[data-empty-state]',
  '[data-loading-state]',
].join(',');

function motionStateKind(node){
  if(node?.matches?.('.m26-action-state.is-error'))return {kind:'error',preset:'status'};
  if(node?.matches?.('.m26-action-state.is-success'))return {kind:'success',preset:'status'};
  if(node?.matches?.('.m26-sync-banner'))return {kind:'sync',preset:'status'};
  if(node?.matches?.('.m26-skeleton,[data-loading-state]'))return {kind:'loading',preset:'entrance'};
  if(node?.matches?.('.m26-empty-copy,[data-empty-state]'))return {kind:'empty',preset:'entrance'};
  return null;
}

export function describeM26MotionState(node){
  const descriptor=motionStateKind(node);
  if(!descriptor)return null;
  const copy=String(node?.textContent??'').replace(/\s+/gu,' ').trim().slice(0,240);
  const status=text(node?.getAttribute?.('data-status'),40);
  const busy=text(node?.getAttribute?.('aria-busy'),12);
  const hidden=Boolean(node?.hidden||node?.getAttribute?.('aria-hidden')==='true');
  return Object.freeze({
    ...descriptor,
    visible:!hidden,
    signature:[
      descriptor.kind,
      status,
      busy,
      copy,
      hidden?'hidden':'visible',
    ].join('|'),
  });
}

export function shouldAnimateM26StateTransition(previousSignature,nextState){
  return Boolean(
    nextState?.visible&&
    nextState.signature&&
    nextState.signature!==previousSignature
  );
}

function visitMotionStateNodes(node,visit){
  if(!node||typeof visit!=='function')return;
  if(describeM26MotionState(node))visit(node);
  for(const child of node.querySelectorAll?.(M26_MOTION_STATE_SELECTOR)||[])visit(child);
}

export function createM26MotionController({
  root,
  scope=globalThis,
}={}){
  if(!root?.addEventListener)throw new Error('M26_MOTION_ROOT_REQUIRED');

  let mounted=false;
  let reduced=prefersReducedMotion(scope);
  let observer=null;
  let mediaQuery=null;
  const stateSignatures=new WeakMap();

  function markRoot(){
    try{
      root.dataset.motionEngine='waapi';
      root.dataset.reducedMotion=reduced?'true':'false';
    }catch{}
  }

  function animate(node,preset){
    if(!node)return;
    animateM26Node(node,preset,{reduced});
  }

  function primeMotionStates(){
    visitMotionStateNodes(root,(node)=>{
      const state=describeM26MotionState(node);
      if(state)stateSignatures.set(node,state.signature);
    });
  }

  function animateStatusNode(node){
    visitMotionStateNodes(node,(target)=>{
      const nextState=describeM26MotionState(target);
      if(!nextState)return;
      const previousSignature=stateSignatures.get(target)||null;
      stateSignatures.set(target,nextState.signature);
      if(shouldAnimateM26StateTransition(previousSignature,nextState)){
        animate(target,nextState.preset);
      }
    });
  }

  function onClick(event){
    const button=event.target?.closest?.('[data-session-action]');
    if(!button)return;
    const action=text(button.getAttribute?.('data-session-action'),80);
    const intent=motionIntentForSessionAction(action);
    if(!intent)return;
    queueAfterEvent(scope,()=>animate(actionTarget(root,action,button),intent));
  }

  function onFilter(event){
    if(!isFilterControl(event.target))return;
    queueAfterEvent(
      scope,
      ()=>animate(
        candidate(root,'[data-client-grid]')||
        candidate(root,'.m26-session-builder'),
        'filter',
      ),
    );
  }

  function onExternalFeedback(event){
    const preset=text(event?.detail?.preset,40)||'feedback';
    const selector=text(event?.detail?.selector,160);
    const node=selector?candidate(root,selector):candidate(root,'.m26-action-state');
    queueAfterEvent(scope,()=>animate(node,preset));
  }

  function onPreferenceChange(event){
    reduced=Boolean(event?.matches);
    markRoot();
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      reduced=prefersReducedMotion(scope);
      markRoot();
      primeMotionStates();
      root.addEventListener('click',onClick,true);
      root.addEventListener('input',onFilter,true);
      root.addEventListener('change',onFilter,true);
      root.addEventListener('m26:motion-feedback',onExternalFeedback);
      if(typeof scope?.MutationObserver==='function'){
        observer=new scope.MutationObserver((records)=>{
          for(const record of records){
            for(const node of interestingMutationNodes(record))animateStatusNode(node);
          }
        });
        observer.observe(root,{
          childList:true,
          subtree:true,
          attributes:true,
          attributeFilter:['class','data-status','aria-busy','aria-hidden','hidden'],
        });
      }
      try{
        mediaQuery=scope?.matchMedia?.('(prefers-reduced-motion: reduce)')||null;
        mediaQuery?.addEventListener?.('change',onPreferenceChange);
      }catch{
        mediaQuery=null;
      }
      mounted=true;
    },
    destroy(){
      if(!mounted)return;
      root.removeEventListener('click',onClick,true);
      root.removeEventListener('input',onFilter,true);
      root.removeEventListener('change',onFilter,true);
      root.removeEventListener('m26:motion-feedback',onExternalFeedback);
      observer?.disconnect?.();
      observer=null;
      mediaQuery?.removeEventListener?.('change',onPreferenceChange);
      mediaQuery=null;
      try{
        delete root.dataset.motionEngine;
        delete root.dataset.reducedMotion;
      }catch{}
      mounted=false;
    },
    isReduced:()=>reduced,
  });
}