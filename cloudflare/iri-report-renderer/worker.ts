interface Env {
  BROWSER: BrowserRun;
  IRI_RENDERER_SHARED_SECRET: string;
}

const MAX_BODY_BYTES=4_000_000;
const MAX_SECRET_CHARS=256;

function response(status:number,body:string,contentType='text/plain; charset=utf-8'){
  return new Response(body,{
    status,
    headers:{
      'cache-control':'no-store',
      'content-type':contentType,
      'x-content-type-options':'nosniff',
    },
  });
}

async function secureEqual(left:string,right:string){
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([
    crypto.subtle.digest('SHA-256',encoder.encode(left)),
    crypto.subtle.digest('SHA-256',encoder.encode(right)),
  ]);
  const x=new Uint8Array(a),y=new Uint8Array(b);
  let diff=x.length^y.length;
  for(let i=0;i<Math.max(x.length,y.length);i+=1)diff|=(x[i%x.length]??0)^(y[i%y.length]??0);
  return diff===0;
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(request.method!=='POST')return response(405,'METHOD_NOT_ALLOWED');

    const expected=String(env.IRI_RENDERER_SHARED_SECRET||'').trim();
    if(!expected)return response(503,'RENDERER_NOT_CONFIGURED');
    const authorization=String(request.headers.get('authorization')||'').trim();
    if(!authorization.startsWith('Bearer ')||authorization.length>MAX_SECRET_CHARS+7){
      return response(401,'UNAUTHORIZED');
    }
    const supplied=authorization.slice(7).trim();
    if(!supplied||!(await secureEqual(supplied,expected)))return response(401,'UNAUTHORIZED');

    const declared=Number(request.headers.get('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)return response(413,'BODY_TOO_LARGE');
    const raw=await request.text();
    if(!raw||new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return response(413,'BODY_TOO_LARGE');

    let payload:{html?:unknown};
    try{payload=JSON.parse(raw);}catch{return response(400,'BODY_INVALID');}
    const html=typeof payload.html==='string'?payload.html:'';
    if(!html.trim()||html.length>MAX_BODY_BYTES)return response(400,'HTML_INVALID');

    try{
      const rendered=await env.BROWSER.quickAction('pdf',{
        html,
        waitForSelector:{selector:'.pdf-page',visible:true,timeout:10_000},
        waitForTimeout:750,
        pdfOptions:{
          printBackground:true,
          preferCSSPageSize:true,
          tagged:true,
          outline:true,
          timeout:60_000,
        },
      });
      if(!rendered.ok)return response(502,'BROWSER_RUN_FAILED');
      const headers=new Headers(rendered.headers);
      headers.set('cache-control','no-store');
      headers.set('content-type','application/pdf');
      headers.set('x-content-type-options','nosniff');
      headers.delete('set-cookie');
      return new Response(rendered.body,{status:200,headers});
    }catch(error){
      console.error('[iri-renderer]',error instanceof Error?error.name:'error');
      return response(502,'BROWSER_RUN_FAILED');
    }
  },
} satisfies ExportedHandler<Env>;
