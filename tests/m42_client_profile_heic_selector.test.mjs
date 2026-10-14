import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProfileAvatarFile} from '../src/m26/profile/client-avatar.js';
const source=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
test('M42 iPhone camera HEIC/HEIF image files are selectable on Client profile',()=>{
 assert.match(source,/accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif" data-iberfit-avatar-upload/u);
 assert.match(source,/si el dispositivo lo admite/u);
 for(const type of ['image/heic','image/heif','image/jpeg','image/png','image/webp'])
   assert.equal(validateProfileAvatarFile({type,size:100}).type,type);
});
