import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERSION='client-onboarding-retired-v1';

function headers(){
  return {
    'cache-control':'no-store',
    'content-type':'application/json; charset=utf-8',
    'x-content-type-options':'nosniff',
  };
}

Deno.serve((req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:410,headers:headers()});
  return new Response(
    JSON.stringify({
      ok:false,
      code:'M26_CLIENT_ONBOARDING_RETIRED',
      version:VERSION,
    }),
    {status:410,headers:headers()},
  );
});
