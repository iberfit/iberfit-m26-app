export const CONTEXTUAL_GUIDANCE_SCHEMA_VERSION='iberfit.contextual-guidance.v1';

const GUIDANCE_CATALOG=Object.freeze({
  iri:Object.freeze({
    title:'Evaluación IRI',
    summary:'El IRI es la evaluación inicial estructurada de IBERFIT para documentar contexto, capacidades observadas y criterios de planificación.',
    points:Object.freeze([
      'Integra perfil, entrevista y dominios de evaluación cuando corresponden.',
      'Registra protocolo, condiciones, validez y trazabilidad para poder reevaluar de forma comparable.',
      'Apoya la planificación del entrenador; no sustituye una valoración clínica ni genera una prescripción automática.',
    ]),
  }),
  vfc:Object.freeze({
    title:'VFC · variabilidad de la frecuencia cardiaca',
    summary:'La VFC describe la variación temporal entre latidos. En IBERFIT se usa como contexto longitudinal, no como diagnóstico.',
    points:Object.freeze([
      'Solo se compara cuando el método es conocido y homogéneo.',
      'RMSSD y SDNN no se intercambian como si fueran la misma medición.',
      'Una tendencia de VFC no cambia automáticamente la carga, las series ni los ejercicios.',
    ]),
  }),
  'data-quality':Object.freeze({
    title:'Calidad del dato',
    summary:'La calidad describe la confianza técnica de la observación disponible; no clasifica la salud ni el rendimiento de la persona.',
    points:Object.freeze([
      'Considera la calidad informada por la fuente y la disponibilidad de observaciones interpretables.',
      'Una calidad limitada invita a leer el dato con más cautela.',
      'Sin datos se muestra como ausencia, nunca como cero inventado.',
    ]),
  }),
  'data-source':Object.freeze({
    title:'Procedencia del dato',
    summary:'La procedencia indica de qué sistema o proveedor llega la observación mostrada.',
    points:Object.freeze([
      'IBERFIT conserva la fuente necesaria para interpretar y auditar el dato.',
      'Cuando existen varias fuentes, la agregación evita sobreponderar un proveedor por tener más registros.',
      'La procedencia no amplía permisos ni expone identificadores de hardware innecesarios.',
    ]),
  }),
  'data-coverage':Object.freeze({
    title:'Cobertura',
    summary:'La cobertura expresa qué parte del periodo dispone de datos utilizables.',
    points:Object.freeze([
      'Los días sin datos no se imputan ni se convierten en cero.',
      'Una cobertura baja limita la fuerza de una comparación o tendencia.',
      'Cobertura y calidad son conceptos distintos y se muestran por separado.',
    ]),
  }),
  'data-method':Object.freeze({
    title:'Método',
    summary:'El método explica cómo se obtuvo, normalizó o agregó el valor que estás viendo.',
    points:Object.freeze([
      'Conocer el método permite decidir si dos periodos son realmente comparables.',
      'En métricas multifuente se normaliza primero por día y proveedor antes de resumir.',
      'Si el método relevante es desconocido, IBERFIT lo hace visible en lugar de asumir equivalencia.',
    ]),
  }),
  'training-load':Object.freeze({
    title:'Carga, RPE y RIR',
    summary:'La carga de entrenamiento se interpreta junto con volumen, repeticiones o tiempo, descanso, RPE, RIR y contexto de la sesión.',
    points:Object.freeze([
      'RPE expresa esfuerzo percibido; RIR estima repeticiones que quedaban en reserva.',
      'Son señales para contextualizar una serie, no órdenes automáticas para subir o bajar carga.',
      'El entrenador decide los cambios de prescripción considerando historial, ejecución, recuperación y objetivo.',
    ]),
  }),
});

function text(value,max=240){
  return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
}

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

export function contextualGuidance(key){
  const normalized=text(key,80);
  return GUIDANCE_CATALOG[normalized]||null;
}

