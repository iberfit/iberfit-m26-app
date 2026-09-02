const RPC=Object.freeze({
  roles:'iberfit_authorized_application_roles_v13',
  listChanges:'iberfit_appointment_change_requests_v13',
  requestChange:'iberfit_request_appointment_change_v13',
  resolveChange:'iberfit_resolve_appointment_change_v13',
});
const MISSING=/PGRST202|not find the function|M26_HTTP_404/i;
const ROLE_SET=new Set(['coach','admin','client']);
const DEFAULT_TIMEOUT_MS=12_000;
const safeText=(value,max=800)=>String(value??'')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ')
  .trim()
  .slice(0,max);

function runtimeOrigin(runtime){
  const url=new URL(String(runtime?.url||''));
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1','::1'].includes(url.hostname)){
    throw new Error('M26_RC39_HTTPS_REQUIRED');
  }
  return url.origin;
}
function requestTimeout(runtime){
  return Math.max(1_000,Math.min(Number(runtime?.timeoutMs||DEFAULT_TIMEOUT_MS),30_000));
}
export function createRc39Transport({runtime,fetchImpl=globalThis.fetch}={}){
  if(typeof fetchImpl!=='function')throw new Error('M26_RC39_FETCH_REQUIRED');
  const origin=runtimeOrigin(runtime);
  const key=String(runtime?.publishableKey||runtime?.anonKey||'');
  if(!key)throw new Error('M26_RC39_PUBLIC_KEY_REQUIRED');
  const timeoutMs=requestTimeout(runtime);

  async function rpc(name,token,params={}){
    const auth=String(token||'');
    if(!auth)throw new Error('M26_AUTH_REQUIRED');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(`${origin}/rest/v1/rpc/${name}`,{
        method:'POST',
        credentials:'omit',
        cache:'no-store',
        redirect:'error',
        referrerPolicy:'no-referrer',
        signal:controller.signal,
        headers:{
          apikey:key,
          authorization:`Bearer ${auth}`,
          'content-type':'application/json',
          'x-client-info':`iberfit-m26-rc39/${safeText(runtime?.version||'26.0.0',80)}`,
        },
        body:JSON.stringify(params||{}),
      });
      const contentType=response.headers?.get?.('content-type')||'';
      const body=response.status===204?null:contentType.includes('application/json')
        ?await response.json().catch(()=>({}))
        :await response.text().catch(()=>'');
      if(!response.ok){
        const error=new Error(body?.message||body?.error||`M26_HTTP_${response.status}`);
        error.status=response.status;
        error.body=body;
        throw error;
      }
      return Array.isArray(body)&&body.length===1?body[0]:body;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('M26_TIMEOUT');
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }
  async function optional(name,token,params={}){
    try{return {available:true,data:await rpc(name,token,params)};}
    catch(error){
      if(error?.status===404||MISSING.test(String(error?.message||error))){
        return {available:false,data:null};
      }
      throw error;
    }
  }
  async function extensions(token){
    const [roles,changes]=await Promise.all([
      optional(RPC.roles,token,{}),
      optional(RPC.listChanges,token,{}),
    ]);
    const rawRoles=roles.data?.roles;
    const authorizedRoles=Array.isArray(rawRoles)
      ?[...new Set(rawRoles.map((role)=>String(role||'').toLowerCase()).filter((role)=>ROLE_SET.has(role)))]
      :[];
    const requests=Array.isArray(changes.data?.requests)?changes.data.requests:[];
    return Object.freeze({
      rolesAvailable:roles.available,
      authorizedRoles:Object.freeze(authorizedRoles),
      changeRequestsAvailable:changes.available,
      changeRequests:Object.freeze(requests.map((item)=>Object.freeze({...item}))),
    });
  }
  async function requestAppointmentChange(token,{appointmentId,clientId,reason}={}){
    const result=await rpc(RPC.requestChange,token,{
      p_appointment_id:safeText(appointmentId,180),
      p_client_id:safeText(clientId,180),
      p_reason:safeText(reason,500),
    });
    if(result?.ok!==true)throw new Error('M26_APPOINTMENT_CHANGE_NOT_CONFIRMED');
    return Object.freeze({...result});
  }
  async function resolveAppointmentChange(token,{requestId,resolution,note=''}={}){
    const clean=String(resolution||'').toLowerCase();
    if(!['accepted','rejected','resolved'].includes(clean))throw new Error('M26_APPOINTMENT_CHANGE_RESOLUTION_INVALID');
    const result=await rpc(RPC.resolveChange,token,{
      p_request_id:safeText(requestId,180),
      p_resolution:clean,
      p_note:safeText(note,500),
    });
    if(result?.ok!==true)throw new Error('M26_APPOINTMENT_CHANGE_RESOLUTION_NOT_CONFIRMED');
    return Object.freeze({...result});
  }
  return Object.freeze({extensions,requestAppointmentChange,resolveAppointmentChange});
}
export function mergeRc39ChangeRequests(appointments=[],requests=[]){
  const byAppointment=new Map();
  for(const request of requests||[]){
    const id=String(request?.appointmentId||request?.appointment_id||'');
    if(!id)continue;
    const current=byAppointment.get(id);
    const currentAt=new Date(current?.createdAt||current?.created_at||0).getTime()||0;
    const nextAt=new Date(request?.createdAt||request?.created_at||0).getTime()||0;
    if(!current||nextAt>=currentAt)byAppointment.set(id,request);
  }
  return appointments.map((appointment)=>{
    const id=String(appointment?.id||appointment?.entityId||appointment?.entity_id||'');
    const request=byAppointment.get(id);
    if(!request)return appointment;
    return {
      ...appointment,
      changeRequest:{...request},
      changeRequestedAt:request.createdAt||request.created_at||null,
      changeRequestReason:request.reason||null,
    };
  });
}
