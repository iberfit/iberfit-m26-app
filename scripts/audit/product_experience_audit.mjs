import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const VERSION='1.1.0';
const OUT_DIR=path.resolve('recovery/continuous-audit');
const OUT_JSON=path.join(OUT_DIR,'product-experience-latest.json');
const OUT_MD=path.join(OUT_DIR,'product-experience-latest.md');

const PRIORITY_ORDER=Object.freeze({high:0,medium:1,low:2});
const VISUAL_DIMENSION_WEIGHTS=Object.freeze({
  semanticFoundation:18,
  typographyHierarchy:14,
  roleDensity:14,
  responsiveComposition:14,
  interactionStates:18,
  surfaceDepth:10,
  dataVisualization:12,
});

function has(text,pattern){return pattern.test(String(text||''));}
function uniq(items){return [...new Map(items.map((item)=>[item.code,item])).values()];}
function objectKeys(value){return value&&typeof value==='object'&&!Array.isArray(value)?Object.keys(value):[];}

function strength(code,domain,message,evidence){return Object.freeze({code,domain,message,evidence});}
function opportunity(priority,domain,code,message,recommendation,evidence){return Object.freeze({priority,domain,code,message,recommendation,evidence});}

function importReferencePresent(files,targetPath){
  const basename=path.posix.basename(targetPath);
  return Object.entries(files).some(([file,source])=>file!==targetPath&&String(source).includes(basename));
}

function readDesignTokens(files){
  const source=files['src/m26/design/tokens.json'];
  if(!source)return Object.freeze({tokens:null,error:'DESIGN_TOKENS_NOT_SCANNED'});
  try{
    const parsed=JSON.parse(String(source));
    return Object.freeze({tokens:parsed,error:null});
  }catch{
    return Object.freeze({tokens:null,error:'DESIGN_TOKENS_INVALID_JSON'});
  }
}

function visualDimension(id,label,passed,weight,evidence){
  return Object.freeze({id,label,passed:Boolean(passed),weight,evidence});
}

