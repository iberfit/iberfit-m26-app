import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { GoogleGenAI } from 'npm:@google/genai@2.21.0';

const SOURCE_URL='https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const CANONICAL_URL=Deno.env.get('IBERFIT_CANONICAL_CATALOG_URL')||'https://iberfitapp.iberfit-cl.workers.dev/exercise-catalog-m25.json';
const MODEL=Deno.env.get('GEMINI_MODEL')||'gemini-3.5-flash';
const EQUIPMENT:any={'body only':'sin equipo','dumbbell':'mancuerna','barbell':'barra','kettlebells':'kettlebell','cable':'polea','machine':'máquina','bands':'banda','exercise ball':'fitball','foam roll':'foam roller','e-z curl bar':'barra EZ','medicine ball':'balón medicinal','other':'otro','none':'sin equipo'};
const LEVEL:any={beginner:'inicial',intermediate:'media',expert:'avanzada'};
const CATEGORY:any={strength:'fuerza',stretching:'movilidad',plyometrics:'potencia',cardio:'acondicionamiento',strongman:'fuerza'};
const MUSCLE:any={abdominals:'abdominales',abductors:'abductores',adductors:'aductores',biceps:'bíceps',calves:'gemelos',chest:'pectoral',forearms:'antebrazos',glutes:'glúteos',hamstrings:'isquiotibiales',lats:'dorsal ancho','lower back':'zona lumbar','middle back':'espalda media',neck:'cuello',quadriceps:'cuádriceps',shoulders:'hombros',traps:'trapecios',triceps:'tríceps'};

