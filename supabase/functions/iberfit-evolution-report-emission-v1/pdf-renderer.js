// Branded, server-owned M44 evolution PDF renderer. pdf-lib injected by Edge.
// Rendering is based on the canonical, redacted, published server snapshot.
export const M44_PDF_TEMPLATE='iberfit-evolution-a4-v1';
const W=595.28,H=841.89;
const C={forest:[.064,.145,.117],forest2:[.15,.27,.21],gold:[.73,.58,.30],
 cream:[.975,.965,.94],ink:[.12,.20,.17],muted:[.37,.44,.40],rule:[.80,.83,.79]};
function safe(v,n=2500){
 return String(v??'').replace(/[\u{10000}-\u{10ffff}]/gu,'')
 .replace(/[^\x20-\xff\n]/gu,' ').replace(/[ \t]+/gu,' ').trim().slice(0,n);
}
function wrap(font,size,v,width){
 const words=safe(v).split(/\s+/u).filter(Boolean),lines=[];let line='';
 for(let word of words){
  while(font.widthOfTextAtSize(word,size)>width){
   if(line){lines.push(line);line='';}
   let k=1;while(k<word.length&&font.widthOfTextAtSize(word.slice(0,k+1),size)<=width)k++;
   lines.push(word.slice(0,k));word=word.slice(k);
  }
  if(!word)continue;
  const next=line?line+' '+word:word;
  if(line&&font.widthOfTextAtSize(next,size)>width){lines.push(line);line=word;}
  else line=next;
 }
 if(line)lines.push(line);
 return lines.length?lines:['Sin registro'];
}
export async function renderEvolutionReportPdf({source,pdfLib,brandImageBytes,generatedAt}={}){
 if(!source||!pdfLib?.PDFDocument||!pdfLib?.StandardFonts||!pdfLib?.rgb)
  throw Error('M44_PDF_RENDER_INPUT_INVALID');
 if(!/^[0-9a-f]{8}-/iu.test(String(source.reportId||''))||
  !/^\d{4}-\d{2}-\d{2}$/u.test(String(source.periodStart||''))||
  !/^\d{4}-\d{2}-\d{2}$/u.test(String(source.periodEnd||''))||
  !Array.isArray(source.evidence)||!source.evidence.length)
  throw Error('M44_PDF_SOURCE_NOT_CANONICAL');
 const {PDFDocument,StandardFonts,rgb}=pdfLib,doc=await PDFDocument.create();
 const serif=await doc.embedFont(StandardFonts.TimesRoman);
 const serifBold=await doc.embedFont(StandardFonts.TimesRomanBold);
 const sans=await doc.embedFont(StandardFonts.Helvetica);
 const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const color=k=>rgb(...C[k]),pages=[];
 function add(kind='inside'){
  const p=doc.addPage([W,H]);pages.push(p);
  p.drawRectangle({x:0,y:0,width:W,height:H,color:color(kind==='cover'?'forest':'cream')});
  if(kind!=='cover'){
   p.drawRectangle({x:0,y:H-13,width:W,height:13,color:color('forest')});
   p.drawText('IBERFIT',{x:52,y:792,size:12,font:bold,color:color('forest')});
   p.drawLine({start:{x:52,y:782},end:{x:543,y:782},thickness:1,color:color('gold')});
  }
  return p;
 }
 const cover=add('cover');
 cover.drawRectangle({x:51,y:110,width:4,height:550,color:color('gold')});
 cover.drawText('IBERFIT',{x:78,y:736,size:23,font:bold,color:color('cream')});
 cover.drawText('ENTRENAMIENTO PERSONAL CON CRITERIO',{x:78,y:713,size:8.5,font:sans,color:color('gold')});
 if(brandImageBytes){try{
  const logo=await doc.embedPng(brandImageBytes);
  const scale=Math.min(70/logo.width,70/logo.height);
  cover.drawImage(logo,{x:455,y:690,width:logo.width*scale,height:logo.height*scale});
 }catch{/* Logo optional, branded wordmark always present. */}}
 cover.drawText('EVOLUCION Y SEGUIMIENTO',{x:79,y:570,size:10,font:bold,color:color('gold')});
 cover.drawText('Tu proceso,',{x:79,y:509,size:41,font:serifBold,color:color('cream')});
 cover.drawText('con perspectiva.',{x:79,y:462,size:39,font:serif,color:color('cream')});
 cover.drawLine({start:{x:79,y:429},end:{x:446,y:429},color:color('gold'),thickness:1.5});
 let yCover=393;
 for(const line of wrap(serif,15,'Comprender lo realizado. Interpretar la evidencia. Decidir que hacer despues.',425)){
  cover.drawText(line,{x:79,y:yCover,size:15,font:serif,color:color('cream')});yCover-=22;
 }
 const meta=[['PREPARADO PARA',safe(source.clientName,100)||'Cliente IBERFIT'],
  ['PERIODO',String(source.periodStart)+'  -  '+String(source.periodEnd)],
  ['INFORME',safe(source.reportType,80)||'Evolucion']];
 let cy=284;
 for(const [k,v] of meta){
  cover.drawText(k,{x:79,y:cy,size:8.2,font:bold,color:color('gold')});
  for(const line of wrap(sans,12.2,v,425)){
   cover.drawText(line,{x:79,y:cy-20,size:12.2,font:sans,color:color('cream')});cy-=15;
  }
  cy-=46;
 }
 cover.drawText('DOCUMENTO BASADO EN REGISTROS CANONICOS IBERFIT',
  {x:79,y:62,size:8,font:sans,color:color('cream')});
 let current,y,section;
 function sectionPage(kicker,title){
  section=title;current=add();
  current.drawText(safe(kicker,90),{x:52,y:743,size:9,font:bold,color:color('gold')});
  let ty=707;
  for(const row of wrap(serifBold,26,title,490)){
   current.drawText(row,{x:52,y:ty,size:26,font:serifBold,color:color('forest')});ty-=31;
  }
  y=ty-18;
 }
 function continuation(){sectionPage('CONTINUACION',section);}
 function flow(v,{font=sans,size=11.6,leading=17,colorName='ink',gap=17}={}){
  for(const p of String(v??'').split(/\n+/u)){
   for(const row of wrap(font,size,p,483)){
    if(y<110+leading)continuation();
    current.drawText(row,{x:55,y,size,font,color:color(colorName)});y-=leading;
   }
   y-=5;
  }
  y-=gap;
 }
 function heading(v){
  if(y<170)continuation();
  current.drawLine({start:{x:55,y:y+10},end:{x:540,y:y+10},color:color('rule'),thickness:.75});
  current.drawText(safe(v,100).toUpperCase(),{x:55,y:y-8,size:9,font:bold,color:color('gold')});y-=35;
 }
 const fallback=v=>safe(v)||'No hay datos adicionales confirmados para esta lectura.';
 sectionPage('01  /  CONTEXTO','Que hemos hecho');
 flow(String(source.periodStart)+' a '+String(source.periodEnd),{font:serifBold,size:17,gap:21});
 heading('Lectura del periodo');flow(fallback(source.summary));
 heading('Como interpretar los resultados');
 flow('Los datos describen lo confirmado. Un cambio de carga, volumen o frecuencia no demuestra por si solo una mejora funcional.');
 flow('El diagnostico inicial IRI se mantiene separado de la evolucion.',{colorName:'muted'});
 if(Array.isArray(source.activitySeries)&&source.activitySeries.length){
  const series=source.activitySeries.slice(0,13).map(item=>({
   date:safe(item?.from,10).slice(5).replace('-','/'),
   end:safe(item?.to,10).slice(5).replace('-','/'),
   count:Number.isInteger(item?.count)&&item.count>=0?item.count:0,
  }));
  sectionPage('02  /  CONTINUIDAD','El ritmo del periodo');
  flow('SESIONES CONFIRMADAS POR PERIODO',{font:bold,size:9,colorName:'gold',gap:0});
  const max=Math.max(1,...series.map(item=>item.count)),bottom=450,top=662,left=77,right=535,step=(right-left)/series.length;
  current.drawLine({start:{x:left,y:bottom},end:{x:right,y:bottom},color:color('muted'),thickness:1});
  current.drawLine({start:{x:left,y:top},end:{x:right,y:top},color:color('rule'),thickness:.8});
  current.drawText('0',{x:55,y:bottom-4,size:8,font:sans,color:color('muted')});
  current.drawText(String(max),{x:49,y:top-4,size:8,font:sans,color:color('muted')});
  series.forEach((item,i)=>{
   const width=Math.min(24,step*.56),height=(top-bottom)*item.count/max;
   const bx=left+i*step+(step-width)/2;
   if(height)current.drawRectangle({x:bx,y:bottom,width,height,color:color('forest2')});
   const n=String(item.count);
   current.drawText(n,{x:bx+width/2-bold.widthOfTextAtSize(n,8)/2,
    y:bottom+height+8,size:8,font:bold,color:color('forest')});
   current.drawText(item.date,{x:bx+width/2-sans.widthOfTextAtSize(item.date,7)/2,
    y:bottom-19,size:7,font:sans,color:color('muted')});
  });
  y=396;
  heading('Detalle y contexto');
  flow('El eje comienza en cero; sin registro de sesion confirmada no equivale a inactividad. La grafica no mide adherencia ni esfuerzo.',{gap:8});
  for(const item of series){
   if(y<112)continuation();
   current.drawText(item.date+' - '+item.end,{x:55,y,size:9,font:sans,color:color('muted')});
   current.drawText(String(item.count)+' sesiones',{x:367,y,size:9,font:bold,color:color('ink')});
   y-=19;
  }
 }
 sectionPage('03  /  EVIDENCIA','Resultados verificables');
 flow('Cada dato conserva su procedencia. No se rellenan mediciones ausentes con estimaciones.',
   {colorName:'muted',gap:16});
 for(const [i,item] of source.evidence.slice(0,12).entries()){
  if(y<183)continuation();
  heading(String(i+1).padStart(2,'0')+'  /  '+safe(item?.label,120));
  flow(fallback(safe(item?.text,500)),{gap:4});
  flow('FUENTE: '+safe(item?.source,100)+'  /  '+(safe(item?.quality,70)||'registrada'),
   {size:8.5,colorName:'muted',gap:13});
 }
 sectionPage('04  /  CRITERIO','Decidir el siguiente paso');
 heading('Interpretacion profesional');flow(fallback(source.conclusions));
 heading('Proximo paso propuesto');flow(fallback(source.recommendations));
 heading('Transparencia');
 flow('Fuente: ejecuciones verificadas por IBERFIT. Periodo: '+source.periodStart+' a '+source.periodEnd+
  '. Esta lectura no es un diagnostico medico ni presupone mejoras donde no hay pruebas.');
 flow('Wearables, si se integran, deben indicar origen y frescura y nunca sustituir una ejecucion confirmada.',
  {colorName:'muted'});
 for(let i=1;i<pages.length;i++){
  const p=pages[i];
  p.drawLine({start:{x:55,y:65},end:{x:540,y:65},color:color('rule'),thickness:.8});
  p.drawText('IBERFIT  /  EVOLUCION',{x:55,y:48,size:8,font:bold,color:color('muted')});
  const count=String(i+1)+' / '+String(pages.length);
  p.drawText(count,{x:540-sans.widthOfTextAtSize(count,8),y:48,size:8,
   font:sans,color:color('muted')});
 }
 doc.setTitle('IBERFIT / Informe de evolucion / '+safe(source.clientName,70));
 doc.setCreator('IBERFIT');doc.setProducer(M44_PDF_TEMPLATE);
 doc.setCreationDate(new Date(generatedAt||new Date().toISOString()));
 const bytes=await doc.save({useObjectStreams:false});
 if(bytes.length<1024||bytes.length>20971520)throw Error('M44_PDF_RENDER_SIZE_INVALID');
 return {bytes,pages:pages.length,templateVersion:M44_PDF_TEMPLATE};
}
