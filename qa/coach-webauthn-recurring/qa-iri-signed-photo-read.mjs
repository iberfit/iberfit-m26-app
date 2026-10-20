// U26: a signed Storage URL is a read capability, not an upload.
// The QA interceptor keeps all mutations blocked, including uploads, and
// grants only these exact privately-scoped photogrammetry originals.
// Supabase QA private bucket + storage.objects RLS were verified 20-Oct-2026.
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SIGNED_IRI_PHOTO=new RegExp(
  '^/storage/v1/object/sign/iberfit-iri-photogrammetry/'+UUID+'/'+UUID+
  '/(?:front|back|left|right)/'+UUID+'/original\\.(?:png|jpg)$','u'
);
const BEARER=/^Bearer [A-Za-z0-9_.~-]+$/u;
const SIGNED_TOKEN=/^[A-Za-z0-9_.~-]{30,4096}$/u;

export function isQaIriSignedPhotoRead(request,{qaOrigin}={}){
  if(!request||!qaOrigin)return false;
  let url,raw;
  try{raw=request.url();url=new URL(raw);}catch{return false;}
  // URL.origin ignores embedded username/password; never accept userinfo.
  // Verify the raw path is already canonical: URL() collapses ../ and encoded dot segments.
  const rawPath=/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/iu.exec(raw)?.[1]||'/';
  if(url.username||url.password||rawPath!==url.pathname)return false;
  if(url.origin!==qaOrigin||url.hash||!SIGNED_IRI_PHOTO.test(url.pathname))return false;
  const method=String(request.method()).toUpperCase();
  if(method==='POST'){
    if(url.search)return false;
    const headers=request.headers?.()||{};
    if(!BEARER.test(String(headers.authorization||headers.Authorization||'')))return false;
    try{
      const body=request.postDataJSON();
      return Boolean(body)&&typeof body==='object'&&!Array.isArray(body)&&
        Object.keys(body).length===1&&Number.isInteger(body.expiresIn)&&
        body.expiresIn>=60&&body.expiresIn<=600;
    }catch{return false;}
  }
  if(method==='GET'){
    // Exact raw query only: URLSearchParams would canonicalize encoded keys/values.
    return url.search.startsWith('?token=')&&SIGNED_TOKEN.test(url.search.slice(7));
  }
  return false; // No PUT, PATCH, DELETE, upload, list, signMany or public object.
}


// Applied only to the isolated Coach WebAuthn QA interceptor, never production traffic.
// Minimise private photograph request evidence, including DENIED requests.
// Never serialise client, assessment or capture IDs or signed URL tokens.
export function qaIriPrivatePhotoEvidenceLabel(request,{qaOrigin}={}){
  if(!request)return null;
  let url;
  try{url=new URL(request.url());}catch{return null;}
  let pathname=url.pathname;
  // Privacy recognition only: unwrap bounded encoding layers without resolving or
  // trusting the path. A doubly encoded bucket must not fall back to raw logging.
  let privatePath=false;
  for(let depth=0;depth<4;depth++){
    if(pathname.toLowerCase().includes('iberfit-iri-photogrammetry')){privatePath=true;break;}
    let decoded;
    try{decoded=decodeURIComponent(pathname);}catch{break;}
    if(decoded===pathname)break;
    pathname=decoded;
  }
  if(!privatePath)return null;
  const method=String(request.method()).toUpperCase();
  const safeMethod=/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/u.test(method)?method:'OTHER';
  const scope=qaOrigin&&url.origin===qaOrigin?'qa-supabase':'other-origin';
  const operation=/^\/storage\/v1\/object\/sign\//iu.test(pathname)?'sign':'other';
  const view=pathname.match(/\/(front|back|left|right)(?:\/|$)/iu)?.[1]?.toLowerCase()||'unknown';
  return safeMethod+' '+scope+' private-iri-photo operation:'+operation+' view:'+view;
}