export function renderGuidanceTrigger(key,{
  label='Abrir ayuda contextual',
}={}){
  const entry=contextualGuidance(key);
  if(!entry)return '';
  const accessible=text(label,160)||`Ayuda: ${entry.title}`;
  return `<button type="button" class="m26-guidance-trigger" data-guidance-key="${escapeHtml(key)}" aria-label="${escapeHtml(accessible)}" aria-haspopup="dialog" aria-expanded="false"><span aria-hidden="true">?</span></button>`;
}

export function renderGuidancePopover(key){
  const entry=contextualGuidance(key);
  if(!entry)return '';
  return `<aside class="iberfit-popover m26-guidance-popover" data-guidance-popover="${escapeHtml(key)}" id="m26-contextual-guidance" role="dialog" aria-modal="false" aria-labelledby="m26-contextual-guidance-title"><div class="m26-guidance-popover-heading"><div><p class="m26-eyebrow">Ayuda contextual</p><h2 id="m26-contextual-guidance-title">${escapeHtml(entry.title)}</h2></div><button type="button" class="m26-guidance-close" data-guidance-close aria-label="Cerrar ayuda">×</button></div><p>${escapeHtml(entry.summary)}</p><ul>${entry.points.map((point)=>`<li>${escapeHtml(point)}</li>`).join('')}</ul><p class="m26-guidance-rule">La ayuda explica el dato o control. No modifica decisiones, permisos ni prescripción.</p></aside>`;
}

export function createContextualGuidanceController({
  root,
}={}){
  if(!root?.addEventListener)throw new Error('M26_CONTEXTUAL_GUIDANCE_ROOT_REQUIRED');

  let mounted=false;
  let activeTrigger=null;
  let panel=null;

  function close({restoreFocus=true}={}){
    if(panel){
      panel.remove?.();
      panel=null;
    }
    if(activeTrigger){
      activeTrigger.setAttribute?.('aria-expanded','false');
      if(restoreFocus)activeTrigger.focus?.({preventScroll:true});
      activeTrigger=null;
    }
  }

  function open(trigger){
    const key=text(trigger?.getAttribute?.('data-guidance-key'),80);
    if(!contextualGuidance(key))return false;
    close({restoreFocus:false});
    const host=trigger.ownerDocument?.createElement?.('div');
    if(!host)return false;
    host.innerHTML=renderGuidancePopover(key);
    panel=host.firstElementChild;
    if(!panel)return false;
    root.append(panel);
    activeTrigger=trigger;
    trigger.setAttribute?.('aria-expanded','true');
    panel.querySelector?.('[data-guidance-close]')?.focus?.({preventScroll:true});
    return true;
  }

  function onClick(event){
    const closeButton=event.target?.closest?.('[data-guidance-close]');
    if(closeButton){
      event.preventDefault?.();
      close();
      return;
    }
    const trigger=event.target?.closest?.('[data-guidance-key]');
    if(trigger){
      event.preventDefault?.();
      if(trigger===activeTrigger&&panel){
        close();
        return;
      }
      open(trigger);
      return;
    }
    if(panel&&!panel.contains?.(event.target))close({restoreFocus:false});
  }

  function onKeydown(event){
    if(event.key==='Escape'&&panel){
      event.preventDefault?.();
      close();
    }
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      root.addEventListener('click',onClick);
      root.addEventListener('keydown',onKeydown);
      mounted=true;
    },
    destroy(){
      if(!mounted)return;
      root.removeEventListener('click',onClick);
      root.removeEventListener('keydown',onKeydown);
      close({restoreFocus:false});
      mounted=false;
    },
    openKey(key){
      const trigger=[...root.querySelectorAll?.('[data-guidance-key]')||[]]
        .find((node)=>node.getAttribute?.('data-guidance-key')===key);
      return trigger?open(trigger):false;
    },
    close,
  });
}

export const __contextualGuidanceInternals=Object.freeze({
  GUIDANCE_CATALOG,
  text,
  escapeHtml,
});