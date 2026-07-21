let sequence=0;
function bytesToUuid(bytes){
  bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=[...bytes].map((value)=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function createM26Id(){
  try{const value=globalThis.crypto?.randomUUID?.();if(value)return value;}catch{}
  try{if(globalThis.crypto?.getRandomValues){const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);return bytesToUuid(bytes);}}catch{}
  sequence=(sequence+1)%0xffffff;
  const time=Date.now().toString(16).padStart(12,'0').slice(-12);
  const entropy=(Number(globalThis.performance?.now?.()||0)*1000|0).toString(16).padStart(6,'0').slice(-6);
  const tail=`${time.slice(0,4)}${entropy.slice(0,2)}${sequence.toString(16).padStart(6,'0')}`;
  return `00000000-0000-4000-8000-${tail}`;
}
