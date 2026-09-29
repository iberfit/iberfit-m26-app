(()=>{
  const sw=globalThis.navigator?.serviceWorker;
  if(!sw?.controller||typeof sw.getRegistration!=='function')return;

  void sw.getRegistration('/').then((registration)=>{
    if(!registration)return;

    const activateWaiting=()=>{
      if(!registration.waiting||!sw.controller)return false;
      registration.waiting.postMessage?.({type:'SKIP_WAITING'});
      return true;
    };

    const armInstalling=()=>{
      const installing=registration.installing;
      if(!installing)return false;
      if(installing.state==='installed')return activateWaiting();

      const onStateChange=()=>{
        if(installing.state!=='installed')return;
        installing.removeEventListener?.('statechange',onStateChange);
        activateWaiting();
      };
      installing.addEventListener?.('statechange',onStateChange);
      return true;
    };

    registration.addEventListener?.('updatefound',armInstalling);
    armInstalling();
    activateWaiting();
  }).catch(()=>{});
})();
