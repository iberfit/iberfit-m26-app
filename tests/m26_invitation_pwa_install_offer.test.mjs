import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSTALL_OFFER_DISMISSAL_KEY,INSTALL_OFFER_DISMISSAL_MS,
  selectInstallOfferMode,shouldOfferPwaInstall,
  readInstallOfferDismissal,dismissInstallOffer,
} from '../src/m26/experience/invitation-install-offer.js';

test('PWA invitation offers native Chromium installation only when a real browser prompt exists',()=>{
  assert.equal(selectInstallOfferMode({kind:'prompt',android:true}),'native');
  assert.equal(selectInstallOfferMode({kind:'unavailable',android:true}),'guide');
  assert.equal(selectInstallOfferMode({kind:'manual',ios:true}),'guide');
  assert.equal(selectInstallOfferMode({kind:'unavailable'}),'none');
  assert.equal(selectInstallOfferMode({kind:'prompt',installed:true,android:true}),'none');
});

test('PWA invitation never interrupts sign-in bootstrap, MFA, training, dialog or background tab',()=>{
  const valid={mode:'native',ready:true,now:1_000,dismissedUntil:0};
  assert.equal(shouldOfferPwaInstall(valid),true);
  for(const delta of [
    {ready:false},{sessionActive:true},{blockingDialog:true},{visible:false},
    {installed:true},{mode:'none'},{dismissedUntil:1_001},
  ])assert.equal(shouldOfferPwaInstall({...valid,...delta}),false,JSON.stringify(delta));
});

test('PWA invitation dismissal is local, bounded and safe under restricted storage',()=>{
  const map=new Map();
  const storage={getItem:(key)=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
  const start=1_880_000_000_000;
  assert.equal(readInstallOfferDismissal(storage),0);
  assert.equal(dismissInstallOffer(storage,start),true);
  assert.equal(map.get(INSTALL_OFFER_DISMISSAL_KEY),String(start+INSTALL_OFFER_DISMISSAL_MS));
  assert.equal(readInstallOfferDismissal(storage),start+INSTALL_OFFER_DISMISSAL_MS);
  assert.equal(shouldOfferPwaInstall({mode:'guide',ready:true,now:start+1,dismissedUntil:readInstallOfferDismissal(storage)}),false);
  assert.equal(shouldOfferPwaInstall({mode:'guide',ready:true,now:start+INSTALL_OFFER_DISMISSAL_MS,dismissedUntil:readInstallOfferDismissal(storage)}),true);
  assert.equal(readInstallOfferDismissal({getItem:()=>{throw new Error('private mode');}}),0);
  assert.equal(dismissInstallOffer({setItem:()=>{throw new Error('private mode');}},start),false);
  map.set(INSTALL_OFFER_DISMISSAL_KEY,'NaN');
  assert.equal(readInstallOfferDismissal(storage),0);
});

test('PWA installation offer cannot encode or persist invitation tokens or identities',()=>{
  const sensitiveMarkers=['access_token','refresh_token','token_hash','authorization','password','user_id','client_id'];
  const src=String(selectInstallOfferMode)+String(shouldOfferPwaInstall)+
    String(readInstallOfferDismissal)+String(dismissInstallOffer);
  for(const marker of sensitiveMarkers)assert.equal(src.includes(marker),false,marker);
});
