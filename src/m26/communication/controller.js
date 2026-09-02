const toast=(message)=>{try{globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}catch{}};
const text=(d,k,m=4000)=>String(d.get(k)||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,m);
export function createCommunicationController({root,service,render=()=>{}}={}){
  let busy=false;
  async function run(input,msg){
    if(busy)return false;
    busy=true;
    try{
      await service.execute(input);
      toast(msg);
      render();
      return true;
    }catch(error){
      toast(/ONLINE_REQUIRED/.test(String(error?.message||error))?'Los mensajes requieren conexión.':'No fue posible confirmar la comunicación.');
      return false;
    }finally{
      busy=false;
    }
  }
  async function onSubmit(event){
    const form=event.target.closest?.('[data-communication-form]');
    if(!form)return false;
    event.preventDefault();
    const d=new FormData(form);
    const kind=form.dataset.communicationForm;
    if(kind==='thread-open'){
      const clientId=text(d,'clientId',200);
      return run({type:'MESSAGE_THREAD_OPEN',entityId:clientId,payload:{clientId,subject:text(d,'subject',160)}},'Conversación abierta.');
    }
    if(kind==='message-send'){
      const threadId=text(d,'threadId',200);
      const ok=await run({type:'MESSAGE_SEND',entityId:threadId,payload:{threadId,body:text(d,'body')}},'Mensaje enviado.');
      if(ok)form.reset();
      return ok;
    }
    if(kind==='thread-read'){
      const threadId=text(d,'threadId',200);
      return run({type:'MESSAGE_MARK_READ',entityId:threadId,payload:{threadId}},'Conversación actualizada.');
    }
    const notificationId=text(d,'notificationId',200);
    return run({type:'NOTIFICATION_MARK_READ',entityId:notificationId,payload:{notificationId}},'Notificación leída.');
  }
  function onSubmitEvent(event){void onSubmit(event).catch(()=>toast('No fue posible procesar la comunicación.'));}
  return Object.freeze({
    mount(){root.addEventListener('submit',onSubmitEvent);},
    destroy(){root.removeEventListener('submit',onSubmitEvent);},
  });
}