function origin(v:string|null){if(!v)return '*';try{const u=new URL(v);if(u.protocol==='https:'&&(u.hostname==='app.iberfit.cl'||u.hostname==='coach.iberfit.cl'||u.hostname.endsWith('.iberfit-cl.workers.dev')))return v}catch{}return ''}
function cors(r:Request){return{'access-control-allow-origin':origin(r.headers.get('origin'))||'null','access-control-allow-headers':'authorization, x-client-info, apikey, content-type','access-control-allow-methods':'POST, OPTIONS','vary':'Origin'}}
function reply(r:Request,b:any,s=200){return new Response(JSON.stringify(b),{status:s,headers:{...cors(r),'content-type':'application/json; charset=utf-8','cache-control':'no-store'}})}
function key(){const m=Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');if(m){try{const p=JSON.parse(m);return String(p.default||Object.values(p)[0]||'')}catch{}}return Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||''}
function slug(v:string){return v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90)}
function arr(v:any,d:any){return Array.isArray(v)?v.map(x=>d[String(x)]||String(x)):[]}
function pattern(x:any){const n=String(x.name||'').toLowerCase(),m=(x.primaryMuscles||[]).map((v:any)=>String(v).toLowerCase());if(/squat|leg press|lunge|step/.test(n))return'sentadilla';if(/deadlift|hip thrust|good morning|leg curl/.test(n))return'bisagra';if(/row/.test(n))return'tracción horizontal';if(/pull-up|chin-up|pulldown|lat pull/.test(n))return'tracción vertical';if(/bench press|push-up|chest press|dip/.test(n))return'empuje horizontal';if(/shoulder press|military press|overhead press/.test(n))return'empuje vertical';if(m.includes('abdominals'))return'core';if(x.category==='stretching')return'movilidad';if(x.category==='plyometrics')return'potencia';return'complementario'}
function external(x:any){const name=String(x.name||x.id||'Ejercicio');return{id:`EXT-FEDB-${slug(String(x.id||name))}`.toUpperCase(),name_es:name,name_source:name,source:'FREE_EXERCISE_DB',source_id:String(x.id||''),pattern:pattern(x),intent:CATEGORY[String(x.category)]||'técnica',equipment:EQUIPMENT[String(x.equipment)]||String(x.equipment||'sin equipo'),difficulty:LEVEL[String(x.level)]||'media',primary_muscles:arr(x.primaryMuscles,MUSCLE),secondary_muscles:arr(x.secondaryMuscles,MUSCLE),cues:[],instructions_es:[],precautions:['Revisar técnica, contexto y tolerancia antes de prescribir.'],units:['repeticiones','kg','segundos'],tags:[x.category,x.force,x.mechanic].filter(Boolean),aliases:[name],media_status:'bloqueado',media:{sourceImages:Array.isArray(x.images)?x.images:[]},review_status:'external_reference',active:true,revision:1,name_admin_override:false}}
function parse(text:string){return JSON.parse(String(text||'').trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim())}
function cleanName(value:any){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,160)}
function validatedTranslations(raw:any){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('IBERFIT_EXERCISE_TRANSLATION_INVALID');
  const keys=Object.keys(raw);
  if(keys.length!==3||!['en','fr','pt'].every((language)=>keys.includes(language))||keys.some((language)=>!['en','fr','pt'].includes(language)))throw new Error('IBERFIT_EXERCISE_TRANSLATION_INVALID');
  const out:Record<string,string>={};
  for(const language of ['en','fr','pt']){
    const name=cleanName(raw[language]);
    if(name.length<2)throw new Error(`IBERFIT_EXERCISE_TRANSLATION_INVALID:${language}`);
    out[language]=name;
  }
  return out;
}
async function preserveAdminNames(db:any,rows:any[]){
  const {data,error}=await db.from('exercise_catalog').select('id,name_es,revision,name_admin_override').eq('name_admin_override',true);
  if(error)throw error;
  const overrides=new Map((data||[]).map((item:any)=>[String(item.id),item]));
  return rows.map((row:any)=>{
    const override=overrides.get(String(row.id));
    return override?{...row,name_es:String(override.name_es),revision:Number(override.revision||row.revision||1),name_admin_override:true}:row;
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST')return reply(req,{error:'Método no permitido'},405);
  const h=req.headers.get('authorization')||'';
  if(!h.startsWith('Bearer '))return reply(req,{error:'Sesión no válida'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')||'',key(),{global:{headers:{Authorization:h}},auth:{persistSession:false}});
  const{data:u,error:ue}=await db.auth.getUser(h.slice(7));
  if(ue||!u?.user)return reply(req,{error:'Sesión no válida'},401);
  const{data:p}=await db.from('user_profiles').select('role').eq('user_id',u.user.id).single();
  if(p?.role!=='admin')return reply(req,{error:'Solo Administración puede sincronizar o editar la biblioteca'},403);
  const body=await req.json().catch(()=>({}));
  const action=String(body.action||'status');

  if(action==='status'){
    const{data,error}=await db.rpc('iberfit_exercise_facets');
    return error?reply(req,{error:error.message},400):reply(req,{...data,geminiConfigured:Boolean(Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_API_KEY')),model:MODEL,mediaPolicy:'Los medios externos permanecen bloqueados hasta aprobación individual.',globalNameGovernance:true});
  }

  if(action==='rename_exercise'){
    const exerciseId=String(body.exerciseId||'').trim();
    const nameEs=cleanName(body.nameEs);
    const expectedRevision=Number(body.expectedRevision);
    if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(exerciseId)||nameEs.length<2||!Number.isInteger(expectedRevision)||expectedRevision<0)return reply(req,{error:'Datos de renombrado inválidos'},422);
    const geminiKey=Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_API_KEY')||'';
    if(!geminiKey)return reply(req,{error:'La traducción automática no está configurada; no se modificó el ejercicio.'},409);
    try{
      const ai=new GoogleGenAI({apiKey:geminiKey});
      const prompt=`Devuelve únicamente JSON válido con exactamente las claves en, fr y pt. Traduce este nombre de ejercicio desde español a inglés, francés y portugués. Conserva la intención técnica, no inventes variantes y no añadas explicaciones. Nombre: ${JSON.stringify(nameEs)}`;
      const generated=await ai.models.generateContent({model:MODEL,contents:prompt,config:{temperature:0.05,responseMimeType:'application/json',maxOutputTokens:500}});
      const translations=validatedTranslations(parse(generated.text||''));
      const {data,error}=await db.rpc('iberfit_admin_rename_exercise_v1',{
        p_exercise_id:exerciseId,
        p_name_es:nameEs,
        p_expected_revision:expectedRevision,
        p_translations:translations,
        p_provider:'Gemini',
        p_model:MODEL,
      });
      if(error){
        const status=String(error.message||'').includes('IBERFIT_EXERCISE_REVISION_CONFLICT')?409:400;
        return reply(req,{error:error.message},status);
      }
      return reply(req,{...data,translations,translationStatus:'ready',provider:'Gemini',model:MODEL});
    }catch(e){
      return reply(req,{error:`No se modificó el ejercicio porque la traducción automática no pudo validarse: ${String((e as any)?.message||e).slice(0,220)}`},502);
    }
  }

  if(action==='sync_canonical'){
    const r=await fetch(CANONICAL_URL);
    if(!r.ok)return reply(req,{error:`Catálogo canónico HTTP ${r.status}`},502);
    const src=await r.json();
    if(!Array.isArray(src)||src.length<300)return reply(req,{error:'El catálogo canónico no superó la validación mínima'},422);
    let rows=src.map((x:any)=>({id:String(x.id),name_es:String(x.name_es||x.name||''),name_source:String(x.name_source||x.name_es||x.name||''),source:'IBERFIT_CANONICAL',source_id:String(x.source_id||x.id),pattern:String(x.pattern||'complementario'),intent:String(x.intent||'fuerza'),equipment:String(x.equipment||'sin equipo'),difficulty:String(x.difficulty||'media'),primary_muscles:Array.isArray(x.primary_muscles)?x.primary_muscles:[],secondary_muscles:Array.isArray(x.secondary_muscles)?x.secondary_muscles:[],cues:Array.isArray(x.cues)?x.cues:[],instructions_es:Array.isArray(x.instructions_es)?x.instructions_es:[],precautions:Array.isArray(x.precautions)?x.precautions:[],units:Array.isArray(x.units)?x.units:['repeticiones','kg','segundos'],tags:Array.isArray(x.tags)?x.tags:[],aliases:Array.isArray(x.aliases)?x.aliases:[],media_status:'pendiente',media:{},review_status:'validado_nucleo',active:x.active!==false,revision:Number(x.revision||1),name_admin_override:false}));
    try{rows=await preserveAdminNames(db,rows)}catch(e){return reply(req,{error:String((e as any)?.message||e)},400)}
    let n=0;
    for(let i=0;i<rows.length;i+=100){const c=rows.slice(i,i+100),{error}=await db.from('exercise_catalog').upsert(c,{onConflict:'id'});if(error)return reply(req,{error:error.message},400);n+=c.length}
    return reply(req,{ok:true,imported:n,canonical:true,adminNamesPreserved:true});
  }

  if(action==='sync_external'){
    const run=crypto.randomUUID();
    await db.from('exercise_catalog_sync_runs').insert({id:run,source:'FREE_EXERCISE_DB',status:'running',started_by:u.user.id,details:{sourceUrl:SOURCE_URL}});
    try{
      const r=await fetch(SOURCE_URL);if(!r.ok)throw new Error(`Fuente HTTP ${r.status}`);
      const src=await r.json();if(!Array.isArray(src))throw new Error('Fuente inválida');
      let rows=src.map(external);rows=await preserveAdminNames(db,rows);
      let n=0;for(let i=0;i<rows.length;i+=100){const c=rows.slice(i,i+100),{error}=await db.from('exercise_catalog').upsert(c,{onConflict:'id'});if(error)throw error;n+=c.length}
      await db.from('exercise_catalog_sync_runs').update({status:'completed',imported_count:n,completed_at:new Date().toISOString(),details:{mediaBlocked:true,adminNamesPreserved:true}}).eq('id',run);
      return reply(req,{ok:true,runId:run,imported:n,mediaBlocked:true,adminNamesPreserved:true});
    }catch(e){
      await db.from('exercise_catalog_sync_runs').update({status:'failed',completed_at:new Date().toISOString(),details:{error:String((e as any)?.message||e)}}).eq('id',run);
      return reply(req,{error:String((e as any)?.message||e)},500);
    }
  }

  if(action==='enrich_external'){
    const g=Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_API_KEY');
    if(!g)return reply(req,{error:'GEMINI_API_KEY no está configurada en Supabase Secrets'},409);
    const limit=Math.max(5,Math.min(Number(body.limit||20),30));
    const{data:pending,error}=await db.from('exercise_catalog').select('id,name_source,pattern,intent,equipment,difficulty,primary_muscles,secondary_muscles').eq('source','FREE_EXERCISE_DB').eq('review_status','external_reference').eq('name_admin_override',false).filter('instructions_es','eq','{}').limit(limit);
    if(error)return reply(req,{error:error.message},400);
    if(!pending?.length)return reply(req,{ok:true,enriched:0,remaining:0,complete:true});
    try{
      const ai=new GoogleGenAI({apiKey:g});
      const prompt=`Solo JSON válido. Traduce a español profesional sin inventar variantes. Devuelve items con id exacto, name_es, cues, instructions_es, precautions y aliases: ${JSON.stringify(pending)}`;
      const out=await ai.models.generateContent({model:MODEL,contents:prompt,config:{temperature:0.1,responseMimeType:'application/json',maxOutputTokens:8000}});
      const parsed=parse(out.text||''),items=Array.isArray(parsed)?parsed:parsed.items||[];
      let n=0;
      for(const x of items){if(!pending.some((v:any)=>v.id===x.id))continue;const{error:e}=await db.from('exercise_catalog').update({name_es:String(x.name_es||'').trim()||pending.find((v:any)=>v.id===x.id)?.name_source,cues:Array.isArray(x.cues)?x.cues:[],instructions_es:Array.isArray(x.instructions_es)?x.instructions_es:[],precautions:Array.isArray(x.precautions)?x.precautions:['Revisar tolerancia y técnica.'],aliases:Array.isArray(x.aliases)?x.aliases:[],updated_at:new Date().toISOString()}).eq('id',x.id).eq('name_admin_override',false);if(!e)n++}
      const{count}=await db.from('exercise_catalog').select('id',{count:'exact',head:true}).eq('source','FREE_EXERCISE_DB').eq('review_status','external_reference').eq('name_admin_override',false).filter('instructions_es','eq','{}');
      return reply(req,{ok:true,enriched:n,remaining:count||0,complete:(count||0)===0,model:MODEL});
    }catch(e){return reply(req,{error:`Gemini no pudo enriquecer el lote: ${String((e as any)?.message||e)}`},502)}
  }

  return reply(req,{error:'Acción de catálogo no válida'},400);
});