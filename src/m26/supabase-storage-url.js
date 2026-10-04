function clean(value,max=4000){
  return String(value??'').trim().slice(0,max);
}

export function resolveSupabaseStorageSignedUrl({
  origin,
  signedPath,
  bucketId,
  errorPrefix='M26_SUPABASE_STORAGE_SIGN',
}={}){
  let expectedOrigin;
  try{expectedOrigin=new URL(clean(origin,1000)).origin;}
  catch{throw new Error(errorPrefix+'_ORIGIN_INVALID');}

  const raw=clean(signedPath,4000);
  if(!raw)throw new Error(errorPrefix+'_INVALID_RESPONSE');

  let url;
  try{
    if(/^https?:\/\//iu.test(raw)){
      url=new URL(raw);
    }else{
      const normalized=raw.startsWith('/storage/v1/')
        ?raw
        :raw.startsWith('/object/')
          ?'/storage/v1'+raw
          :'';
      if(!normalized)throw new Error('PATH_INVALID');
      url=new URL(normalized,expectedOrigin+'/');
    }
  }catch{
    throw new Error(errorPrefix+'_PATH_INVALID');
  }

  if(url.origin!==expectedOrigin)throw new Error(errorPrefix+'_ORIGIN_INVALID');
  const bucket=encodeURIComponent(clean(bucketId,200));
  if(!bucket||!url.pathname.startsWith('/storage/v1/object/sign/'+bucket+'/')){
    throw new Error(errorPrefix+'_PATH_INVALID');
  }
  return url.href;
}
