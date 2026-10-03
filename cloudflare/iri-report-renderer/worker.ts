interface Env {
  BROWSER: BrowserRun;
  IRI_RENDERER_PUBLIC_KEY_SPKI_B64: string;
  IRI_RENDERER_AUDIENCE: string;
}

const MAX_BODY_BYTES=4_000_000;
const MAX_KEY_CHARS=4096;
const MAX_SIGNATURE_CHARS=256;
const MAX_SKEW_SECONDS=120;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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
function b64Bytes(value:string){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  const binary=atob(padded);
  return Uint8Array.from(binary,(char)=>char.charCodeAt(0));
}
async function sha256Hex(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}
async function verifyRequest(request:Request,env:Env,raw:string){
  const publicKeyB64=String(env.IRI_RENDERER_PUBLIC_KEY_SPKI_B64||'').trim();
  const expectedAudience=String(env.IRI_RENDERER_AUDIENCE||'').trim();
  if(!publicKeyB64||publicKeyB64.length>MAX_KEY_CHARS||!expectedAudience)return false;

  const version=String(request.headers.get('x-iberfit-renderer-version')||'').trim();
  const timestamp=String(request.headers.get('x-iberfit-renderer-ts')||'').trim();
  const nonce=String(request.headers.get('x-iberfit-renderer-nonce')||'').trim();
  const audience=String(request.headers.get('x-iberfit-renderer-audience')||'').trim();
  const signature=String(request.headers.get('x-iberfit-renderer-signature')||'').trim();
  if(version!=='1'||audience!==expectedAudience||!UUID.test(nonce)||!signature||signature.length>MAX_SIGNATURE_CHARS)return false;

  const timestampSeconds=Number(timestamp);
  const nowSeconds=Math.floor(Date.now()/1000);
  if(!Number.isInteger(timestampSeconds)||Math.abs(nowSeconds-timestampSeconds)>MAX_SKEW_SECONDS)return false;

  let publicKey:CryptoKey;
  try{
    publicKey=await crypto.subtle.importKey(
      'spki',
      b64Bytes(publicKeyB64),
      {name:'ECDSA',namedCurve:'P-256'},
      false,
      ['verify'],
    );
  }catch{return false;}

  const bodySha256=await sha256Hex(raw);
  const signedPayload=`v1\n${timestamp}\n${nonce}\n${audience}\n${bodySha256}`;
  try{
    return await crypto.subtle.verify(
      {name:'ECDSA',hash:'SHA-256'},
      publicKey,
      b64Bytes(signature),
      new TextEncoder().encode(signedPayload),
    );
  }catch{return false;}
}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    if(request.method!=='POST')return response(405,'METHOD_NOT_ALLOWED');

    const declared=Number(request.headers.get('content-length')||0);
    if(Number.isFinite(declared)&&declared>MAX_BODY_BYTES)return response(413,'BODY_TOO_LARGE');
    const raw=await request.text();
    if(!raw||new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return response(413,'BODY_TOO_LARGE');
    if(!(await verifyRequest(request,env,raw)))return response(401,'UNAUTHORIZED');

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
