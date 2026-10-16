Deno.serve((_req)=>{
  return new Response(JSON.stringify({ok:false,code:'IBERFIT_PROBE_RETIRED'}),{
    status:410,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
    },
  });
});