import test from 'node:test';
import assert from 'node:assert/strict';
import {isQaIriSignedPhotoRead,qaIriPrivatePhotoEvidenceLabel} from '../qa/coach-webauthn-recurring/qa-iri-signed-photo-read.mjs';

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

test('U26 QA signed reads never target production or alternate Supabase tenants',()=>{
  const signed=photo()+'?token='+('x'.repeat(64));
  for(const origin of ['https://app.iberfit.cl','https://other.supabase.co','https://gjztkdwfmunnzhtvxrsu.supabase.co.evil.test']){
    assert.equal(allowed(mock('GET',signed.replace(QA,origin))),false,origin);
    assert.equal(allowed(mock('POST',photo().replace(QA,origin))),false,origin);
  }
});
test('U26 QA rejects encoded photo paths, secondary Storage APIs and tokens outside bounds',()=>{
  for(const path of [
    photo().replace('/front/','/%66ront/'),
    photo().replace('/original.png','/original.png/extra'),
    photo().replace('/object/sign/','/object/upload/sign/'),
    photo().replace('/object/sign/','/object/list/'),
    photo().replace('/front/','/FRONT/'),
    photo().replace('/original.png','/original.PNG'),
  ])assert.equal(allowed(mock('POST',path)),false,path);
  const invalid=['x'.repeat(29),'x'.repeat(4097),'x'.repeat(64)+'%20'];
  for(const token of invalid)assert.equal(allowed(mock('GET',photo()+'?token='+token)),false,token.length);
});
test('U26 QA rejects nonfinite and noninteger expiration times',()=>{
  for(const expiresIn of [-1,0,59,60.1,599.9,601,1e12,NaN,Infinity,null,undefined]){
    assert.equal(allowed(mock('POST',photo(),{body:{expiresIn}})),false,String(expiresIn));
  }
});


test('U26 private photo evidence labels never persist IDs or signed tokens',()=>{
  const token='SENSITIVE-SIGNED-URL-TOKEN-'+('z'.repeat(64));
  const urls=[
    photo('front')+'?token='+token,
    photo('back').replace('/object/sign/','/object/upload/'),
    photo('left').replace('/front/','/left/')+'?token='+token,
    photo('right').replace(QA,'https://foreign.example'),
    photo('front').replace(CLIENT,'malformed-client')+'?token='+token,
    photo('back').replace('iberfit-iri-photogrammetry','iberfit-iri-photogrammetry%2Fencoded'),
  ];
  for(const url of urls){
    const request=mock(url.includes('upload')?'PUT':'POST',url);
    const label=qaIriPrivatePhotoEvidenceLabel(request,{qaOrigin:QA});
    assert.equal(typeof label,'string');
    for(const sensitive of [CLIENT,ASSESSMENT,CAPTURE,token,'malformed-client','foreign.example']){
      assert.equal(label.includes(sensitive),false,sensitive+' leaked');
    }
    assert.match(label,/private-iri-photo/u);
    assert.ok(label.length<120);
  }
  assert.equal(qaIriPrivatePhotoEvidenceLabel(mock('GET',QA+'/rest/v1/iri_consents_v1'),{qaOrigin:QA}),null);
});

test('U26 private photo evidence labels retain only bounded diagnostic categories',()=>{
  assert.equal(
    qaIriPrivatePhotoEvidenceLabel(mock('POST',photo('front')),{qaOrigin:QA}),
    'POST qa-supabase private-iri-photo operation:sign view:front'
  );
  assert.equal(
    qaIriPrivatePhotoEvidenceLabel(mock('PUT',photo('back').replace('/object/sign/','/object/upload/')),{qaOrigin:QA}),
    'PUT qa-supabase private-iri-photo operation:other view:back'
  );
  assert.equal(
    qaIriPrivatePhotoEvidenceLabel(mock('GET',photo('right').replace(QA,'https://other.example')),{qaOrigin:QA}),
    'GET other-origin private-iri-photo operation:sign view:right'
  );
  assert.equal(qaIriPrivatePhotoEvidenceLabel({url:()=>'%not-a-url',method:()=>'GET'},{qaOrigin:QA}),null);
});
