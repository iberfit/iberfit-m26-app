import fs from 'node:fs';
function replaceOnce(text,from,to,label){const count=text.split(from).length-1;if(count!==1)throw new Error(`${label}: expected 1 match, got ${count}`);return text.replace(from,to);}

const executionPath='src/m26/workflows/session-execution.js';
let execution=fs.readFileSync(executionPath,'utf8');
execution=replaceOnce(execution,'function occurrenceHasResolvedSet(execution,item){','export function executionOccurrenceHasProgress(execution,item){','export occurrence progress helper');
execution=replaceOnce(execution,'if(occurrenceHasResolvedSet(execution,item))throw new Error(\'M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED\');','if(executionOccurrenceHasProgress(execution,item))throw new Error(\'M26_EXECUTION_SUBSTITUTION_AFTER_SET_RECORDED\');','use exported occurrence progress helper');
fs.writeFileSync(executionPath,execution);

const uiPath='src/m26/workflows/session-ui.js';
let ui=fs.readFileSync(uiPath,'utf8');
ui=replaceOnce(ui,
"import { currentStep,executionResultForStep,previousSetDraftValues } from './session-execution.js';",
"import { currentStep,executionResultForStep,previousSetDraftValues,executionOccurrenceHasProgress } from './session-execution.js';",
'import occurrence progress helper');
ui=replaceOnce(ui,
'  const recorded=executionResultForStep(execution,step);',
'  const recorded=executionResultForStep(execution,step);\n  const substitutionBlocked=executionOccurrenceHasProgress(execution,step);',
'compute substitution availability');
ui=replaceOnce(ui,
'          <button type="button" data-session-action="substitute" data-from-exercise-id="${e(step.exerciseId)}" ${recorded?\'disabled aria-disabled="true" title="Continúa a la siguiente serie antes de sustituir"\':\'\'}>Usar alternativa</button>',
'          <button type="button" data-session-action="substitute" data-from-exercise-id="${e(step.exerciseId)}" ${substitutionBlocked?\'disabled aria-disabled="true" title="La sustitución sólo está disponible antes de registrar u omitir la primera serie"\':\'\'}>Usar alternativa</button>',
'align substitution button with domain guard');
fs.writeFileSync(uiPath,ui);

const testPath='tests/m26_session_substitution_progress.test.mjs';
let test=fs.readFileSync(testPath,'utf8');
test=replaceOnce(test,
"import {createExecution,startExecution,recordSet,advanceExecution,skipExecutionSet,substituteExercise} from '../src/m26/workflows/session-execution.js';",
"import {createExecution,startExecution,recordSet,advanceExecution,skipExecutionSet,substituteExercise,executionOccurrenceHasProgress} from '../src/m26/workflows/session-execution.js';\nimport {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';",
'import UI and helper');
test += `\n\ntest('guided execution disables substitution after occurrence progress',()=>{\n  const {session,execution}=setup();\n  startExecution(execution);\n  let html=renderGuidedExecution({execution,session,catalog});\n  assert.match(html,/data-session-action="substitute"[^>]*>Usar alternativa<\\/button>/);\n  assert.doesNotMatch(html,/data-session-action="substitute"[^>]*disabled/);\n  recordSet(execution,session,{reps:10,rpe:7});\n  advanceExecution(execution);\n  assert.equal(executionOccurrenceHasProgress(execution,execution.queue[0]),true);\n  html=renderGuidedExecution({execution,session,catalog});\n  assert.match(html,/data-session-action="substitute"[^>]*disabled aria-disabled="true"/);\n  assert.match(html,/La sustitución sólo está disponible antes de registrar u omitir la primera serie/);\n});\n\ntest('guided execution also disables substitution after a skipped set',()=>{\n  const {session,execution}=setup();\n  startExecution(execution);\n  skipExecutionSet(execution,session,{reason:'Molestia puntual'});\n  const html=renderGuidedExecution({execution,session,catalog});\n  assert.match(html,/data-session-action="substitute"[^>]*disabled aria-disabled="true"/);\n});\n`;
fs.writeFileSync(testPath,test);
