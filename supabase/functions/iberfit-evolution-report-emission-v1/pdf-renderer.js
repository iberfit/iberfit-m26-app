// Branded, server-owned M44 evolution PDF renderer. pdf-lib injected by Edge.
// Rendering is based on the canonical, redacted, published server snapshot.
export const M44_PDF_TEMPLATE='iberfit-evolution-a4-brand-v3';
export const M44_ACCEPTED_REPLAY_TEMPLATES=Object.freeze(['iberfit-evolution-a4-brand-v2',M44_PDF_TEMPLATE]);
const W=595.28,H=841.89;
// Keep the public report vocabulary aligned with the existing A4 preview.
const REPORT_LABELS=Object.freeze({'post-session':'Informe post-sesión',weekly:'Resumen semanal',monthly:'Informe mensual',quarterly:'Informe trimestral','year-in-iberfit':'Tu año en IBERFIT'});
const SOURCE_LABELS=Object.freeze({sessionExecutions:'Sesiones IBERFIT confirmadas','session_execution':'Sesión IBERFIT confirmada','session_execution_period':'Historial de sesiones confirmadas',appointments:'Citas verificadas','appointments+sessionExecutions':'Citas verificadas y sesiones IBERFIT confirmadas',checkins:'Registros de bienestar','canonical-store':'Historial canónico IBERFIT',wearableDailySummaries:'Datos de dispositivo, solo contexto'});
const publicLabel=(dictionary,key,fallback)=>Object.hasOwn(dictionary,key)?dictionary[key]:fallback;
const shortDate=value=>value.slice(8,10)+'/'+value.slice(5,7);
const C={forest:[.064,.145,.117],forest2:[.15,.27,.21],gold:[.73,.58,.30],
 cream:[.975,.965,.94],ink:[.075,.133,.11],muted:[.30,.37,.33],rule:[.80,.83,.79],paper:[.993,.985,.963],soft:[.933,.936,.907],darkGold:[.45,.34,.16]};
