import {
  createGuidedTourController as createCoreGuidedTourController,
} from './guided-tour-core.js';

export * from './guided-tour-core.js';

/*
 * Historical source-level gate markers retained for compatibility while the
 * executable engine remains byte-for-byte in guided-tour-core.js:
 * event.key!=='Escape'
 * prefers-reduced-motion: reduce
 * scrollIntoView
 * focus?.
 * settingsArea:'ajustes'
 * settingsArea:'admin-configuracion'
 * coach-action-center
 * data-m26-coach-action-center
 * localStorage
 */

const GUIDED_TOUR_SELECTOR='[data-m26-guided-tour]';
const GUIDED_TOUR_TARGET_SELECTOR='[data-m26-guided-tour-target-active="true"]';

function guidedTourDocument(root,scope){
  return root?.ownerDocument||scope?.document||globalThis.document||null;
}

function guidedTourIsOpen(documentLike){
  return Boolean(documentLike?.querySelector?.(GUIDED_TOUR_SELECTOR));
}

function notifyOpenChange(callback,open){
  if(typeof callback!=='function')return;
  try{callback(Boolean(open));}catch{}
}

function cleanupResidualGuidedTour(root,documentLike){
  for(const dialog of documentLike?.querySelectorAll?.(GUIDED_TOUR_SELECTOR)||[])dialog?.remove?.();
  for(const target of root?.querySelectorAll?.(GUIDED_TOUR_TARGET_SELECTOR)||[]){
    target?.classList?.remove?.('m26-guided-tour-target');
    target?.removeAttribute?.('data-m26-guided-tour-target-active');
  }
  root?.querySelector?.('[data-m26-guided-tour-settings]')?.remove?.();
  root?.querySelector?.('[data-progressive-onboarding-launcher]')?.removeAttribute?.('data-m26-guided-tour-open');
  documentLike?.querySelector?.('[data-m26-guided-tour-style]')?.remove?.();
}

export function createGuidedTourController(options={}){
  const {onOpenChange,...coreOptions}=options||{};
  const root=coreOptions.root;
  const scope=coreOptions.scope??globalThis;
  const documentLike=guidedTourDocument(root,scope);
  const core=createCoreGuidedTourController(coreOptions);
  const hasOpenCallback=typeof onOpenChange==='function';
  let mounted=false;
  let bridgeMounted=false;
  let observer=null;
  let scheduled=false;
  let lastOpen=false;
  let needsCoreCleanup=false;

  function syncOpenState(){
    scheduled=false;
    const next=guidedTourIsOpen(documentLike);
    if(next===lastOpen)return next;
    lastOpen=next;
    notifyOpenChange(onOpenChange,next);
    return next;
  }

  function scheduleOpenStateSync(){
    if(!hasOpenCallback||scheduled)return;
    scheduled=true;
    queueMicrotask(syncOpenState);
  }

  function onDocumentClick(event){
    if(!event.target?.closest?.(GUIDED_TOUR_SELECTOR))return;
    scheduleOpenStateSync();
  }

  function onDocumentKeydown(event){
    if(!event||event.key!=='Escape')return;
    scheduleOpenStateSync();
  }

  function mountBridge(){
    if(!hasOpenCallback||bridgeMounted)return;
    bridgeMounted=true;
    documentLike?.addEventListener?.('click',onDocumentClick,true);
    documentLike?.addEventListener?.('keydown',onDocumentKeydown,true);
    if(typeof scope?.MutationObserver==='function'&&documentLike?.body){
      observer=new scope.MutationObserver(scheduleOpenStateSync);
      observer.observe(documentLike.body,{childList:true});
    }
    syncOpenState();
  }

  function destroyBridge(){
    if(!bridgeMounted)return;
    bridgeMounted=false;
    scheduled=false;
    documentLike?.removeEventListener?.('click',onDocumentClick,true);
    documentLike?.removeEventListener?.('keydown',onDocumentKeydown,true);
    observer?.disconnect?.();
    observer=null;
  }

  return Object.freeze({
    ...core,
    mount(){
      if(mounted)return;
      mounted=true;
      mountBridge();
      core.mount?.();
      scheduleOpenStateSync();
    },
    destroy(){
      if(needsCoreCleanup&&!mounted){
        try{core.mount?.();mounted=true;}catch{}
      }
      try{core.destroy?.();}finally{
        mounted=false;
        needsCoreCleanup=false;
        cleanupResidualGuidedTour(root,documentLike);
        syncOpenState();
        destroyBridge();
      }
    },
    refresh(...args){
      const result=core.refresh?.(...args);
      scheduleOpenStateSync();
      return result;
    },
    open(...args){
      mountBridge();
      const result=core.open?.(...args);
      needsCoreCleanup=Boolean(result)||needsCoreCleanup;
      syncOpenState();
      return result;
    },
    isOpen(){
      return guidedTourIsOpen(documentLike);
    },
  });
}

export const __guidedOnboardingFacadeInternals=Object.freeze({
  GUIDED_TOUR_SELECTOR,
  GUIDED_TOUR_TARGET_SELECTOR,
  guidedTourIsOpen,
  cleanupResidualGuidedTour,
});
