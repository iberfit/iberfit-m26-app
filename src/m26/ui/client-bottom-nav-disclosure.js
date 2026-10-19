// SIGNATURE 360 U11: accessible Client bottom-navigation disclosure.
// Preserve native <details>, permissions, and the mounted route.
const DISCLOSURE='details.m26-client-bottom-nav-more';
const MENU_ITEM='.m26-client-bottom-nav-menu [role="menuitem"]';
export function setClientBottomMoreOpen(details,open){
  if(!details?.matches?.(DISCLOSURE))return false;
  const next=Boolean(open);
  details.open=next;
  if(next)details.setAttribute?.('open','');else details.removeAttribute?.('open');
  details.querySelector?.(':scope > summary')?.setAttribute?.('aria-expanded',next?'true':'false');
  return next;
}
export function syncClientBottomMoreToggle(event){
  const details=event?.target;
  if(!details?.matches?.(DISCLOSURE))return false;
  details.querySelector?.(':scope > summary')?.setAttribute?.('aria-expanded',details.open?'true':'false');
  return true;
}
export function handleClientBottomMoreKeydown(event){
  const details=event?.target?.closest?.(DISCLOSURE);
  if(!details)return false;
  const summary=details.querySelector?.(':scope > summary');
  const items=[...(details.querySelectorAll?.(MENU_ITEM)||[])].filter(item=>!item.disabled);
  const key=String(event.key||'');
  if(key==='Escape'&&details.open){
    event.preventDefault?.();
    setClientBottomMoreOpen(details,false);
    summary?.focus?.({preventScroll:true});
    return true;
  }
  if(event.target===summary&&(key==='ArrowDown'||key==='ArrowUp')){
    event.preventDefault?.();
    setClientBottomMoreOpen(details,true);
    (key==='ArrowDown'?items[0]:items.at(-1))?.focus?.({preventScroll:true});
    return true;
  }
  const current=event.target?.closest?.(MENU_ITEM);
  if(!details.open||!current||!items.includes(current))return false;
  const index=items.indexOf(current);
  const next=key==='ArrowDown'?(index+1)%items.length
    :key==='ArrowUp'?(index+items.length-1)%items.length
      :key==='Home'?0:key==='End'?items.length-1:-1;
  if(next<0)return false;
  event.preventDefault?.();
  items[next]?.focus?.({preventScroll:true});
  return true;
}
export function dismissClientBottomMoreOnClick(root,target){
  const details=root?.querySelector?.(DISCLOSURE+'[open]');
  if(!details)return false;
  if(target?.closest?.(DISCLOSURE+' > summary'))return false;
  if(!details.contains?.(target)||target?.closest?.(MENU_ITEM)){
    setClientBottomMoreOpen(details,false);
    return true;
  }
  return false;
}
export function dismissClientBottomMoreOnFocus(root,target){
  const details=root?.querySelector?.(DISCLOSURE+'[open]');
  if(!details||details.contains?.(target))return false;
  setClientBottomMoreOpen(details,false);
  return true;
}