function safe(v,n=2500){
 return String(v??'').replace(/[–—]/gu,'-').replace(/[“”]/gu,'"').replace(/[‘’]/gu,"'").replace(/[\u{10000}-\u{10ffff}]/gu,'')
 .replace(/[^\x20-\xff\n]/gu,' ').replace(/[ \t]+/gu,' ').trim().slice(0,n);
}
function validCivilDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;
 const day=new Date(value+'T00:00:00.000Z');
 return Number.isFinite(day.getTime())&&day.toISOString().slice(0,10)===value;
}
// The official renderer enforces the same activity contract as the private
// preview. No truncation, coerced zero, overlapping buckets or false dates.
export function validateOfficialActivitySeries(series,start,end){
 if(!validCivilDate(start)||!validCivilDate(end)||start>end||!Array.isArray(series)||series.length>13)return false;
 return series.every((item,index)=>item&&validCivilDate(item.from)&&validCivilDate(item.to)
  &&item.from>=start&&item.to<=end&&item.from<=item.to
  &&Number.isSafeInteger(item.count)&&item.count>=0&&(!index||series[index-1].to<item.from));
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
export async function renderEvolutionReportPdf({source,sourceFingerprint,pdfLib,brandImageBytes,brandFonts,fontkit,generatedAt}={}){
 if(!source||!pdfLib?.PDFDocument||!pdfLib?.StandardFonts||!pdfLib?.rgb)
  throw Error('M44_PDF_RENDER_INPUT_INVALID');
 if(!/^[0-9a-f]{8}-/iu.test(String(source.reportId||''))||
  !validCivilDate(source.periodStart)||!validCivilDate(source.periodEnd)||source.periodStart>source.periodEnd||
  !Array.isArray(source.evidence)||!source.evidence.length)
  throw Error('M44_PDF_SOURCE_NOT_CANONICAL');
 // Never silently omit authorized evidence from a signed professional report.
 // An extreme payload is rejected for Coach review instead of being clipped.
 if(source.evidence.length>80)throw Error('M44_PDF_EVIDENCE_VOLUME_REVIEW_REQUIRED');
 if(!validateOfficialActivitySeries(source.activitySeries??[],source.periodStart,source.periodEnd))
  throw Error('M44_PDF_ACTIVITY_SERIES_INVALID');
 const {PDFDocument,StandardFonts,rgb}=pdfLib,doc=await PDFDocument.create();
 // Reject issuance if the actual first-party brand fonts are missing.
 // This is the same Inter/Source Serif identity used by the HTML A4 preview.
 if(!fontkit||!brandFonts?.inter||!brandFonts?.serif)
  throw Error('M44_PDF_BRAND_FONTS_REQUIRED');
 // Embed an actual subset font program, not a raw WOFF2 webfont in FontFile2.
 // Real PDF raster/extraction acceptance must verify glyphs before promotion.
 doc.registerFontkit(fontkit);
 const serif=await doc.embedFont(brandFonts.serif,{subset:true});
 const sans=await doc.embedFont(brandFonts.inter,{subset:true});
 const serifBold=await doc.embedFont(StandardFonts.TimesRomanBold);
 const bold=await doc.embedFont(StandardFonts.HelveticaBold);
 const color=k=>rgb(...C[k]),pages=[];
 const M=43,R=W-M,WIDTH=R-M,BASE=72;
 const fmt=n=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:1}).format(n);
 const humanDate=v=>validCivilDate(v)?v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4):safe(v);
 const reportName=publicLabel(REPORT_LABELS,source.reportType,'Informe de evolución');
 const interval=humanDate(source.periodStart)+' - '+humanDate(source.periodEnd);
 const series=source.activitySeries??[];
 let logo=null;
 if(brandImageBytes){try{logo=await doc.embedPng(brandImageBytes);}catch{/* wordmark remains */}}
 let current,y,section='Tu seguimiento';
 const text=(v,x,at,size=10,font=sans,c='ink')=>current.drawText(safe(v),{x,y:at,size,font,color:color(c)});
 const line=(x,at,x2,c='rule')=>current.drawLine({start:{x,y:at},end:{x:x2,y:at},thickness:.65,color:color(c)});
 const rect=(x,at,width,height,c)=>current.drawRectangle({x,y:at,width,height,color:color(c)});
 function add(title,first=false){
  current=doc.addPage([W,H]);pages.push(current);section=title;
  rect(0,0,W,H,'paper');rect(0,H-7,W,7,'forest');
  if(first){
   rect(0,H-216,W,209,'forest');
   text('IBERFIT',M,H-42,17,bold,'cream');
   text('ENTRENAMIENTO PERSONAL CON CRITERIO',M,H-57,7.3,bold,'gold');
   if(logo){const scale=Math.min(49/logo.width,49/logo.height);current.drawImage(logo,{x:R-logo.width*scale,y:H-64,width:logo.width*scale,height:logo.height*scale});}
   let ty=H-103;
   for(const t of wrap(serifBold,33,reportName,WIDTH-4)){text(t,M,ty,33,serifBold,'cream');ty-=36;}
   text('PREPARADO PARA',M,H-158,7.8,bold,'gold');
   for(const [i,t] of wrap(sans,11,safe(source.clientName,100)||'Cliente IBERFIT',WIDTH*.58).entries())text(t,M,H-174-i*13,11,sans,'cream');
   text('PERIODO ANALIZADO',M+WIDTH*.60,H-158,7.8,bold,'gold');
   text(interval,M+WIDTH*.60,H-174,10,sans,'cream');
   y=H-239;
  }else{
   text('IBERFIT',M,H-36,13,bold,'forest');text(reportName,M+102,H-36,9,sans,'muted');line(M,H-46,R,'gold');
   let ty=H-79;
   for(const t of wrap(serifBold,25,title,WIDTH)){text(t,M,ty,25,serifBold,'forest');ty-=28;}
   y=ty-9;
  }
 }
 function next(){const base=section.replace(/ · continuación$/u,'');add(base+' · continuación');}
 function ensure(h){if(y-h<BASE)next();}
 function block(v,{font=sans,size=10.5,leading=14.5,c='ink',gap=10}={}){
  for(const row of wrap(font,size,v,WIDTH)){
   ensure(leading);text(row,M,y,size,font,c);y-=leading;
  }y-=gap;
 }
 function heading(v){ensure(43);line(M,y+7,R);text(safe(v,90).toUpperCase(),M,y-7,8.8,bold,'darkGold');y-=25;}
 const rowText=item=>safe(item?.text,2500)||'Sin registro';
 const rowBy=(labels,src)=>source.evidence.find(e=>labels.includes(e?.label)&&e?.source===src);
 const countValue=item=>{const raw=rowText(item);return /^\d+$/u.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):null;};
 const sessions=countValue(rowBy(['Sesiones confirmadas','Sesiones ejecutadas','Sesiones del último año'],'sessionExecutions'));
 const days=countValue(rowBy(['Días con entrenamiento confirmado'],'sessionExecutions'));
 const consistency=rowText(rowBy(['Constancia'],'appointments+sessionExecutions')).match(/^(\d+) de (\d+) citas programadas cumplidas/u);
 const wellbeing=rowText(rowBy(['Bienestar'],'checkins')).match(/^(\d+) registros? en el periodo/u);
 const volumeMatch=rowText(rowBy(['Volumen comparable'],'sessionExecutions')).match(/\((\d+) y (\d+) sesiones; medias (\d+(?:\.\d+)?) y (\d+(?:\.\d+)?) kg·rep\)/u);
 const volume=volumeMatch?volumeMatch.slice(1).map(Number):null;
 const metrics=[];
 if(sessions!==null)metrics.push([fmt(sessions),'Sesiones confirmadas']);
 if(consistency&&Number(consistency[2])>0&&Number(consistency[1])<=Number(consistency[2]))metrics.push([fmt(100*Number(consistency[1])/Number(consistency[2]))+'%','Citas cumplidas']);
 else if(days!==null)metrics.push([fmt(days),'Días con entrenamiento']);
 if(wellbeing)metrics.push([fmt(Number(wellbeing[1])),'Registros de bienestar']);
 if(metrics.length<3&&days!==null&&!metrics.some(m=>m[1]==='Días con entrenamiento'))metrics.push([fmt(days),'Días con entrenamiento']);
 if(metrics.length<3&&series.length&&sessions===null)metrics.push([fmt(series.reduce((n,r)=>n+r.count,0)),'Sesiones representadas']);
 function metricBand(){
  if(!metrics.length)return;
  const cell=WIDTH/metrics.length;rect(M,y-64,WIDTH,72,'soft');
  metrics.forEach(([v,label],i)=>{const x=M+i*cell+13;if(i)current.drawLine({start:{x:x-13,y:y-53},end:{x:x-13,y:y-4},thickness:.65,color:color('rule')});
   text(v,x,y-23,27,serifBold,'forest');
   for(const [j,t] of wrap(sans,8.8,label,cell-26).entries())text(t,x,y-41-j*11,8.8,sans,'muted');
  });y-=84;
 }
 add('Tu seguimiento',true);metricBand();
 heading('El periodo en perspectiva');block(source.summary||'Sin resumen confirmado.');
 if(series.length){
  const chartH=133,rows=Math.ceil(series.length/2),required=chartH+rows*16+96;
  if(y-required<BASE)add('Continuidad del entrenamiento');
  heading('Sesiones confirmadas por periodo');
  const max=Math.max(1,...series.map(r=>r.count)),top=y-14,bottom=top-chartH,left=M+24,right=R-4,slot=(right-left)/series.length;
  [0,.5,1].forEach(r=>{const at=bottom+chartH*r;line(left,at,right);const value=max*r;if(Number.isInteger(value))text(String(value),M,at-3,8,sans,'muted');});
  series.forEach((r,i)=>{const bw=Math.min(29,slot*.60),x=left+i*slot+(slot-bw)/2,h=chartH*r.count/max;
   if(h)rect(x,bottom,bw,h,'forest2');
   const v=String(r.count);text(v,x+bw/2-bold.widthOfTextAtSize(v,8.5)/2,bottom+h+6,8.5,bold,'forest');
   const tick=shortDate(r.from);text(tick,x+bw/2-sans.widthOfTextAtSize(tick,7.3)/2,bottom-15,7.3,sans,'muted');
  });
  y=bottom-34;block('Total representado: '+series.reduce((n,r)=>n+r.count,0)+' sesiones confirmadas.',{font:bold,size:10,gap:5});
  const cell=(WIDTH-16)/2;
  series.forEach((r,i)=>{
   const col=i%2,x=M+col*(cell+16);
   if(col===0)ensure(17);
   line(x,y+6,x+cell);
   text(r.from+' a '+r.to,x,y-4,8,sans,'muted');
   const v=String(r.count);text(v,x+cell-bold.widthOfTextAtSize(v,9),y-4,9,bold,'forest');
   if(col===1||i===series.length-1)y-=16;
  });
  y-=9;block('Actividad registrada, no esfuerzo ni adherencia. Cero sesiones confirmadas no demuestra inactividad.',{size:8.5,leading:11,c:'muted',gap:8});
 }
 // Preserve every approved evidence row; compact typography and measured
 // keep-together layout replace arbitrary page breaks and orphan rows.
 if(y<235)add('Resultados y comparaciones');
 if(volume&&volume.every(Number.isFinite)&&volume[0]>0&&volume[1]>0&&Math.max(volume[2],volume[3])>0){
  ensure(156);heading('Trabajo de fuerza comparable');
  const max=Math.max(volume[2],volume[3]),barWidth=WIDTH-170;
  for(let i=0;i<2;i++){
   const cy=y-i*34,label=i?'Grupo reciente':'Grupo anterior',v=volume[i+2];
   text(label,M,cy,9.5,bold,'forest');text(String(volume[i])+' sesiones',M,cy-12,8,sans,'muted');
   rect(M+112,cy-8,barWidth,11,'soft');
   if(v>0)rect(M+112,cy-8,barWidth*v/max,11,i?'forest2':'gold');
   const reading=fmt(v)+' kg·rep';text(reading,R-sans.widthOfTextAtSize(reading,9),cy-6,9,sans,'ink');
  }
  y-=80;block('Media de carga × repeticiones en cada grupo. La diferencia de trabajo no equivale a una mejora del rendimiento.',{size:8.5,leading:12,c:'muted',gap:8});
 }
 heading('Resultados verificables');
 block('No se rellenan mediciones ausentes con estimaciones.',{size:8.8,leading:12,c:'muted',gap:8});
 for(const [i,item] of source.evidence.entries()){
  const title=safe(item?.label,120),value=rowText(item);
  const provenance='Fuente: '+publicLabel(SOURCE_LABELS,item?.source,safe(item?.source,100))+' / '+(safe(item?.quality,70)||'registrada');
  const titleLines=wrap(bold,10,title,WIDTH-26),valueLines=wrap(sans,10.2,value,WIDTH-26),sourceLines=wrap(sans,8,provenance,WIDTH-26);
  const h=titleLines.length*13+valueLines.length*14+sourceLines.length*10+15;
  ensure(h);line(M,y+6,R);
  text(String(i+1).padStart(2,'0'),M,y-5,8,bold,'darkGold');
  let yy=y-5;
  for(const t of titleLines){text(t,M+26,yy,10,bold,'forest');yy-=13;}
  for(const t of valueLines){text(t,M+26,yy,10.2,sans);yy-=14;}
  for(const t of sourceLines){text(t,M+26,yy,8,sans,'muted');yy-=10;}
  y=yy-9;
 }
 if(y<260)add('Tu siguiente paso');
 heading('Interpretación profesional');block(source.conclusions||'Interpretación pendiente.');
 heading('Próximo paso propuesto');block(source.recommendations||'Propuesta pendiente.');
 heading('Transparencia');block('Fuente principal: '+publicLabel(SOURCE_LABELS,source.sourceType,'Evidencia canónica IBERFIT')+'. Periodo: '+interval+'. El diagnóstico inicial IRI se mantiene separado. Los datos de dispositivos no sustituyen una sesión confirmada.',{size:8.5,leading:12,c:'muted',gap:4});
 for(let i=0;i<pages.length;i++){
  current=pages[i];line(M,51,R);text('IBERFIT / EVOLUCIÓN Y SEGUIMIENTO',M,35,7.5,bold,'muted');
  const count=String(i+1)+' / '+String(pages.length);text(count,R-sans.widthOfTextAtSize(count,8),35,8,sans,'muted');
 }
 doc.setTitle('IBERFIT / '+reportName+' / '+safe(source.clientName,70));
 doc.setCreator('IBERFIT');doc.setProducer(M44_PDF_TEMPLATE);
 if(sourceFingerprint)doc.setSubject(String(sourceFingerprint));
 doc.setCreationDate(new Date(generatedAt||new Date().toISOString()));
 const bytes=await doc.save({useObjectStreams:false});
 if(bytes.length<1024||bytes.length>20971520)throw Error('M44_PDF_RENDER_SIZE_INVALID');
 return {bytes,pages:pages.length,templateVersion:M44_PDF_TEMPLATE};
}
