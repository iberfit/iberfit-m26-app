import test from 'node:test';
import assert from 'node:assert/strict';
import {isQaIriSignedPhotoRead} from '../qa/coach-webauthn-recurring/qa-iri-signed-photo-read.mjs';

const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const CLIENT='11111111-1111-4111-8111-111111111111';
const ASSESSMENT='22222222-2222-4222-8222-222222222222';
const CAPTURE='33333333-3333-4333-8333-333333333333';
const PREFIX='/storage/v1/object/sign/iberfit-iri-photogrammetry/';
const photo=(angle='front')=>`${QA}${PREFIX}${CLIENT}/${ASSESSMENT}/${angle}/${CAPTURE}/original.png`;
const mock=(method,url,{auth='Bearer qa-read-only-fixture-token',body={expiresIn:300}}={})=>({
  method:()=>method,url:()=>url,headers:()=>({authorization:auth}),postDataJSON:()=>body,
});
const allowed=(request)=>isQaIriSignedPhotoRead(request,{qaOrigin:QA});

test('U26 QA permits only time-bounded JWT-authenticated private photo signing',()=>{
  for(const angle of ['front','back','left','right']){
    for(const expiry of [60,300,600])
      assert.equal(allowed(mock('POST',photo(angle),{body:{expiresIn:expiry}})),true,`${angle} ${expiry}`);
  }
});
test('U26 QA permits signed-read download with exactly one signed token',()=>{
  const read=mock('GET',photo('back')+'?token='+('x'.repeat(64)),{auth:''});
  assert.equal(allowed(read),true);
});
test('U26 QA rejects signing outside exact bucket, project, UUID path or photo angles',()=>{
  const cases=[
    photo().replace(QA,'https://untrusted.example'),
    photo().replace('iberfit-iri-photogrammetry','public-assets'),
    photo().replace(CLIENT,'user-id'),
    photo().replace(ASSESSMENT,'../../etc'),
    photo().replace('/front/','/top/'),
    photo().replace('original.png','thumbnail.png'),
    photo().replace('original.png','original.svg'),
    photo().replace('/object/sign/','/object/'),
    photo()+'?upsert=true',
    photo()+'#spoof',
  ];
  for(const url of cases)assert.equal(allowed(mock('POST',url)),false,url);
});
test('U26 QA rejects all mutation methods even for canonical private photo paths',()=>{
  for(const method of ['PUT','PATCH','DELETE','HEAD','OPTIONS']){
    assert.equal(allowed(mock(method,photo())),false,method);
  }
});
test('U26 QA rejects unsigned, malformed and overlong signing requests',()=>{
  const bodies=[{}, {expiresIn:59},{expiresIn:601},{expiresIn:'300'},
    {expiresIn:300,upsert:true},{expiresIn:300,paths:['x']},
    {expiresIn:300,download:true},[],null];
  for(const body of bodies)assert.equal(allowed(mock('POST',photo(),{body})),false,JSON.stringify(body));
  for(const auth of ['', 'anon', 'Bearer ', 'Basic dXNlcg=='])
    assert.equal(allowed(mock('POST',photo(),{auth})),false,auth);
});
test('U26 QA signed reads reject extra query parameters, untrusted origins and missing token',()=>{
  const token='t'.repeat(64);
  const cases=[photo()+'?token=',photo()+'?download=1',
    photo()+'?token='+token+'&download=1',
    photo()+'?token='+token+'&token='+token,
    photo()+'?token='+token+'#extra',
    photo().replace(QA,'https://untrusted.example')+'?token='+token,
  ];
  for(const url of cases)assert.equal(allowed(mock('GET',url)),false,url);
});
