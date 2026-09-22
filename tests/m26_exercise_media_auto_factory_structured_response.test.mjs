import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {extractStructuredResponse} from '../scripts/exercise-media/auto-factory-structured-response.mjs';

test('structured Workers AI JSON Mode response is accepted without string coercion',()=>{
  const response={start:'a'.repeat(50),final:'b'.repeat(50),camera:'side'};
  assert.deepEqual(extractStructuredResponse({result:{response}}),response);
});

test('legacy textual and OpenAI-compatible response shapes remain supported',()=>{
  assert.deepEqual(
    extractStructuredResponse({result:{response:'```json\n{"ok":true}\n```'}}),
    {ok:true},
  );
  assert.deepEqual(
    extractStructuredResponse({result:{choices:[{message:{content:'{"ok":true}'}}]}}),
    {ok:true},
  );
  assert.deepEqual(
    extractStructuredResponse({result:{choices:[{message:{content:[{type:'text',text:'{"ok":true}'}]}}]}}),
    {ok:true},
  );
  assert.deepEqual(
    extractStructuredResponse({result:{output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}]}}),
    {ok:true},
  );
});

test('unsupported response shapes stay fail closed',()=>{
  assert.throws(
    ()=>extractStructuredResponse({result:{response:['unexpected']}},{missingError:'EXPECTED_MISSING'}),
    /EXPECTED_MISSING/u,
  );
  assert.throws(
    ()=>extractStructuredResponse({result:{response:[{type:'image',text:'{"ok":true}'}]}},{missingError:'EXPECTED_MISSING'}),
    /EXPECTED_MISSING/u,
  );
  assert.throws(
    ()=>extractStructuredResponse({result:{response:'not-json'}},{invalidError:'EXPECTED_INVALID'}),
    /EXPECTED_INVALID/u,
  );
});

test('planner and QA both consume the shared structured response parser',async()=>{
  const planner=await readFile(new URL('../scripts/exercise-media/auto-factory-plan.mjs',import.meta.url),'utf8');
  const qa=await readFile(new URL('../scripts/exercise-media/auto-factory-qa.mjs',import.meta.url),'utf8');
  for(const [name,source] of [['planner',planner],['qa',qa]]){
    assert.match(source,/from '\.\/auto-factory-structured-response\.mjs'/u,`${name} must import the shared parser`);
    assert.match(source,/extractStructuredResponse\(/u,`${name} must use the shared parser`);
    assert.doesNotMatch(source,/function extractText\(/u,`${name} must not retain the text-only parser`);
    assert.match(source,/chat_template_kwargs:\{enable_thinking:false,preserve_thinking:false\}/u,`${name} must reserve the completion budget for the final structured answer`);
    assert.match(source,/max_completion_tokens:3200/u,`${name} must leave enough final-output headroom`);
    assert.doesNotMatch(source,/reasoning_effort:'medium'/u,`${name} must not spend the structured-output budget on hidden reasoning`);
  }
  assert.match(planner,/PLAN_CONFIDENCE_LOW/u,'planner confidence gate must remain fail closed');
  assert.match(qa,/inferred\?0\.985:0\.97/u,'QA confidence thresholds must remain strict');
  assert.match(qa,/if\(!pass\)process\.exit\(2\)/u,'QA semantic gate must remain fail closed');
});
