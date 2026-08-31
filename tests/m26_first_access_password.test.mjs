import test from 'node:test';
import assert from 'node:assert/strict';
import {renderAccessUi} from '../src/m26/app/access-ui.js';

test('login ofrece primera activación sin crear un segundo flujo de auth',()=>{
  const html=renderAccessUi({backendReady:true,qaOnly:false,mode:'login',host:'app.iberfit.cl'});
  assert.match(html,/Primera vez o no recuerdo mi contraseña/u);
  assert.match(html,/data-auth-action="forgot-password"/u);
  assert.doesNotMatch(html,/registrarse|crear cuenta/iu);
});

test('primera activación reutiliza recuperación y termina en creación de contraseña',()=>{
  const request=renderAccessUi({backendReady:true,qaOnly:false,mode:'request-recovery',host:'app.iberfit.cl'});
  assert.match(request,/Crear o recuperar contraseña/u);
  assert.match(request,/enlace seguro para crear una contraseña nueva/u);
  assert.match(request,/Enviar enlace seguro/u);

  const update=renderAccessUi({backendReady:true,qaOnly:false,mode:'update-password',host:'app.iberfit.cl'});
  assert.match(update,/Crear contraseña nueva/u);
  assert.match(update,/autocomplete="new-password"/u);
  assert.match(update,/Guardar contraseña/u);
});
