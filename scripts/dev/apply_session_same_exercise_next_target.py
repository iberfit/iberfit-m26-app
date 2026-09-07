from pathlib import Path

path = Path('src/m26/workflows/session-ui.js')
source = path.read_text()
start_marker = 'function nextDifferentExercisePreview(execution,catalog,mediaMap,role){'
end_marker = 'function exerciseMemorySetText'
start = source.index(start_marker)
end = source.index(end_marker, start)
replacement = '''function nextSessionPreparation(execution,catalog,mediaMap,role){
  const item=execution?.queue?.[execution.index];
  if(!item)return '';
  const withinCurrentExercise=execution.setIndex+1<Number(item.sets||0);
  const next=withinCurrentExercise?item:execution.queue[execution.index+1];
  if(!next)return '';
  const sameExercise=next.exerciseId===item.exerciseId;
  const exercise=catalog.get(next.exerciseId)||{id:next.exerciseId,name_es:'Siguiente ejercicio'};
  const visual=sameExercise?'':renderExerciseMedia({
    manifest:mediaMap,
    exercise:{...exercise,id:next.exerciseId},
    role,
    compact:true,
    fallback:false,
  });
  const planned=next.prescription||{};
  const target=[
    planned.reps||null,
    planned.tempo?`ritmo ${planned.tempo}`:null,
    Number.isFinite(Number(planned.targetRpe))?`RPE ${planned.targetRpe}`:null,
    Number.isFinite(Number(planned.targetRir))?`RIR ${planned.targetRir}`:null,
  ].filter(Boolean).join(' · ')||'Según indicación';
  const media=visual
    ?`<div class="m26-session-next-exercise-media" data-session-next-exercise-media aria-label="Vista previa del siguiente ejercicio">${visual}</div>`
    :'';
  const preparationAttribute=sameExercise
    ?'data-session-next-set-preparation'
    :'data-session-next-exercise-preparation';
  const label=sameExercise?'Próxima serie':'Próximo objetivo';
  const ariaLabel=sameExercise?'Preparación de la próxima serie':'Preparación del siguiente ejercicio';
  return `<div class="m26-session-next-exercise-preparation" data-session-next-step-preparation ${preparationAttribute} aria-label="${ariaLabel}">${media}<div class="m26-field-grid"><div class="m26-field"><span>${label}</span><strong>${e(target)}</strong></div></div></div>`;
}
'''
source = source[:start] + replacement + source[end:]
old_call = '?nextDifferentExercisePreview(execution,catalog,mediaMap,role)'
if old_call not in source:
    raise SystemExit('nextDifferentExercisePreview call not found')
source = source.replace(old_call, '?nextSessionPreparation(execution,catalog,mediaMap,role)', 1)
path.write_text(source)
