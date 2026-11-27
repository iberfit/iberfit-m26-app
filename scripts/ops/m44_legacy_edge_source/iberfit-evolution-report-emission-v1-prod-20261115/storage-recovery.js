// The Edge broker owns all writes. A timeout may occur AFTER Storage commits.
// A retry with the same requestId must recover only a byte-valid artifact
// whose embedded identity matches the authorized canonical report snapshot.
// Never delete the path here: another identical request may have finalized it.
export async function ensureStoredPdfArtifact({
 bucket,path,bytes,expectedHash,digest,validateExisting,
}={}){
 if(!bucket||!path||!(bytes instanceof Uint8Array)||typeof digest!=='function'||
    typeof validateExisting!=='function'||!(/^[0-9a-f]{64}$/u).test(String(expectedHash||'')))
  throw Error('M44_PDF_STORAGE_INPUT_INVALID');
 const upload=await bucket.upload(path,bytes,{
  contentType:'application/pdf',cacheControl:'31536000',upsert:false,
 });
 let fetched;
 try{fetched=await bucket.download(path);}
 catch(error){
  if(upload.error)throw upload.error;
  throw Error('M44_PDF_STORAGE_READBACK_FAILED');
 }
 if(fetched.error||!fetched.data){
  if(upload.error)throw upload.error;
  throw Error('M44_PDF_STORAGE_READBACK_FAILED');
 }
 const actual=new Uint8Array(await fetched.data.arrayBuffer());
 if(actual.length<1024||actual.length>20*1024*1024)
  throw Error('M44_PDF_STORAGE_BYTES_INVALID');
 const actualHash=await digest(actual);
 if(upload.error){
  // Exact re-render bytes need not match: PDF creation time can change.
  // The saved PDF must nonetheless carry THIS report + revision + source hash.
  try{await validateExisting(actual);}
  catch{throw Error('M44_PDF_ORPHAN_REPLAY_COLLISION');}
 }else if(actual.length!==bytes.length||actualHash!==expectedHash){
  throw Error('M44_PDF_STORAGE_CHECKSUM_MISMATCH');
 }
 return {sha256:actualHash,size:actual.length,recovered:Boolean(upload.error)};
}
