import test from 'node:test';
import assert from 'node:assert/strict';
import {Blob} from 'node:buffer';
import {normalizeAvatar,validateProfileAvatarFile} from '../src/m26/profile/client-avatar.js';

function fixture({bitmap=false,failImage=false}={}){
 const created=[],revoked=[],drawn=[],bitmapClosed=[];
 const image={naturalWidth:600,naturalHeight:800,onload:null,onerror:null};
 Object.defineProperty(image,'src',{set(value){
   created.push(value);
   queueMicrotask(()=>failImage?image.onerror?.():image.onload?.());
 }});
 const canvas={width:0,height:0,
  getContext(){return {drawImage(...args){drawn.push(args);}};},
  toBlob(callback,mime){callback(new Blob(['transcoded-profile-photo'],{type:mime}));}};
 const scope={
  document:{createElement(tag){return tag==='img'?image:canvas;}},
  URL:{createObjectURL(){return 'blob:local-camera-file';},revokeObjectURL(url){revoked.push(url);}},
  setTimeout,clearTimeout,
 };
 if(bitmap)scope.createImageBitmap=async()=>({width:800,height:500,close(){bitmapClosed.push(true);}});
 return {scope,created,revoked,drawn,bitmapClosed};
}
test('M42 accepts iPhone HEIC and returns a small WebP without uploading source EXIF',async()=>{
 const f=fixture(),source={type:'image/heic',size:650};
 assert.strictEqual(validateProfileAvatarFile(source),source);
 const output=await normalizeAvatar(source,{scope:f.scope});
 assert.equal(output.type,'image/webp');
 assert.ok(output.size<524288);
 assert.equal(f.created.length,1);
 assert.deepEqual(f.revoked,['blob:local-camera-file']);
 assert.equal(f.drawn.length,1);
 assert.equal(f.drawn[0].length,9);
});
test('M42 native bitmap path keeps crop center and releases decoded memory',async()=>{
 const f=fixture({bitmap:true});
 const output=await normalizeAvatar({type:'image/jpeg',size:440},{scope:f.scope});
 assert.equal(output.type,'image/webp');
 assert.deepEqual(f.bitmapClosed,[true]);
 assert.equal(f.drawn.length,1);
 assert.equal(f.created.length,0);
});
test('M42 corrupted HEIC fails closed and releases the temporary source URL',async()=>{
 const f=fixture({failImage:true});
 await assert.rejects(
  normalizeAvatar({type:'image/heif',size:440},{scope:f.scope}),
  /M42_AVATAR_IMAGE_INVALID/);
 assert.deepEqual(f.revoked,['blob:local-camera-file']);
 assert.equal(f.drawn.length,0);
});
