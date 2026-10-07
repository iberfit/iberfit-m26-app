import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
test('Diagnóstico IRI permanece fuera de la evolución cotidiana',()=>{const hub=fs.readFileSync('src/m26/engagement/progress-hub.js','utf8');const ui=fs.readFileSync('src/m26/data-experience/progress-decision-ui.js','utf8');assert.match(hub,/role:'initial-diagnostic'/u);assert.match(hub,/contributesToEvolution:false/u);assert.match(hub,/El IRI establece el punto de partida; las reevaluaciones y la evolución se registran fuera del Diagnóstico IRI\./u);assert.match(ui,/Diagnóstico IRI · punto de partida/u);assert.match(ui,/El Diagnóstico IRI no se mezcla con las señales de evolución cotidiana\./u);});
