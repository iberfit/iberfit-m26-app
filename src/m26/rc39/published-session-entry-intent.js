// A pre-interactive click can only open the matching published session workspace.
// This queue never issues, synthesizes or retries a training mutation itself.
export function createPublishedSessionEntryReplay({
  readScope,findButtons,now=()=>Date.now(),maxAgeMs=8_000,
}={}){
  if(typeof readScope!=='function'||typeof findButtons!=='function')
    throw new TypeError('M26_SESSION_ENTRY_REPLAY_DEPENDENCY_REQUIRED');
  let pending=null;
  const snapshot=()=>{
    const scope=readScope()||{};
    return {
      owner:scope.owner||null,
      role:String(scope.role||'').trim().toLowerCase(),
      clientId:String(scope.clientId||''),
      selectedClientId:String(scope.selectedClientId||''),
      area:String(scope.area||''),
    };
  };
  function capture(button){
    const action=String(button?.getAttribute?.('data-workflow-action')||'');
    const sessionId=String(button?.getAttribute?.('data-entity-id')||'').trim();
    const scope=snapshot();
    if(action!=='start-published-session'||!sessionId||!scope.owner||
      !['client','cliente','coach','entrenador'].includes(scope.role)||
      !(scope.clientId||scope.selectedClientId))return false;
    const at=Number(now());
    if(!Number.isFinite(at))return false;
    // The most recent explicit user choice wins. Never enqueue mutations.
    pending={sessionId,scope,at};
    return true;
  }
  function release(){
    const intent=pending;
    pending=null;
    if(!intent)return false;
    const elapsed=Number(now())-intent.at;
    if(!Number.isFinite(elapsed)||elapsed<0||elapsed>maxAgeMs)return false;
    const current=snapshot();
    if(Object.keys(intent.scope).some(key=>current[key]!==intent.scope[key]))
      return false;
    const buttons=Array.from(findButtons()||[]);
    const button=buttons.find(candidate=>
      candidate?.getAttribute?.('data-workflow-action')==='start-published-session'&&
      String(candidate?.getAttribute?.('data-entity-id')||'').trim()===intent.sessionId&&
      candidate.disabled!==true&&candidate.isConnected!==false&&
      typeof candidate.click==='function');
    if(!button)return false;
    button.click();
    return true;
  }
  function cancel(){pending=null;}
  return Object.freeze({capture,release,cancel});
}