function evaluateVisualMaturity(files,css){
  const {tokens,error}=readDesignTokens(files);
  const meta=tokens?.meta||{};
  const semantic=tokens?.color?.semantic||{};
  const dataViz=tokens?.color?.dataViz||{};
  const typography=tokens?.typography||{};
  const densities=tokens?.density||{};
  const breakpoints=tokens?.breakpoint||{};
  const touchTarget=Number(tokens?.size?.touchTargetPx||meta?.touchTargetRecommendedPx||0);

  const semanticFoundation=Boolean(
    meta?.sourceOfTruth===true&&
    objectKeys(semantic).length>=12&&
    objectKeys(tokens?.space).length>=7&&
    objectKeys(tokens?.radius).length>=4&&
    objectKeys(tokens?.shadow).length>=3
  );
  const typographyHierarchy=Boolean(
    objectKeys(typography?.family).length>=2&&
    objectKeys(typography?.sizePx).length>=7&&
    objectKeys(typography?.weight).length>=4&&
    objectKeys(typography?.lineHeight).length>=3
  );
  const roleDensity=Boolean(
    ['client','coach','admin'].every((role)=>densities?.[role])&&
    ['client','coach','admin'].every((role)=>has(css,new RegExp(`data-m26-role=["']${role}["']`,'u')))
  );
  const responsiveComposition=Boolean(
    objectKeys(breakpoints).length>=4&&
    has(css,/compact-touch/u)&&has(css,/medium-touch/u)&&has(css,/expanded-touch/u)&&
    has(css,/safe-area-inset-/u)
  );
  const interactionStates=Boolean(
    touchTarget>=44&&
    has(css,/:focus-visible/u)&&
    has(css,/prefers-reduced-motion\s*:\s*reduce/u)&&
    has(css,/(?:\[disabled\]|:disabled)/u)&&
    has(css,/(?:aria-busy|data-[a-z0-9-]*busy|is-loading|is-busy)/u)&&
    has(css,/(?:danger|error|invalid)/u)
  );
  const surfaceDepth=Boolean(
    has(css,/linear-gradient\s*\(/u)&&
    has(css,/(?:radial-gradient|backdrop-filter)\s*[:(]/u)&&
    has(css,/box-shadow\s*:/u)
  );
  const dataVisualization=Boolean(
    objectKeys(dataViz).length>=6&&
    objectKeys(dataViz).some((key)=>/^series\d+$/u.test(key))&&
    Object.hasOwn(dataViz,'grid')&&Object.hasOwn(dataViz,'missing')
  );

  const dimensions=Object.freeze([
    visualDimension('semanticFoundation','Fundación semántica',semanticFoundation,VISUAL_DIMENSION_WEIGHTS.semanticFoundation,semanticFoundation?'Tokens semánticos, espaciado, radios y elevación están definidos en una fuente de verdad.':error||'La fuente de verdad visual no acredita una base semántica suficiente.'),
    visualDimension('typographyHierarchy','Jerarquía tipográfica',typographyHierarchy,VISUAL_DIMENSION_WEIGHTS.typographyHierarchy,typographyHierarchy?'Existen familias UI/editorial y escalas de tamaño, peso e interlineado.':'La escala tipográfica no acredita una jerarquía completa.'),
    visualDimension('roleDensity','Densidad por rol',roleDensity,VISUAL_DIMENSION_WEIGHTS.roleDensity,roleDensity?'Cliente, Coach y Admin tienen densidades y superficies específicas.':'No se acredita diferenciación visual completa de Cliente, Coach y Admin.'),
    visualDimension('responsiveComposition','Composición responsive',responsiveComposition,VISUAL_DIMENSION_WEIGHTS.responsiveComposition,responsiveComposition?'Hay breakpoints, modos táctiles y safe areas explícitos.':'Falta parte del contrato responsive/táctil/safe-area.'),
    visualDimension('interactionStates','Estados de interacción',interactionStates,VISUAL_DIMENSION_WEIGHTS.interactionStates,interactionStates?'Foco, disabled, busy/error, touch target y reduced-motion están representados.':'La superficie no acredita todos los estados de interacción necesarios.'),
    visualDimension('surfaceDepth','Profundidad de superficies',surfaceDepth,VISUAL_DIMENSION_WEIGHTS.surfaceDepth,surfaceDepth?'Hay gradientes/profundidad/elevación como recursos de composición.':'La profundidad de superficies no está sistematizada.'),
    visualDimension('dataVisualization','Lenguaje de datos',dataVisualization,VISUAL_DIMENSION_WEIGHTS.dataVisualization,dataVisualization?'La fuente de verdad incluye series, grid y missing state para visualización de datos.':'No se acredita un lenguaje de visualización de datos completo.'),
  ]);

  const structuralScore=dimensions.reduce((sum,item)=>sum+(item.passed?item.weight:0),0);
  const declaredVisualDelta=String(meta?.visualDelta||'undeclared');
  const intentionallyMinimal=declaredVisualDelta==='intentionally-minimal';
  const score=intentionallyMinimal?Math.min(structuralScore,70):structuralScore;
  const level=intentionallyMinimal?'foundation-direction-limited':score>=85?'elevated':score>=70?'systematic-foundation':score>=50?'foundation':'incomplete-foundation';

  return Object.freeze({
    score,
    structuralScore,
    maxScore:100,
    level,
    declaredVisualDelta,
    intentionallyMinimal,
    requiresHumanVisualReview:true,
    dimensions,
  });
}

export function evaluateProductExperience(files={}){
  const entries=Object.entries(files);
  const all=entries.map(([,source])=>String(source||'')).join('\n');
  const css=entries.filter(([file])=>file.endsWith('.css')).map(([,source])=>String(source||'')).join('\n');
  const session=entries.filter(([file])=>/(?:session|execution|recovery|exercise-media)/u.test(file)).map(([,source])=>String(source||'')).join('\n');
  const strengths=[];
  const opportunities=[];
  const visualMaturity=evaluateVisualMaturity(files,css);

  if(has(css,/env\(safe-area-inset-(?:bottom|top|left|right)\)/u))strengths.push(strength('APP_SAFE_AREA_AWARE','aesthetic','La composición móvil respeta safe areas del dispositivo.','CSS usa env(safe-area-inset-*).'));
  else opportunities.push(opportunity('high','aesthetic','APP_SAFE_AREA_GAP','La interfaz no evidencia adaptación a safe areas de móvil.','Reservar zonas seguras para navegación fija, cabeceras y acciones de sesión.','No se encontró env(safe-area-inset-*).'));

  if(has(css,/compact-touch/u)&&has(css,/medium-touch/u)&&has(css,/expanded-touch/u))strengths.push(strength('ADAPTIVE_TOUCH_LAYOUT','aesthetic','La app diferencia teléfono, tablet y superficies táctiles amplias.','Existen compact-touch, medium-touch y expanded-touch.'));
  else opportunities.push(opportunity('medium','aesthetic','ADAPTIVE_TOUCH_LAYOUT_GAP','La jerarquía responsive no cubre explícitamente todos los tamaños táctiles.','Separar teléfono, tablet portrait y tablet/landscape con densidad y navegación apropiadas.','Falta uno o más modos táctiles adaptativos.'));

  if(has(css,/:focus-visible/u))strengths.push(strength('FOCUS_VISIBLE_PRESENT','aesthetic','Los controles incluyen tratamiento visual de foco de teclado.','Se detecta :focus-visible.'));
  else opportunities.push(opportunity('high','aesthetic','FOCUS_VISIBLE_OPPORTUNITY','Falta una señal visual explícita de foco en la superficie desplegable.','Añadir focus-visible coherente con el sistema visual IBERFIT, sin alterar foco programático.','No se detecta :focus-visible.'));

  if(has(css,/prefers-reduced-motion\s*:\s*reduce/u))strengths.push(strength('REDUCED_MOTION_SUPPORTED','aesthetic','La experiencia contempla usuarios que reducen movimiento.','Se detecta prefers-reduced-motion: reduce.'));
  else opportunities.push(opportunity('high','aesthetic','REDUCED_MOTION_OPPORTUNITY','Las transiciones no evidencian una alternativa para reducción de movimiento.','Añadir una variante reduced-motion y mantener la jerarquía sin animaciones imprescindibles.','No se detecta prefers-reduced-motion: reduce.'));

  if(has(css,/backdrop-filter\s*:/u)&&has(css,/linear-gradient\s*\(/u))strengths.push(strength('PREMIUM_VISUAL_LAYERING','aesthetic','Existe una base técnica de profundidad, transparencia y gradientes; por sí sola no certifica acabado premium.','Se detectan backdrop-filter y gradientes; la madurez se evalúa por separado.'));

  if(visualMaturity.intentionallyMinimal){
    opportunities.push(opportunity('high','aesthetic','VISUAL_DIRECTION_MINIMAL_DELTA','La propia fuente de verdad declara que el salto visual es intencionadamente mínimo; no puede considerarse evidencia de acabado premium.','Elevar de forma aditiva el sistema visual completo —jerarquía, controles, composición, datos y estados— y cambiar esta declaración sólo después de validar capturas reales en Cliente, Coach y Admin.',`tokens.json meta.visualDelta=${visualMaturity.declaredVisualDelta}; readiness capped=${visualMaturity.score}/100.`));
  }else if(visualMaturity.declaredVisualDelta==='undeclared'){
    opportunities.push(opportunity('medium','aesthetic','VISUAL_DIRECTION_UNDECLARED','La intención de evolución visual no está declarada en la fuente de verdad.','Declarar el nivel/dirección visual únicamente cuando exista evidencia coherente en las superficies reales.','tokens.json no aporta meta.visualDelta.'));
  }

  for(const dimension of visualMaturity.dimensions){
    if(dimension.passed)continue;
    opportunities.push(opportunity('medium','aesthetic',`VISUAL_MATURITY_${dimension.id.replace(/([a-z])([A-Z])/gu,'$1_$2').toUpperCase()}`,`La dimensión “${dimension.label}” no alcanza todavía el contrato visual medible.`,`Completar ${dimension.label.toLowerCase()} sin retirar información, estados ni capacidades existentes.`,dimension.evidence));
  }

  if(visualMaturity.structuralScore>=70)strengths.push(strength('VISUAL_SYSTEM_FOUNDATION','aesthetic',`El sistema visual acredita una fundación estructural de ${visualMaturity.structuralScore}/100, separada de su preparación visual ${visualMaturity.score}/100 y de la valoración subjetiva del acabado.`,`Nivel ${visualMaturity.level}; revisión humana obligatoria=${visualMaturity.requiresHumanVisualReview}.`));

  if(has(all,/startViewTransition\s*\(/u))strengths.push(strength('ROUTE_VIEW_TRANSITIONS','aesthetic','La navegación puede usar transiciones de vista nativas.','Se detecta document.startViewTransition.'));
  else opportunities.push(opportunity('low','aesthetic','ROUTE_TRANSITION_OPPORTUNITY','La navegación puede sentirse aún más nativa entre áreas principales.','Evaluar transiciones de vista muy breves en cambios de ruta, desactivadas con reduced-motion y sin bloquear interacción.','No se detecta startViewTransition.'));

  if(has(session,/activeSetDraft/u)&&has(session,/finalFeedbackDraft/u)&&has(session,/pagehide/u)&&has(session,/visibilitychange/u))strengths.push(strength('TRAINING_DRAFT_RECOVERY','training','La ejecución protege borradores de serie y feedback ante pérdida de contexto.','Se detectan drafts activos y flush de lifecycle.'));
  else opportunities.push(opportunity('high','training','TRAINING_RECOVERY_GAP','La sesión no evidencia recuperación completa de datos en curso.','Persistir serie activa y feedback antes de pagehide/visibility hidden y rehidratar al volver.','Falta parte del contrato draft/lifecycle.'));

  if(has(session,/beginRest\s*\(/u)&&has(session,/rest-plus/u)&&has(session,/rest-minus/u))strengths.push(strength('TRAINING_REST_CONTROL','training','El descanso forma parte de la ejecución y admite ajuste rápido.','Se detectan inicio y ajustes ± de descanso.'));
  else opportunities.push(opportunity('high','training','TRAINING_REST_CONTROL_GAP','El flujo de entrenamiento no evidencia control completo del descanso.','Mantener temporizador visible, ajustes rápidos y continuidad al cambiar de contexto.','Falta parte del contrato de descanso.'));

  if(has(session,/sessionRpe/u)&&has(session,/painNotes/u))strengths.push(strength('TRAINING_FEEDBACK_COMPLETE','training','El cierre de sesión incluye esfuerzo percibido y contexto de dolor.','Se detectan sessionRpe y painNotes.'));
  else opportunities.push(opportunity('high','training','TRAINING_FEEDBACK_GAP','El cierre de entrenamiento no evidencia feedback suficiente.','Exigir feedback final mínimo y conservar dolor/notas como contexto para el Coach.','Falta RPE de sesión o notas de dolor.'));

  if(has(session,/enqueueAndApply/u)||has(session,/OFFLINE_QUEUE/u))strengths.push(strength('TRAINING_OFFLINE_CONTINUITY','training','Las mutaciones de ejecución contemplan continuidad offline controlada.','Se detecta cola offline de ejecución.'));

  if(has(all,/wakeLock/u))strengths.push(strength('TRAINING_SCREEN_WAKE_LOCK','training','La app puede mantener la pantalla activa durante el entrenamiento.','Se detecta Screen Wake Lock API.'));
  else opportunities.push(opportunity('high','training','TRAINING_WAKE_LOCK_OPPORTUNITY','La pantalla puede apagarse en mitad de una serie o descanso.','Añadir Screen Wake Lock como mejora progresiva sólo durante ejecución activa; liberar en pausa/fin y reactivar al volver a visible.','No se detecta wakeLock en la superficie M26.'));

  if(has(all,/(?:navigator\.)?vibrate\s*\(/u))strengths.push(strength('TRAINING_HAPTIC_FEEDBACK','training','La app dispone de feedback háptico progresivo.','Se detecta vibración/háptica.'));
  else opportunities.push(opportunity('medium','training','TRAINING_HAPTICS_OPPORTUNITY','Completar serie o terminar descanso depende sólo de señales visuales/sonoras.','Evaluar vibración corta opcional en dispositivos compatibles para fin de descanso y confirmación de serie; respetar preferencias y no hacerlo obligatorio.','No se detecta navigator.vibrate.'));

  for(const [file] of entries.filter(([name])=>/-base\.js$/u.test(name))){
    if(!importReferencePresent(files,file))opportunities.push(opportunity('medium','performance','ORPHAN_DEPLOYABLE_MODULE',`El módulo ${file} parece desplegable pero no está referenciado por otro módulo.`,`Confirmar que está huérfano y, si lo está, retirarlo junto con su entrada de precache para reducir superficie PWA.`,`No se encontró referencia al basename ${path.posix.basename(file)}.`));
  }

  const ordered=uniq(opportunities).sort((a,b)=>(PRIORITY_ORDER[a.priority]??9)-(PRIORITY_ORDER[b.priority]??9)||a.domain.localeCompare(b.domain)||a.code.localeCompare(b.code));
  const uniqueStrengths=uniq(strengths);
  return Object.freeze({
    version:VERSION,
    result:'PASS',
    strengths:Object.freeze(uniqueStrengths),
    opportunities:Object.freeze(ordered),
    visualMaturity,
    summary:Object.freeze({
      strengths:uniqueStrengths.length,
      opportunities:ordered.length,
      high:ordered.filter((item)=>item.priority==='high').length,
      medium:ordered.filter((item)=>item.priority==='medium').length,
      low:ordered.filter((item)=>item.priority==='low').length,
      visualScore:visualMaturity.score,
      visualStructuralScore:visualMaturity.structuralScore,
      requiresHumanVisualReview:visualMaturity.requiresHumanVisualReview,
    }),
  });
}

async function walk(root){
  const files={};
  async function visit(current){
    let entries=[];try{entries=await fs.readdir(current,{withFileTypes:true});}catch{return;}
    for(const entry of entries){
      const full=path.join(current,entry.name);
      const rel=path.relative(process.cwd(),full).replaceAll('\\','/');
      if(entry.isDirectory()){
        if(/(?:^|\/)(?:vendor|fonts|icons)(?:\/|$)/u.test(rel))continue;
        await visit(full);
      }else if(/\.(?:js|mjs|css|html|webmanifest|json)$/u.test(entry.name)){
        files[rel]=await fs.readFile(full,'utf8');
      }
    }
  }
  await visit(root);
  return files;
}

function markdown(report,generatedAt){
  const lines=[
    '# IBERFIT M26 · Auditoría de experiencia de producto',
    '',
    `- Generada: ${generatedAt}`,
    `- Versión: ${report.version}`,
    `- Resultado técnico: **${report.result}**`,
    `- Preparación visual determinista: **${report.visualMaturity.score}/${report.visualMaturity.maxScore} · ${report.visualMaturity.level}**`,
    `- Fundación estructural: **${report.visualMaturity.structuralScore}/${report.visualMaturity.maxScore}**`,
    `- Delta visual declarado: **${report.visualMaturity.declaredVisualDelta}**`,
    `- Revisión visual humana obligatoria: **${report.visualMaturity.requiresHumanVisualReview?'sí':'no'}**`,
    `- Fortalezas verificadas: ${report.summary.strengths}`,
    `- Oportunidades: ${report.summary.opportunities} (${report.summary.high} altas · ${report.summary.medium} medias · ${report.summary.low} bajas)`,
    '',
    '## Madurez visual',
    '',
  ];
  for(const item of report.visualMaturity.dimensions)lines.push(`- ${item.passed?'PASS':'GAP'} · **${item.label}** (${item.weight} pt): ${item.evidence}`);
  lines.push('','## Oportunidades priorizadas','');
  if(!report.opportunities.length)lines.push('- Sin oportunidades deterministas nuevas en esta pasada.');
  for(const item of report.opportunities){
    lines.push(`- **${item.priority.toUpperCase()} · ${item.domain} · ${item.code}**: ${item.message}`);
    lines.push(`  - Recomendación: ${item.recommendation}`);
    lines.push(`  - Evidencia: ${item.evidence}`);
  }
  lines.push('','## Fortalezas verificadas','');
  for(const item of report.strengths)lines.push(`- **${item.domain} · ${item.code}**: ${item.message}`);
  lines.push('','> La fundación estructural mide presencia/coherencia del sistema; la preparación visual incorpora límites declarados y no certifica por sí sola un acabado premium. La revisión de capturas reales de Cliente, Coach y Admin sigue siendo obligatoria.','> Las oportunidades son no bloqueantes: orientan evolución estética, app-like y de entrenamiento. Los fallos de seguridad/contrato siguen perteneciendo a los gates estrictos.','');
  return `${lines.join('\n')}\n`;
}

export async function runProductExperienceAudit(){
  const files={
    ...await walk(path.resolve('src/m26')),
    ...await walk(path.resolve('public/m26')),
  };
  const report=evaluateProductExperience(files);
  const generatedAt=new Date().toISOString();
  const payload={generatedAt,scannedFiles:Object.keys(files).length,...report};
  await fs.mkdir(OUT_DIR,{recursive:true});
  await fs.writeFile(OUT_JSON,`${JSON.stringify(payload,null,2)}\n`,'utf8');
  await fs.writeFile(OUT_MD,markdown(report,generatedAt),'utf8');
  console.log(`ProductExperienceAudit=${report.result}`);
  console.log(`Strengths=${report.summary.strengths}`);
  console.log(`Opportunities=${report.summary.opportunities}`);
  console.log(`HighOpportunities=${report.summary.high}`);
  console.log(`VisualReadiness=${report.visualMaturity.score}/${report.visualMaturity.maxScore}`);
  console.log(`VisualStructural=${report.visualMaturity.structuralScore}/${report.visualMaturity.maxScore}`);
  console.log(`VisualLevel=${report.visualMaturity.level}`);
  console.log(`HumanVisualReview=${report.visualMaturity.requiresHumanVisualReview}`);
  for(const item of report.opportunities.slice(0,8))console.log(`${item.priority.toUpperCase()}:${item.domain}:${item.code}:${item.message}`);
  return payload;
}

const mainPath=process.argv[1]?path.resolve(process.argv[1]):'';
if(mainPath===fileURLToPath(import.meta.url)){
  runProductExperienceAudit().catch((error)=>{console.error(error);process.exitCode=1;});
}
