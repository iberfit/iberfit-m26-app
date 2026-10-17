// Shared controller behavior for the native Admin/Coach/Cliente mobile "Más"
// disclosure. QA visual fixtures use this exact code, never a mock.
export function syncMobileMoreBackground(details,open){
  const shell=details?.closest?.('.m26-shell');
  const workspace=shell?.querySelector?.(':scope > .m26-workspace');
  if(!workspace)return false;
  const next=Boolean(open);
  if(next){
    shell.dataset.m26MobileMoreOpen='true';
    workspace.dataset.m26MobileMoreOpen='true';
  }else{
    delete shell.dataset.m26MobileMoreOpen;
    delete workspace.dataset.m26MobileMoreOpen;
  }
  const targets=[
    workspace.querySelector?.(':scope > .m26-topbar'),
    workspace.querySelector?.(':scope > .m26-main'),
  ].filter(Boolean);
  for(const node of targets){
    if(next){
      if(!node.hasAttribute?.('inert'))node.dataset.m26MobileMoreInert='true';
      node.setAttribute?.('inert','');
    }else if(node.dataset?.m26MobileMoreInert==='true'){
      node.removeAttribute?.('inert');
      delete node.dataset.m26MobileMoreInert;
    }
  }
  return targets.length>0;
}

export function setMobileMoreOpen(details,open){
  if(!details?.matches?.('details.m26-mobile-more'))return false;
  const next=Boolean(open);
  details.open=next;
  if(next)details.setAttribute?.('open','');
  else details.removeAttribute?.('open');
  details.querySelector?.(':scope > summary')?.setAttribute?.('aria-expanded',next?'true':'false');
  syncMobileMoreBackground(details,next);
  return next;
}
