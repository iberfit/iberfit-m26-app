import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AVATAR_BUCKET,AVATAR_MAX_OUTPUT_BYTES,profileAvatarPath,validateProfileAvatarFile,canEditOwnProfileAvatar,avatarUploadMessage} from '../src/m26/profile/client-avatar.js';

const own='10000000-0000-4000-8000-000000000271';
test('M42 avatar uses only canonical client-owned private WebP path',()=>{
  assert.equal(AVATAR_BUCKET,'iberfit-profile-avatars');
  assert.equal(profileAvatarPath(own),own+'/avatar.webp');
  for(const value of ['../../../etc/passwd','',own+'/x.svg','another-client','BAD'])assert.throws(()=>profileAvatarPath(value),/M42_AVATAR_CLIENT_ID_INVALID/);
});
test('M42 avatar accepts only bounded source images and own client edit',()=>{
  for(const type of ['image/png','image/jpeg','image/webp'])
    assert.equal(validateProfileAvatarFile({type,size:1024}).type,type);
  for(const type of ['image/svg+xml','text/html','image/gif','application/octet-stream'])
    assert.throws(()=>validateProfileAvatarFile({type,size:100}),/M42_AVATAR_UNSUPPORTED_IMAGE/);
  assert.throws(()=>validateProfileAvatarFile({type:'image/png',size:6*1024*1024}),/M42_AVATAR_FILE_TOO_LARGE/);
  assert.ok(AVATAR_MAX_OUTPUT_BYTES<=524288);
  assert.equal(canEditOwnProfileAvatar({role:'client',clientId:own,id:'client-user'}),true);
  assert.equal(canEditOwnProfileAvatar({role:'coach',clientId:own,id:'coach-user'}),false);
  assert.equal(canEditOwnProfileAvatar({role:'admin',clientId:own,id:'admin-user'}),false);
  assert.equal(canEditOwnProfileAvatar({role:'client',clientId:own}),false);
  assert.match(avatarUploadMessage('M42_AVATAR_FORBIDDEN'),/permiso/);
});
test('M42 avatar storage has no public bucket or broad write privileges',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261014221500_m42_private_client_avatars_v1.sql',import.meta.url),'utf8');
  assert.match(sql,/iberfit-profile-avatars',false,524288/);
  assert.match(sql,/for select to authenticated/i);
  assert.match(sql,/for insert to authenticated/i);
  assert.match(sql,/for update to authenticated/i);
  assert.match(sql,/for delete to authenticated/i);
  assert.match(sql,/public\.is_assigned_coach/);
  assert.match(sql,/public\.iberfit_client_id\(\)=/);
  assert.doesNotMatch(sql,/create policy[^;]+for (?:insert|update|delete)[^;]+public\.is_assigned_coach/is);
  assert.doesNotMatch(sql,/to anon/i);
});
