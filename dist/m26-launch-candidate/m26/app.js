import {createM26Application} from '/src/m26/app/application.js';
const app=await createM26Application();
await app.mount();
globalThis.__IBERFIT_M26_APP__=app;
