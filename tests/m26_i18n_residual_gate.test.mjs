import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

const ROOTS=['src/m26/modules','src/m26/app','src/m26/admin','src/m26/ui','src/m26/workflows','src/m26/wearables','src/m26/onboarding'];
const EXCLUDES=[/i18n(?:-|\.)/,/guided-tour\.js$/,/(?:protocol|catalog|norms|evidence)/,/base\.js$/,/iri-report-document\.js$/,/evolution-report-document\.js$/,/iri-report-visuals\.js$/,/report-workflow\.js$/,/iri-external-report-controller\.js$/,/iri-report-page\.js$/,/contextual-guidance\.js$/,/historical-acquisition\.js$/,/contracts\.js$/,/exercise-video-player\.js$/,/exercise-media\.js$/];
const SPANISH=/[áéíóúüñÁÉÍÓÚÜÑ¿¡]|\b(?:cliente|clientes|sesión|sesiones|entrenamiento|entrenador|agenda|revisar|pendiente|confirmad[oa]s?|disponible|datos|informe|cita|evaluación|progreso|siguiente|guardad[oa]|selecciona|bienestar|sueño|estrés|dispositivo|expediente|planificación|ejercicio|ejercicios|sincronización|contraseña|seguimiento|carga|series|repeticiones)\b/iu;
const QUOTED=/(?:'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`)/gs;

function filesUnder(dir,out=[]){
  if(!fs.existsSync(dir))return out;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const target=path.join(dir,entry.name);
    if(entry.isDirectory())filesUnder(target,out);
    else if(/\.(?:js|mjs)$/u.test(entry.name))out.push(target);
  }
  return out;
}
function normalise(value){return String(value||'').replace(/\\'/g,"'").replace(/\\"/g,'"').replace(/\\[nrt]/g,' ').replace(/\s+/g,' ').trim();}
function internalToken(value){
  return /^(?:M26_|https?:|\/|\.|#|data-|aria-|\[data-|m2[67]-|admin-|coach-)/u.test(value)
    || (/^[a-z0-9-]+$/u.test(value)&&value.includes('-'))
    || /(?:\$\{|\.join\(|\breturn\b|\)\)|\}\)|^:\s|^`|`$)/u.test(value);
}
function evaluate(residual,file,line,value,kind){
  const text=normalise(value);
  if(text.length<2||text.length>320||!SPANISH.test(text)||internalToken(text))return;
  if(iberfitSurfaceTranslate(text,{language:'en'})===text)residual.push({file,line,text,kind});
}

test('rendered Spanish UI literals are classified by the i18n surface',()=>{
  const residual=[];
  const files=ROOTS.flatMap((root)=>filesUnder(root)).filter((file)=>!EXCLUDES.some((pattern)=>pattern.test(file)));
  for(const file of files){
    const source=fs.readFileSync(file,'utf8');
    QUOTED.lastIndex=0;
    let match;
    while((match=QUOTED.exec(source))){
      const raw=match[1]??match[2]??match[3]??'';
      if(raw.includes('${'))continue;
      const line=source.slice(0,match.index).split(/\r?\n/u).length;
      if(/[<>]/u.test(raw)){
        for(const hit of raw.matchAll(/>([^<>]+)</gs))evaluate(residual,file,line,hit[1],'text-node');
        for(const hit of raw.matchAll(/(?:placeholder|title|aria-label|aria-description)=["']([^"']+)["']/gs))evaluate(residual,file,line,hit[1],'attribute');
      }else evaluate(residual,file,line,raw,'literal');
    }
  }
  assert.deepEqual(residual,[],`Untranslated visible Spanish UI:\n${residual.map((item)=>`${item.file}:${item.line} ${item.text}`).join('\n')}`);
});

test('M44 A4 report copy is classified as a document template, not an unlocalized UI control',()=>{
 const file=fs.readFileSync('src/m26/workflows/evolution-report-document.js','utf8');
 assert.match(file,/EVOLUCIÓN · SEGUIMIENTO PERSONALIZADO/);
 assert.ok(EXCLUDES.some(pattern=>pattern.test('src/m26/workflows/evolution-report-document.js')));
 assert.notEqual(iberfitSurfaceTranslate('Indica por qué se retira esta versión',{language:'en'}),'Indica por qué se retira esta versión');
});

test('P0 Free historical loading, offline, failed and retry UI are localized in all supported languages',()=>{
 for(const text of ["Actualizando el expediente histórico completo. Los entrenamientos disponibles siguen accesibles.","El historial antiguo requiere conexión. Tus sesiones disponibles permanecen visibles.","No se ha podido recuperar el historial completo. No se ha perdido ningún registro.","Reintentar historial"]){
  for(const language of ['en','fr','pt']){
   const translated=iberfitSurfaceTranslate(text,{language});
   assert.notEqual(translated,text,`Missing ${language}: ${text}`);
  }
 }
});
