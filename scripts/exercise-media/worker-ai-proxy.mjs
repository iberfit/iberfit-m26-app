const IMAGE_MODEL='@cf/black-forest-labs/flux-2-klein-4b';
const QA_MODEL='@cf/moondream/moondream3.1-9B-A2B';

function authorized(request,env){
  const expected=String(env.SMOKE_TOKEN||'');
  const supplied=String(request.headers.get('authorization')||'');
  return expected.length>=24&&supplied===`Bearer ${expected}`;
}

function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}

export default {
  async fetch(request,env){
    if(!authorized(request,env))return json({ok:false,error:'UNAUTHORIZED'},401);
    if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    const url=new URL(request.url);
    try{
      if(url.pathname==='/generate'){
        const contentType=String(request.headers.get('content-type')||'');
        if(!contentType.toLowerCase().startsWith('multipart/form-data'))return json({ok:false,error:'MULTIPART_REQUIRED'},415);
        const result=await env.AI.run(IMAGE_MODEL,{multipart:{body:request.body,contentType}});
        return json({ok:true,model:IMAGE_MODEL,result});
      }
      if(url.pathname==='/qa'){
        const body=await request.json();
        const result=await env.AI.run(QA_MODEL,body);
        return json({ok:true,model:QA_MODEL,result});
      }
      if(url.pathname==='/health')return json({ok:true,ai:true});
      return json({ok:false,error:'NOT_FOUND'},404);
    }catch(error){
      return json({ok:false,error:'AI_BINDING_FAILED',detail:String(error?.message||error).slice(0,500)},502);
    }
  },
};
