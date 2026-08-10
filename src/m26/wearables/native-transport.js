const EVENT_NAME='iberfit:native-live-telemetry';
const IOS_HANDLER='iberfitLiveTelemetry';

function parseDetail(detail){
  if(detail&&typeof detail==='object')return detail;
  if(typeof detail!=='string')return null;
  try{return JSON.parse(detail);}catch{return null;}
}
function iosSender(scope){
  const handler=scope?.webkit?.messageHandlers?.[IOS_HANDLER];
  return typeof handler?.postMessage==='function'
    ?(message)=>handler.postMessage(message)
    :null;
}
function androidSender(scope){
  const bridge=scope?.IBERFIT_ANDROID_LIVE_TELEMETRY;
  return typeof bridge?.postMessage==='function'
    ?(message)=>bridge.postMessage(JSON.stringify(message))
    :null;
}
function commandSender(scope){return iosSender(scope)||androidSender(scope);}
function post(scope,action,payload={}){
  const send=commandSender(scope);
  if(!send)throw new Error('M26_NATIVE_LIVE_TRANSPORT_UNAVAILABLE');
  send(Object.freeze({action,...payload}));
}
export function nativeTelemetryTransportAvailable(scope=globalThis){
  return Boolean(commandSender(scope));
}
export function createNativeTelemetryBridge({scope=globalThis,eventName=EVENT_NAME}={}){
  if(!nativeTelemetryTransportAvailable(scope))return null;
  const listeners=new Set();
  const onEvent=(event)=>{
    const message=parseDetail(event?.detail);
    if(!message||message.type!=='sample')return;
    for(const listener of listeners){
      try{listener(message.sample||{});}catch{}
    }
  };
  let listening=false;
  function ensureListening(){
    if(listening)return;
    scope.addEventListener?.(eventName,onEvent);
    listening=true;
  }
  function maybeStopListening(){
    if(listeners.size||!listening)return;
    scope.removeEventListener?.(eventName,onEvent);
    listening=false;
  }
  return Object.freeze({
    async start({executionId,clientId,metrics=[]}={}){
      ensureListening();
      post(scope,'start',{executionId,clientId,metrics});
      return Object.freeze({provider:null,transport:'native-webview'});
    },
    subscribe(listener){
      if(typeof listener!=='function')throw new Error('M26_NATIVE_LIVE_SUBSCRIBER_REQUIRED');
      listeners.add(listener);
      ensureListening();
      return ()=>{listeners.delete(listener);maybeStopListening();};
    },
    async pause({executionId}={}){post(scope,'pause',{executionId});},
    async resume({executionId}={}){post(scope,'resume',{executionId});},
    async stop({executionId,reason='session-ended'}={}){
      post(scope,'stop',{executionId,reason});
      if(!listeners.size)maybeStopListening();
    },
    transport:'native-webview',
    eventName,
  });
}
export function installNativeTelemetryBridge(scope=globalThis){
  if(scope?.IBERFIT_LIVE_TELEMETRY_BRIDGE)return scope.IBERFIT_LIVE_TELEMETRY_BRIDGE;
  const bridge=createNativeTelemetryBridge({scope});
  if(bridge)scope.IBERFIT_LIVE_TELEMETRY_BRIDGE=bridge;
  return bridge;
}
export const __nativeTelemetryInternals=Object.freeze({
  EVENT_NAME,IOS_HANDLER,parseDetail,iosSender,androidSender,
});
