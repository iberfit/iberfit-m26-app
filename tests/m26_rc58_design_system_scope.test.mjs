import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const scope=fs.readFileSync("docs/RC58_DESIGN_SYSTEM_SCOPE.md","utf8");
const roadmap=fs.readFileSync("docs/ROADMAP_RC58_RC64_PREMIUM.md","utf8");
const security=fs.readFileSync("docs/SECURITY_RELIABILITY_RAIL_RC58_RC64.md","utf8");

test("RC58 es Design System y no Health Connect",()=>{
  assert.match(scope,/RC58_SCOPE_NAME=IBERFIT_DESIGN_SYSTEM/);
  assert.match(scope,/RC58 NO implementa ECharts todavía/);
  assert.match(scope,/Health Connect histórico/);
  assert.match(scope,/NEXT_ACTION=RC58_1_TOKEN_FOUNDATION/);
});

test("RC58 incluye tokens primitives roles y accesibilidad",()=>{
  for(const marker of [
    "fuente canónica de tokens",
    "Component primitives",
    "Cliente:",
    "Coach:",
    "Admin:",
    "WCAG 2.2 AA",
    "data visualization palette",
    "reduced-motion"
  ]) assert.equal(scope.includes(marker),true);
});

test("roadmap coloca Health Connect dentro de RC59",()=>{
  assert.match(roadmap,/RC59 — Session Intelligence & Data Platform/);
  assert.match(roadmap,/RC59\.2 — Historical device acquisition/);
  assert.match(roadmap,/Health Connect Android histórico entra aquí, no en RC58/);
});

test("RC59 convierte la FC live en inteligencia de sesión",()=>{
  assert.match(roadmap,/RC59\.0 — Canonical telemetry timeline/);
  assert.match(roadmap,/RC59\.1 — Live Session Intelligence/);
  assert.match(roadmap,/respuesta por bloque\/ejercicio/);
  assert.match(roadmap,/recuperación durante descansos/);
  assert.match(roadmap,/RPE\/RIR/);
});

test("retos consumen métricas canónicas con privacidad",()=>{
  assert.match(roadmap,/RC59\.5 — Challenge Metrics Foundation/);
  assert.match(roadmap,/Los retos consumen métricas canónicas, nunca sensores directamente/);
  assert.match(roadmap,/Los rankings grupales no exponen datos sanitarios crudos/);
  assert.match(roadmap,/Nunca se incentiva “FC más alta” como objetivo competitivo/);
  assert.match(roadmap,/Engagement & Challenges/);
});

test("roadmap conserva Admin como rail crítico",()=>{
  assert.match(roadmap,/Critical rail A — Admin \/ RC46/);
  assert.match(roadmap,/no se aplica hasta cerrar el read-model organizacional de Admin/);
});

test("roadmap evita doble motor transversal de motion",()=>{
  assert.match(roadmap,/Motion \(JavaScript\) será el motor principal/);
  assert.match(roadmap,/AutoAnimate no será dependencia transversal por defecto/);
});

test("roadmap no oculta coste premium de agenda",()=>{
  assert.match(roadmap,/FullCalendar Standard/);
  assert.match(roadmap,/resource premium/);
});

test("roadmap convierte recopilación de datos en trust contract",()=>{
  assert.match(roadmap,/Trust & Data Governance/);
  assert.match(roadmap,/No se recopila un dato solo porque técnicamente sea posible/);
  assert.match(roadmap,/capturar → validar → contextualizar → mostrar → revisar → decidir → acompañar → medir/);
});

test("security rail es cross-cutting y tenant-safe",()=>{
  assert.match(roadmap,/Security & Reliability/);
  assert.match(security,/SECURITY_RELIABILITY_RAIL=ACTIVE/);
  assert.match(security,/CROSS_CLIENT_DISCLOSURE_RELEASE_BLOCKER=TRUE/);
  assert.match(security,/RLS es la frontera de autorización/);
  assert.match(security,/Cliente A → Cliente B/);
});

test("security rail cubre mobile bridge supply chain y reliability",()=>{
  assert.match(security,/SR3 — Native\/mobile boundary/);
  assert.match(security,/preferir mensajería origin-scoped/);
  assert.match(security,/SR6 — Supply chain & CI/);
  assert.match(security,/SR7 — Reliability engineering/);
  assert.match(security,/SR9 — Incident response/);
  assert.match(security,/NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY/);
});