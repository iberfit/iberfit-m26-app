import assert from 'node:assert/strict';
import test from 'node:test';

import {renderExerciseMedia} from '../src/m26/library/exercise-media-ui.js';

const manifest={
  schemaVersion:1,
  source:{provider:'IBERFIT'},
  items:[{
    exercise_id:'air-squat',
    name_es:'Sentadilla al aire',
    review_status:'approved',
    published:true,
    coach_visible:true,
    client_visible:true,
    image_mode:'main',
    image_paths:['/public/iberfit/exercises/images/air-squat/main.webp'],
  }],
};
const exercise={id:'air-squat',name_es:'Sentadilla al aire'};

test('full exercise media is eager and high priority by default',()=>{
  const html=renderExerciseMedia({manifest,exercise,role:'client',fallback:false});
  assert.match(html,/loading="eager"/);
  assert.match(html,/fetchpriority="high"/);
  assert.match(html,/decoding="async"/);
});

test('compact exercise media is lazy and low priority for list surfaces',()=>{
  const html=renderExerciseMedia({manifest,exercise,role:'client',compact:true,fallback:false});
  assert.match(html,/loading="lazy"/);
  assert.match(html,/fetchpriority="low"/);
  assert.doesNotMatch(html,/fetchpriority="high"/);
});

test('loading priority can be explicitly disabled on a full media surface',()=>{
  const html=renderExerciseMedia({manifest,exercise,role:'client',priority:false,fallback:false});
  assert.match(html,/loading="lazy"/);
  assert.doesNotMatch(html,/fetchpriority="high"/);
  assert.doesNotMatch(html,/fetchpriority="low"/);
});
