// Certification-only bridge. The session lease survives token rotation, not
// a fresh login. Never persist reviews, replay decisions or expose the token.
export function createDocumentConsentApi({transport,getScope,getToken}={}){
 const available=()=>transport?.connected360DocumentCandidateAvailable?.()===true;
 const run=async(args,method)=>{
  const scope=getScope?.();
  const check=()=>{
   const current=getScope?.();
   if(!available()||args.signal?.aborted||!scope?.lease||!scope.ownerId||!scope.clientId||current?.lease!==scope.lease||current?.ownerId!==scope.ownerId||current?.clientId!==scope.clientId)throw Error('GX_DOCUMENT_SESSION_CHANGED');
  };
  check();const token=await getToken();check();
  const result=await method(token,scope.clientId,args);check();return result;
 };
 return Object.freeze({available,
  inbox:args=>run(args,(token,clientId,{after,signal})=>transport.connected360DocumentCandidateInbox(token,clientId,after,{signal})),
  review:args=>run(args,(token,clientId,{requestId,preview,signal})=>transport.connected360DocumentCandidateReview(token,clientId,requestId,preview,{signal})),
  decide:args=>run(args,(token,_clientId,{params,signal})=>transport.connected360DocumentCandidateDecide(token,params,{signal})),
 });
}
