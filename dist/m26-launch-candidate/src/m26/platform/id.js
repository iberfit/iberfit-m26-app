let sequence=0;
export function createM26Id(){
  try{const value=globalThis.crypto?.randomUUID?.();if(value)return value;}catch{}
  sequence=(sequence+1)%0xffffff;
  const time=Date.now().toString(16).padStart(12,'0').slice(-12);
  const tail=`${time.slice(0,6)}${sequence.toString(16).padStart(6,'0')}`;
  return `00000000-0000-4000-8000-${tail}`;
}
