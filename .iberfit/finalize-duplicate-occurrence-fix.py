from pathlib import Path
import sys

mode=sys.argv[1] if len(sys.argv)>1 else ''

if mode=='prepare':
    path=Path('.iberfit/apply-duplicate-occurrence-fix.mjs')
    source=path.read_text()
    source=source.replace(r"execution.results[\`${exercise.id}:1\`]", "execution.results[exercise.id+':1']")
    path.write_text(source)
elif mode=='finalize':
    ui=Path('src/m26/workflows/session-ui.js')
    source=ui.read_text()
    old="  const resultKey=`${step.exerciseId}:${step.setNumber}`;\n  const recorded=execution.results?.[resultKey]||null;"
    new="  const recorded=executionResultForStep(execution,step);"
    if source.count(old)!=1:
        raise SystemExit(f'ACTIVE_RESULT_ANCHOR_COUNT:{source.count(old)}')
    ui.write_text(source.replace(old,new))

    test=Path('tests/m26_session_duplicate_exercise_occurrence.test.mjs')
    source=test.read_text()
    old="""  const html=render(session,execution);
  assert.match(html,/data-session-current-exercise-history/);
  assert.match(html,/70 kg/);
  assert.doesNotMatch(html,/80 kg/);
  assert.doesNotMatch(html,/82 kg/);
  assert.doesNotMatch(html,/primera ocurrencia/);
  assert.doesNotMatch(html,/segunda ocurrencia/);
"""
    new="""  const html=render(session,execution);
  const historyStart=html.indexOf('data-session-current-exercise-history');
  const historyEnd=html.indexOf('</section>',historyStart);
  const history=html.slice(historyStart,historyEnd);
  assert.ok(historyStart>=0);
  assert.match(history,/70 kg/);
  assert.doesNotMatch(history,/80 kg|82 kg/);
  assert.doesNotMatch(history,/primera ocurrencia|segunda ocurrencia/);
  assert.match(html,/segunda ocurrencia/);
"""
    if source.count(old)!=1:
        raise SystemExit(f'HISTORY_ASSERTION_ANCHOR_COUNT:{source.count(old)}')
    test.write_text(source.replace(old,new))
else:
    raise SystemExit('MODE_REQUIRED')
