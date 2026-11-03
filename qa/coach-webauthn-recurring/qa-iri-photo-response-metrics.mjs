// QA-only shape diagnostics for the five IRI photogrammetry GETs.
// Neither bodies, identifiers, URLs, tokens, headers nor raw errors are persisted.
// The observer must not initiate any extra Supabase request.
const TABLES=Object.freeze([
  'iri_consents_v1',
  'iri_photogrammetry_captures_v1',
  'iri_photogrammetry_analyses_v1',
  'iri_photogrammetry_analyses_v2',
  'iri_photo_report_permissions_v1',
]);
const TABLE_SET=new Set(TABLES);
const MAX_INSPECT_BYTES=2_000_000;

export function qaIriPhotoStateTable(request,qaOrigin){
  try{
    const url=new URL(request.url());
    const expectedOrigin=new URL(qaOrigin).origin;
    if(expectedOrigin!==url.origin||url.protocol!=='https:'||request.method().toUpperCase()!=='GET')return null;
    const prefix='/rest/v1/';
    if(!url.pathname.startsWith(prefix))return null;
    const table=url.pathname.slice(prefix.length);
    return TABLE_SET.has(table)?table:null;
  }catch{return null;}
}

export function summarizeQaIriPhotoStateResponse({
  table,status=0,contentType='',rawText=null,timing=null,networkFailure=false,
}={}){
  if(!TABLE_SET.has(table))return null;
  const numeric=Number(status);
  const httpStatus=Number.isInteger(numeric)&&numeric>=100&&numeric<=599?numeric:0;
  const mediaType=String(contentType).split(';',1)[0].trim().toLowerCase();
  const contentKind=mediaType==='application/json'?'json'
    :mediaType.startsWith('application/')&&mediaType.endsWith('+json')?'vendor-json'
      :mediaType?'other':'missing';
  const duration=Number(timing?.responseEnd);
  const durationMs=timing&&Number.isFinite(duration)&&duration>=0?Math.round(duration):null;
  let shape='unavailable',rows=null,bodyBytes=null;
  if(networkFailure)shape='network-failure';
  else if(typeof rawText==='string'){
    bodyBytes=Buffer.byteLength(rawText,'utf8');
    if(bodyBytes>MAX_INSPECT_BYTES)shape='inspection-limit';
    else{
      try{
        const payload=JSON.parse(rawText);
        if(Array.isArray(payload)){shape='array';rows=payload.length;}
        else if(payload===null)shape='null';
        else if(typeof payload==='object')shape='object';
        else shape=typeof payload;
      }catch{shape='invalid-json';}
    }
  }
  return Object.freeze({table,httpStatus,contentKind,shape,rows,bodyBytes,durationMs});
}

export function summarizeQaIriPhotoStateChecks(samples=[]){
  const valid=(Array.isArray(samples)?samples:[])
    .filter(item=>item&&TABLE_SET.has(item.table))
    .slice(0,32);
  return Object.freeze({
    schema:'iberfit.qa.iri-photo-response-shape.v1',
    requests:valid.length,
    truncated:Array.isArray(samples)&&samples.length>32,
    mismatches:valid.filter(item=>item.httpStatus<200||item.httpStatus>=300||item.shape!=='array').length,
    samples:Object.freeze(valid),
  });
}
