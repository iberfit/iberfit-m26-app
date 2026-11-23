// Shared browser-storage selector for strictly public, short-lived resources.
// Never use this for identity, JWT, role, invitation, workout or client data.
// Browsers may deny localStorage or sessionStorage; callers must be able to
// fetch authoritative data when either cache is unavailable.
export function publicResourceCacheStores(scope=globalThis){
  const stores=[];
  for(const key of ['localStorage','sessionStorage']){
    try{
      const store=scope[key];
      if(store&&typeof store.getItem==='function'&&
        typeof store.setItem==='function'&&typeof store.removeItem==='function')
        stores.push(store);
    }catch{} // Privacy mode / blocked storage is a normal non-error state.
  }
  return stores;
}
