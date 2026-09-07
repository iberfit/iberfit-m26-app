from pathlib import Path

path = Path('src/m26/workflows/session-ui.js')
source = path.read_text()

old_totals = '''function executionTotals(execution){
  const queue=Array.isArray(execution?.queue)?execution.queue:[];
  const results=Object.values(execution?.results||{});
  const totalSets=queue.reduce(
    (sum,item)=>sum+Math.max(0,Number(item?.sets||0)),
    0,
  );
  const completedSets=results.length;
  const completedExercises=new Set(
    results
      .map((item)=>item?.exerciseId)
      .filter(Boolean),
  ).size;

  return {
    completedSets,
    totalSets,
    completedExercises,
    totalExercises:queue.length,
  };
}
'''
new_totals = '''function executionTotals(execution){
  const queue=Array.isArray(execution?.queue)?execution.queue:[];
  const resultMap=execution?.results||{};
  const skippedMap=execution?.skippedSets||{};
  const results=Object.values(resultMap);
  const resultKeys=Object.keys(resultMap);
  const skippedKeys=Object.keys(skippedMap);
  const totalSets=queue.reduce(
    (sum,item)=>sum+Math.max(0,Number(item?.sets||0)),
    0,
  );
  const completedSets=results.length;
  const skippedSets=skippedKeys.filter((key)=>!Object.prototype.hasOwnProperty.call(resultMap,key)).length;
  const resolvedSets=Math.min(totalSets,new Set([...resultKeys,...skippedKeys]).size);
  const completedExercises=new Set(
    results
      .map((item)=>item?.exerciseId)
      .filter(Boolean),
  ).size;

  return {
    completedSets,
    skippedSets,
    resolvedSets,
    totalSets,
    completedExercises,
    totalExercises:queue.length,
  };
}
'''
if old_totals not in source:
    raise SystemExit('executionTotals contract not found')
source = source.replace(old_totals, new_totals, 1)

old_summary = '''  const setsValue=ready
    ?`${totals.totalSets}`
    :`${totals.completedSets} / ${totals.totalSets}`;

  const setLabel=ready
    ?'Series planificadas'
    :'Series completadas';
'''
new_summary = '''  const setsValue=ready
    ?`${totals.totalSets}`
    :`${totals.resolvedSets} / ${totals.totalSets}`;

  const setLabel=ready
    ?'Series planificadas'
    :(totals.skippedSets?'Series resueltas':'Series completadas');
  const setsDetail=!ready&&totals.skippedSets
    ?`${plural(totals.completedSets,'registrada','registradas')} · ${plural(totals.skippedSets,'omitida','omitidas')}`
    :'';
'''
if old_summary not in source:
    raise SystemExit('sessionLiveSummary values contract not found')
source = source.replace(old_summary, new_summary, 1)

old_summary_markup = '''      <span>${e(setLabel)}</span>
      <strong>${e(setsValue)}</strong>
    </div>
'''
new_summary_markup = '''      <span>${e(setLabel)}</span>
      <strong>${e(setsValue)}</strong>
      ${setsDetail?`<small>${e(setsDetail)}</small>`:''}
    </div>
'''
if old_summary_markup not in source:
    raise SystemExit('sessionLiveSummary markup contract not found')
source = source.replace(old_summary_markup, new_summary_markup, 1)

old_completed = '''    <div>
      <span>Series</span>
      <strong>${e(totals.completedSets)} / ${e(totals.totalSets)}</strong>
    </div>
'''
new_completed = '''    <div>
      <span>${totals.skippedSets?'Series resueltas':'Series'}</span>
      <strong>${e(totals.resolvedSets)} / ${e(totals.totalSets)}</strong>
      ${totals.skippedSets?`<small>${e(plural(totals.completedSets,'registrada','registradas'))} · ${e(plural(totals.skippedSets,'omitida','omitidas'))}</small>`:''}
    </div>
'''
if old_completed not in source:
    raise SystemExit('completedSessionSummary contract not found')
source = source.replace(old_completed, new_completed, 1)

old_progress = '''        (totals.completedSets/Math.max(1,totals.totalSets))*100,
      ),
    ),
  );
'''
new_progress = '''        (totals.resolvedSets/Math.max(1,totals.totalSets))*100,
      ),
    ),
  );
  const progressLabel=totals.skippedSets
    ?`${totals.resolvedSets} de ${totals.totalSets} series resueltas · ${plural(totals.skippedSets,'omitida','omitidas')}`
    :`${totals.completedSets} de ${totals.totalSets} series`;
'''
if old_progress not in source:
    raise SystemExit('progress calculation contract not found')
source = source.replace(old_progress, new_progress, 1)

old_progress_markup = '''          <small data-session-progress-label>${e(totals.completedSets)} de ${e(totals.totalSets)} series</small>
'''
new_progress_markup = '''          <small data-session-progress-label>${e(progressLabel)}</small>
'''
if old_progress_markup not in source:
    raise SystemExit('progress label contract not found')
source = source.replace(old_progress_markup, new_progress_markup, 1)

path.write_text(source)
