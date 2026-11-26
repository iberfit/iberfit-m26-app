# GLOBAL EXCELLENCE & INTELLIGENCE 360 — checkpoint 2026-11-25 Chile

Base Canary: `50ba022115091478a86900be6f0b0e4c816044ef`. Historical production promotion #45732501319 succeeded; direct served identity was not accessible in this session. Existing open PRs include #1319 (erasure), M44 branches #995/#983/#980/#970, and staged dated training/legacy work: do not overwrite or blindly merge them.

## Initial change
- GX06 (partial): shared strict numeric evidence and current wearable provenance, not the full EvidenceSignal contract or graph.
- GX07/GX15 (partial): decision brief distinguishes unknown planning from confirmed zero.
- GX10 (partial): adherence windows preserve unknown booked counts and unknown activity counts.
- GX19 (partial): Progress Hub and decision brief share wearable eligibility logic.
- GX26 (partial): volume comparison copy describes the actual within-window chronological comparison, not a prior period.
- Regression tests added; execution and review pending. No DB migrations or new services.

## Certification
- Seven prior gates green at base SHA only; not valid evidence for new commit.
- M43 run 45709299367 / job 139539313119: authenticated log confirms M43_QA_INTERACTIVE_FIXTURE_BUDGET_RESERVED, phase environment. Runner reserves three fixtures before mutation, limit 150. Do not bypass or rerun without verified capacity; inspect existing QA ledger and use isolated authorized fixture strategy.
- M44 run 45731453075 passed historically; integral Hosted Auth/Vault/Edge remains not certified.
- No remote writes performed; no production promotion for this block.

## Remaining inventory
GX01–05: open verification / recovery / RLS / PDF. GX06–07, GX10, GX15, GX19, GX26: partial as above. GX08–09, GX11–14, GX16–18, GX20–25, GX27–48: not implemented or verified in this block yet; inspect existing capabilities first. Next: validate changes and consumers, expand EvidenceSignal with explicit period/source/sample/comparability, inspect PDF official model and IRI independent lifecycle, consolidate before final exact-SHA gates.

## Second commit
- GX09/GX30 (partial): exercise history now uses the canonical revision reconciler once per list; same-revision conflicts, non-completed/undated/future and explicitly skipped rows cannot generate exposures. Includes count of excluded conflicting exposures; no new persistence.
- GX10/GX08 (partial): constancy UI distinguishes unknown from confirmed absence of plan.
- Tests extended, not executed yet; review existing memory callers and full regression suite before PR/merge. GX09 is not fully certified and GX30 live UX not yet tested. 

## GX01 / GX03 read-only remote evidence, 25 November Chile
- PROD catalog 130/130 public ordinary/partitioned tables with RLS enabled; QA 129/129. No disabled public table with API grants found. This is configuration coverage only; grants/policy semantics and allow/deny tests remain pending.
- M43 authenticated failure verified: fixture budget reserved. SQL count versus v4 ledger on two synthetic owners: 169 and 150 current sessions; hard cap 150 and three-slot reserve preserved.
- QA-only v5 evidence: fixed cutoff 2026-11-26T00:57:00Z. 163 additional terminal run-marked sessions (133 and 30 by owner) passed same-owner canonical/legacy closed reconciliation, nonempty summary, canonical completion event, no appointment, no active lock, no foreign-client event. The legacy projection's remote/local timestamps and close operation ID are null in both the existing 773 retained rows and the new cohort; completion event and canonical/legacy matching—not a fabricated timestamp—establish retention evidence. V5 retains 936 total fingerprints. No DB row changed or deleted, no cap bypass. Actual M43 rerun remains pending until final consolidated certification. Counts after v5 are estimates until the authenticated bootstrap is run; do not claim M43 passed.
- Added v5 test and workflow triggers; no test run yet. One diagnostic SQL attempt had an operator-precedence error; corrected and evidence rechecked at fixed cutoff. 

## Fourth commit — canonical baseline and time scope
- GX09/GX26: strength evidence in recent Progress Hub now uses a 28-day boundary; report strength reads the full owner-reconciled collection with the exact civil window instead of a caller-provided subset. Coach preparation passes its own clock to history.
- GX11/GX14: one initial IRI selector for Coach preparation and report portfolio; confirmed status allowlist, actual measurement date, scope, pending/future/follow-up exclusion and highest-revision conflict handling. Earliest confirmed initial assessment replaces the previous Coach-most-recent selection. Report cardio coverage requires two valid positive HR values.
- GX19: Coach preparation now shares the wearable eligibility predicate and checks exact current-day row count; unknown or contradictory source does not produce averages. The existing wearable freshness definition is retained.
- Updated existing test expectation (Coach baseline must be earliest, as in official report), added regression cases. Full test/CI pending; no authenticated checkout available in this session. No DB changes.

## Fifth commit — shared observed-set and load truth
- GX06/GX09/GX14/GX26: new shared observed-set/explicit-kg contract reused by longitudinal progress, exercise memory, Coach periodization and post-session report. Rejects omitted sets, contradictory explicit loads, invalid numeric values and unsupported units. Reuses stable canonical JSON equality for execution and IRI revision checks.
- Actual completion chronology now applies to dashboard and Coach weekly-cycle execution counts, not just official reporting; future records and creation-only records cannot create performed sessions. IRI no longer increases evolution data-quality count. Empty or invalid well-being rows cannot unlock evidence summaries; pain and RPE have validated ranges.
- Fourth-commit pure-source directed verification: five checks passed using exact repository modules in V8 (not full Node suite or browser). Fifth-commit directed verification pending. No Supabase writes, dependencies or migrations.

## Sixth commit — directed verification follow-up
- Fifth-commit isolated execution: six pure-module checks passed (load/zero, canonical date conflicts, IRI duplicate ordering, report sports evidence, exercise memory, wearable coverage). Two additional checks passed with all 13 Progress Engine dependencies loaded (summary and longitudinal exclusions). One extra check was blocked by the V8 harness lacking the browser/Node structuredClone API; it is not a product failure or a passing test.
- Removed a residual legacy date prefilter from exercise history, plan execution and periodization so the strict completion-date contract alone decides inclusion, including summary-only canonical completion. Bounded longitudinal reps/RPE/RIR/duration and corrected the invalid-load fixture (an explicitly recorded numeric 200 kg is not invalid merely because reps are malformed).
- Full test suite, browser/device verification, CI and promotion remain pending. No Supabase writes or migrations.

## Seventh commit — Coach decision continuity and Admin numeric evidence
- Existing Action Outcome is reused; newest canonical owner/revision wins, equal-revision contradictions and unconfirmed states are excluded with explicit counts. Review due date follows Santiago civil calendar. Closed records remain in history, but only documented, dated outcomes enter the favourable-result denominator (not causation).
- Coach workspace orders open decisions by review date, includes due-today, exposes complete history in four-row pages, preserves same-revision in-memory input during refresh of existing mount, rejects stale close before sending and requires newer persisted close revision. Null improvement rate is no longer shown as 0%. Admin capacity uses shared strict numeric evidence. No new service/storage/network calls.
- Added regression scenarios and four-language static copy. Full DOM, role and CI tests pending. No DB changes.

## Eighth commit — review draft isolation and official report parity
- Directed Action Outcome checks at seventh commit: 9/9 passed (owner, revision, priority, civil day, evidence denominator, empty/invalid/future data). Actual DOM/browser not tested.
- Recovered drafts are limited to the same owner and matching revision; confirmed create only clears the exact acknowledged values in the current mount, not a newer edit. Added accessible 44px continuation control and metric note layout. Pending noncanonical Action Outcome status cannot count as a confirmed decision.
- Report approval reconciles latest revision and quarantines same-revision material differences instead of trusting array order. Existing report draft scope and backend approval remain unchanged.
- GX05: official Edge PDF activity-series validation matches preview (valid civil dates, nonoverlap, nonnegative integer, in-window, 13 rows maximum). Invalid inputs now fail before generating bytes, rather than converting to zero/truncating. Existing valid renderer layout, template version and issued artifacts are unchanged. Corrected synthetic PDF smoke fixture overlap. Edge source changed in branch only; requires exact-source QA/controlled deployment to change real issuance. No SQL/migrations/DB writes.

## Ninth commit — Client Ahora evidence and hierarchy
- GX08/GX19: existing Client daily context keeps its actual home hero as the single dominant action, without duplicating the hero destination in the secondary context. Uses shared Chile civil calendar and rejects same-day future check-ins/execution dates; canonical confirmed workout count takes priority over activity including completed appointments, with honest legacy label. No new route, network or storage.
- Each daily wearable metric carries its own known provider/channel labels; equal values appear once, conflicting values remain unavailable, and unknown source stays explicitly unidentified. No physical-watch inference. Existing wellness and activity remain separate.
- Eighth-commit directed checks passed 17/17 (including invalid-series rejection by the actual issuer function before PDF generation, report revision and privacy). Physical PDF rendering/visual QA and Edge deployment still pending.
- Added tests and i18n for Client context. CSS/browser validation pending. No database writes.

## Tenth commit — planning and measured weekly context
- GX25: existing periodization board separates elapsed/current/future weeks, exposes agreed integer weekly frequency without claiming adherence or prorating partial weeks, respects canonical civil dates and rejects conflicting cycle/appointment ownership. Cycle selector reconciles highest revision before status filtering so archived planning cannot resurrect; conflicting same revisions are excluded. Numeric prescription inputs reject coerced arrays/hex values. Shared alternative measurement compatibility helper prepared for next integration, not yet wired to live execution.
- Ninth-commit directed checks 12/12 passed (Client daily context); cumulative directed checks from prior turn 38/38. Added regression tests for cycle revisions and weekly semantics. Full browser/CI pending; no DB writes or migrations.

## Eleventh commit — live alternative prescription compatibility
- GX30: existing ranking uses shared measurement profile and known cardio sport compatibility; no unrelated exercise is labeled same pattern when pattern is unknown. Existing planned alternatives outside ranking remain visible to Coach in builder; incompatible historical choices are flagged and not directly reused in live workout. Coach can add a different exercise with its own objective; no automatic substitution. Guard checks actual catalog source/destination before mutating the execution, retaining existing completed/omitted sets. Added actionable error and translations.
- Tenth-commit directed checks 10/10 passed (cycle revision, valid/invalid metrics and same/cross-sport compatibility). DOM and real exercise substitution regression suite pending. No DB changes.

## Twelfth commit — local workout recovery identity
- GX30: singleton recovery snapshots are validated before activation; null/boolean/empty dates cannot become epoch timestamps; mismatched storage key/owner snapshots are neither activated nor removed during recovery/list/purge. Existing same-owner TTL and sync lifecycle remain in place; no change to retention duration or schema. Added regression scenarios. Kept legacy numeric snapshot acceptance pending full recovery-suite compatibility rather than risk rejecting previously valid local drafts.
- Eleventh-commit targeted checks 7/7 passed (actual execution substitution and cycle board using exact module source; plain JSON clone fallback and unused selector imports omitted in isolated harness). Full browser, Node and device certification remains pending. No DB changes.

## Thirteenth commit — Admin operational truth
- GX37: Admin operational triage reconciles task revisions before classification, excludes conflicting/unverified records with visible warning in home and operations, shares the exact queue with command center without duplicate recomputation; invalid calendar timestamps cannot fabricate overdue status. No new remote queries or privileges. Regression cases added; no DB changes.

## Fourteenth commit — adherence, retention and First28 evidence
- Appointment revisions are reconciled before applying time windows: rescheduled appointments cannot leave a stale commitment in the former period, and same-revision date conflicts are excluded. Retention cancellation factor uses the same reconciliation, not raw duplicates. Explicit client absence, coach absence and unresolved bookings remain distinct. Existing adherence lower-bound rate is retained; retention red is downgraded to human-review yellow when uncertain appointment evidence could explain it. Shared current wearable evidence reused.
- First28 uses actual canonical workout count where present, distinguishes legacy recorded activity, rejects future same-day enrollment and contradictory owner. Existing navigation-only flow retained.
- Prior recovery/Admin directed checks passed 8/8, total prior phase 25/25. New tests added; no DB writes, no migrations or additional remote requests.

## Fifteenth commit — native media lifecycle
- Existing native exercise player supports explicit 0.75×/0.5× slow technique review while retaining normal and faster playback. Tracks active video and pauses previous playback, detached videos and active playback on controller teardown; moved nodes are not stopped unnecessarily. No autoplay, preload, additional dependencies, backend requests or changes to media publication approval. Added directed lifecycle regression.
- Fourteenth commit directed domain checks 10/10 passed; browser and full suite remain pending.

## Sixteenth commit — frame-local reuse and canonical challenge metrics
- Coach Hoy shares owner-scoped progress/alerts between client compact/adaptive summaries, selected context and cockpit within the same synchronous render. Expediente reuses its progress and alerts; Progreso reuses longitudinal windows in adherence alerts. No global cache, no new request or persisted data.
- Existing Client planning challenge uses explicitly fulfilled booked commitments rather than total training activity. Unknown counts stay unknown. Challenge engine reuses longitudinal progress windows (three fewer summary computations per canonical context), does not convert missing adherence/device data to zero, uses confirmed workout counts where available. Existing group consent policy remains intact.
- Native media isolated controller suite passed 6/6 at fifteenth commit, including event lifecycle and slow playback. Full CI/browser still pending.

## Seventeenth commit — evidence reuse boundaries and adaptive history
- Preserved the established general sessions challenge contract (confirmed activity, including verified in-person attendance). Booked planning challenge remains strictly booked fulfillment. Device consent gate returns before expensive longitudinal aggregation. Dated reusable summary must match exact rolling clock/window when supplied, while legacy undated same-frame inputs remain supported.
- Latest post-session feedback uses actual completion rather than creation or update time. Adaptive exercise history reuses observed set/kg evidence and omits skipped rows, unit conflicts and unknown unit loads. No additional DB calls; no automatic prescription introduced.
- Added targeted regression cases. Native browser, full test suite and performance SLA are still unverified.

## Eighteenth commit — media viewer accessibility and lifecycle
- The existing native dialog viewer fences asynchronous opens by connected trigger/request generation. Route teardown invalidates pending opens. Native close and fallback close restore focus without stale close events clearing a reopened dialog. Image listeners precede source assignment, cached success/failure is reconciled, and error placeholders hide broken images correctly. No new network calls, dependencies or backend mutations.
- Added regression assertions; full native browser focus/keyboard validation remains pending.
- Seventeenth commit 10/10 isolated evidence/challenge/adaptive checks passed (upstream aggregate fixtures); actual route performance SLA not certified.

## Nineteenth commit — honest shared-device privacy inspection
- GX20/GX21/GX24/GX32: the existing explicit local account cleanup no longer reports absent clearOwner adapters as successful. Genuine void-returning completed methods retain compatibility. Invalid inventory responses trigger incomplete inspection warning, not a falsely verified empty device. Error metadata exposes stable codes rather than raw adapter messages. No change to the explicit destructive confirmation, owner scopes, server data or normal logout; regression scenarios added.

## Twentieth commit — canonical initial IRI revision before classification
- GX11/GX13/GX14: canonical initial IRI selector reconciles all same-owner revisions before classification, preventing a later follow-up revision from resurrecting an earlier initial diagnosis. Explicit unconfirmed records and malformed revision values cannot qualify. Longitudinal numeric comparisons reuse strict evidence parsing. Retains separate diagnosis/follow-up and the existing Coach provisional timeline (not certified as confirmed evidence).
- Nineteenth commit shared-device privacy directed checks 5/5 passed (empty, malformed, missing adapters, partial failure, full available cleanup). No actual device data deleted during verification.


## Authoritative GX coverage matrix — after twentieth implementation commit
Source: original user-provided GLOBAL EXCELLENCE & INNOVATION 360 mandate, section 32 (GX01–GX48). This matrix supersedes the earlier provisional GX numbering in the chronological log: periodization is GX27/GX28 (not GX25); substitutions GX29; execution recovery GX18; Admin operations GX23/GX43 (not GX37). Do not interpret an implemented source change or isolated check as acceptance, a merged PR, or production deployment.

Status vocabulary: **Enhanced** = implementation in this branch, acceptance pending; **Existing/review** = existing foundation retained, no new end-to-end acceptance; **Open** = no completed implementation in this block; **Blocked** = concrete dependency or missing evidence. Baseline is Canary 50ba022115091478a86900be6f0b0e4c816044ef. No production change, database migration, added recurring service, dependency or intentional extra backend request in this block. All changed capabilities require full exact-head CI, role/browser and appropriate device gates; remote evidence is separately identified below. Existing workflows are reused, not weakened. Each row links the prior foundation, changed work/evidence and remaining acceptance.

| ID | Original opportunity | Branch status | Reused foundation / change and evidence | Remaining acceptance / dependency |
|---|---|---|---|---|
| GX01 | Close M43 real | Blocked | QA v4 ledger capacity failure; v5 adds 163 verified historical synthetic fingerprints, total 936; read-only inspection, no deletion or quota increase | Real authenticated Coach–Client–Coach gate, reserved fixture capacity and actual ACK |
| GX02 | Auth/Vault/Edge integral recovery | Blocked | Existing M44 offsite run 45731453075 historical success; recovery docs preserved | Isolated restore including Hosted Auth/Vault/Edge and independently restorable evidence; do not substitute logical backup |
| GX03 | RLS/grants audit | Existing/review | Read-only catalog: PROD 130/130 and QA 129/129 public tables RLS enabled | Allow/deny and grant semantics for actual roles/operations at candidate SHA |
| GX04 | SHA attestation | Existing/review | Existing version manifest, exact-head release gates; historical PROD promotion run 45732501319 | Confirm actual served Canary/PROD source SHA after protected releases |
| GX05 | Preview–PDF parity | Enhanced | Existing preview/official issuer activity series contract aligned; 17/17 directed report/draft cases in prior phase include pre-generation reject | Physical PDF appearance, semantics across all report types, official Edge exact-source rollout, QA smoke; no claim deployed |
| GX06 | Evidence Signal 360 | Enhanced | Shared strict numbers, observed sets/kg, stable equality, wearable provenance; consumed by existing engines | Comprehensive field-level provenance/sample/comparability review; full regressions |
| GX07 | Coach Priority Cockpit | Enhanced | Existing brief, outcome queue, due dates, conflict warnings; frame-local reuse of alerts | Native Coach flows and priority ordering for mixed safety/operational issues |
| GX08 | Cliente Ahora | Enhanced | Daily context single primary destination, true workout count, First28 and per-metric provenance | Mobile/tablet/desktop hierarchy and guided-flow acceptance |
| GX09 | Exercise longitudinal | Enhanced | Canonical execution reconciliation, actual date, observed units/sets, recent strength window | Variant/protocol comparability and full history/runtime verification |
| GX10 | Canonical adherence | Enhanced | Booked fulfilment separate from activity; rescheduling reconciliation; explicit missed/Coach absent/unresolved counts, corrected planning challenge | Full legacy/data-integrity suite, explicit UI semantics and real date flow |
| GX11 | IRI to professional action | Enhanced | Existing baseline selector for report/Coach prep; newest revision before classification, earliest confirmed baseline | Consistency with legacy professional provisional chronology and validated goal workflow |
| GX12 | Independent IRI | Existing/review | Existing service lifecycle retained, no new client activation model | Authenticated IRI-only enrollment/report with no training directory contamination |
| GX13 | Protocolized reassessment | Enhanced | Existing IRI comparison primitives use strict numeric evidence and protocol guards; follow-up cannot replace baseline | Real reassessment lifecycle and comparisons; do not enable unverified publication |
| GX14 | Evidence-first reports | Enhanced | Confirmed dated workouts, observed kg/sets, bounded evidence and approval revisions | Complete report suite and official preview/issuer parity |
| GX15 | Deterministic copilot | Enhanced | Existing brief, preparation, action outcome; review queue and safe history | End-to-end Coach decisions, no automatic prescriptions |
| GX16 | Pain and safety | Enhanced | Bounded observed values, actual post-session completion, skipped rows excluded | Confirm signal priority and human review in real session flow |
| GX17 | Reusable planning | Existing/review | Existing template/reuse and planning drafts retained; no separate template engine | Regression and real copy/edit/publish lifecycle; check isolation of original template |
| GX18 | Execution recovery | Enhanced | Snapshot validation and owner/key fences; tests 8/8 recovery/Admin prior phase | Offline pause/return, browser crash and real sync/idempotence across devices |
| GX19 | Wearable provenance | Enhanced | Shared eligibility and individual metric provider; no inferred watch or multi-provider averaging in daily context | Device-specific consent/revocation, longitudinal comparability and physical validation |
| GX20 | Consent center | Enhanced | Existing device consent gates; consent before heavy challenge aggregation, incomplete local cleanup warning | Actual permission history, revocation, health data lifecycle; no new consent store |
| GX21 | Data rights | Enhanced (local only) | Existing shared-device explicit cleanup now fail-closed; separate open #1319 preserved | Server export/correction/selective erasure authorized workflow, recovery and legal/business decision; no deletion executed |
| GX22 | Own multimedia | Enhanced | Existing approved manifests, lazy image/video/both, slow playback, bounded native lifecycle, viewer | Approved assets and real device playback; no invented video production |
| GX23 | Admin Health Center | Enhanced | Operational triage + shared command center, latest task revisions, explicit conflicts | Authenticated admin permissions, dashboard and operations QA |
| GX24 | Privacy-first telemetry | Enhanced (local) | Media observability remains memory-only; local cleanup failure codes sanitized | Full telemetry/diagnostic redaction and retention audit, no new collection |
| GX25 | Supabase Free budgets | Enhanced (QA preparation) | Preserved 150 fixture cap and v5 ledger, no new queries; frame-local reuse avoids repeated calculations | Actual budget/wire-meter evidence and billing; no claim measured savings |
| GX26 | Safe period comparison | Enhanced | Actual period boundaries, strict comparable sets and honest within-window labels | Independent period and variant comparability across report/longitudinal surfaces |
| GX27 | Measurable objectives | Enhanced | Existing cycle frequency/periodization, future versus elapsed weeks and partial-week meaning | Structured goal review and authenticated Coach/Client planning agreement |
| GX28 | Calendar conflicts | Enhanced | Current cycle revisions and appointment time-window reconciliation | Real reschedule/overlap/appointment CAS tests, Chile civil date boundary coverage |
| GX29 | Intelligent substitutions | Enhanced | Existing rank with measurement kind and same known cardio sport guard; no incompatible prescription inheritance | Real Coach/client substitution, constraints and all catalog profiles |
| GX30 | History during session | Enhanced | Existing memory and adaptive history share observed sets and kg; strict dates | Actual live touch workflow and variant comparability |
| GX31 | Systematic accessibility | Enhanced | Existing media viewer fixes pending request, focus, fallback and hidden image; simulated DOM 5/5 | Existing independent accessibility gate plus real keyboard/touch/focus across routes |
| GX32 | PWA installation/recovery | Enhanced (recovery) | Local checkpoint and privacy cleanup guards | Real PWA installation, upgrade, background/reconnect and safe-area device gate |
| GX33 | Canonical DTOs | Enhanced (partial) | Shared evidence and reconciliation helpers at selected boundaries | Full alias/transport DTO inventory; no schema overhaul |
| GX34 | Consolidate legacy gates | Existing/review | Existing required workflows kept; one consolidated branch, no intermediate CI | Determine redundant gates from actual coverage before modifying any protection |
| GX35 | Index/RLS performance | Existing/review | No speculative indexes or DB changes; owner-scoped local reuse | Read-only plans, measurable query cost, RLS performance; separate risk approval if needed |
| GX36 | Multimedia budget | Enhanced | Native preload none, stop obsolete playback, no extra assets or player dependency | Actual egress/transfer measurements and quality checks on devices |
| GX37 | Webhooks vs polling | Open | No polling added; existing operations/communication system preserved | Inspect current provider delivery and retry semantics; do not introduce unneeded service |
| GX38 | HealthKit/Health Connect | Existing/review | Existing Connected360 retained, shared evidence guards | Physical Android/iOS acceptance and consent lifecycle; no emulator claim |
| GX39 | Selective B2B integrations | Open | No new providers or costs | Confirm demand, lawful access, workflow and Free-compatible economics |
| GX40 | Contextual communication | Existing/review | Existing communication module retained | Review actual role-scoped session/report/check-in linkage and delivery |
| GX41 | Renewals/referrals | Enhanced (retention only) | Existing CRM/retention evidence; latest cancellation and unresolved booking safeguards | Verified renewal lifecycle and privacy-safe referrals; no automatic commercial messaging |
| GX42 | Web to IRI to service | Existing/review | Existing onboarding/First28; current workout evidence | Real conversion/identity transition without duplicates; website changes separately scoped |
| GX43 | Readable audit trail | Enhanced (operations) | Existing Admin tasks and audit timeline preserved; revision reconciliation and visible conflicts | Actual audit event identity/result/role boundaries; audit event timeline not fully reworked |
| GX44 | Minimum business intelligence | Enhanced (partial) | Existing capacity/retention/activation indicators; strict counts | Aggregated business denominators and authorized role reporting |
| GX45 | Captions and text guidance | Enhanced | Native captions/guidance retained, slow playback and accessible visual fallback | Caption content equivalence and QA of each approved video; no synthetic proof |
| GX46 | Year in IBERFIT | Open | Existing longitudinal evidence foundation, no new annual experience in this block yet | Meaningful verified milestones, privacy and mobile performance |
| GX47 | Controlled AI summary | Open / research | Deterministic human-review brief retained; no external inference, new API or costs | Validate private optional experimental workflow and economic model before activation |
| GX48 | Movement analysis | Open / research | Human-approved media retained; no clinical scoring introduced | Defined protocol, consent, representative validation and physical biomechanics evidence |

### Current phase verification
- Viewer exact functions exercised with simulated DOM/deferred stylesheet: 5/5 (latest open, close/focus and cleanup, cached error, cached success, detached trigger). Native-browser check still required.
- Shared-device privacy: 5/5 directed module checks, simulated adapters only.
- IRI revision/classification and numeric comparison: 7/7 directed module checks, exact source.
- 17/17 directed checks for this phase. These are isolated source/DOM simulations, not the full Node/Playwright test suite. CI/PR certification has not yet begun. The source Edge PDF renderer remains a distinct controlled deployment dependency.

## Twenty-second commit — GX05 official Signature report readability
- Reused preview's public report/source vocabulary in server renderer, corrected graph dates to DD/MM and expanded interval table to complete ISO dates, added represented session total, reserved chart clearance below caption and wrapped long evidence headings. Source snapshot, fingerprint, template family, publication policy and private Coach note exclusion remain unchanged.
- Eight directed renderer checks passed in V8 with synthetic PDF document/font drawing adapters; no physical PDF bytes or real font metrics certified. Exact-source CI, official issuer QA, native PDF visual review and controlled rollout remain mandatory. No database or Edge deployment performed.

## Twenty-third commit — GX09/GX26 recorded work versus performance
- Volume retains explicitly measured zero, distinguishes partial records from complete comparable sessions, and reports the actual chronological sample sizes and means. A zero reference cannot produce a percentage; equal boundary timestamps cannot establish chronological change. Existing descriptive recorded-volume mean remains available, with neutral status independent of direction (no automatically favourable or adverse volume change). The official report portfolio consumes the same comparison evidence and discloses the sample and its limitations. A single exercise exposure or identical endpoint dates cannot create a flat trend.
- Nine directed checks passed in isolated V8 execution of actual comparison functions; full Node/DOM and report regression certification remains pending. No new queries, schema, storage or dependencies. No production or Edge rollout.

## Twenty-fourth commit — GX40/GX41/GX42 communication, commercial calendar and activation
- Existing Client/Coach private composer gains report-review draft assists; no automatic send, report access, health data attachment or new route. Repeated taps no longer duplicate identical suggested text; typed content stays intact.
- Renewal deadlines use Santiago calendar dates, retain the existing ISO transport field and expose civil date for the commercial portfolio. An explicitly overdue status with future date remains a human-review flag but no fabricated elapsed time. First28 rejects dated progress from a different rolling window while retaining legacy undated same-frame compatibility.
- 10/10 isolated checks passed (actual renewal, First28 and draft functions; training-service/profile adapters simulated). Full Node/DOM, communication authorization, renewal edit and browser acceptance remain pending. No new database operations, schema or dependency.

## Twenty-fifth commit — GX46 Spanish annual report naming and reproducible sample
- Visible report title and label use “Tu año en IBERFIT” in report portfolio, browser A4 preview and official PDF renderer. Internal type remains year-in-iberfit. No change to stored records or issuance privileges.
- Added isolated synthetic annual report generation script using actual portfolio, real PDF renderer and original fonts/logo; targeted workflow uploads PDF/manifest without hosted data or Supabase access. Source branch only; no certification of production. Actual job and visual QA pending.

## Twenty-sixth commit — preserve PDF producer during verification
- First synthetic annual sample run 45745266546 generated bytes and then failed the producer/page/fingerprint composite verification. The exact same default PDFDocument.load call existed in official orphan-replay verification; explicitly disable pdf-lib's in-memory metadata rewriting, retain all original subject/producer checks, and add regression coverage. The annual cover displays the approved Spanish title in the existing cover geometry. No backend deployment. Actual synthetic rerun and visual proof pending.

## Twenty-seventh commit — Signature reporting redesign, first implementation
- Replaced full-page ornamental evolution cover with a compact executive header and confirmed numeric highlights, reduced chart height and fit interval details in two columns; all approved evidence remains visible in measured keep-together rows. All five evolution types share the new layout; browser preview receives the same fact highlights and compact typography. Removed repeated raw metrics from the automatically composed interpretation; preserved explicit limitations and recommendations. Existing IRI generator and reassessment eligibility remain separate, not yet redesigned.
- V3 changes the rendering template, not the evidence model or stored report. V2 remains accepted on orphan replay with original fingerprint. Changed WOFF2 embedding to fontkit subset output, to be verified by physical render and text extraction. Synthetic annual workflow will regenerate the exact report. No production rollout, schema, or database access.

## Twenty-eighth commit — Signature V3 comparability and report family
- Added comparable volume visual with both group means and sample sizes in official evolution PDF and browser preview; individual wellbeing dimensions shown only when recorded (no composite score). Tightened missing-number interpretation and page contrast in the separate IRI renderer and HTML. IRI functional and normative contracts remain separate; only selective changes, not full IRI redesign.
- Synthetic workflow now emits all five evolution formats from actual portfolio and renderer, captures raster and text evidence, and checks the annual title/count. Await actual run; no production deployment or new database access. Full browser layout, IRI synthetic rendering and exact CI still pending.

## Signature static typeface proof — 2026-11-25
- WOFF2 fontkit subsetting failed in actual CI with TTFSubset Index out of range. Generated static 400/700 TTF instances of the existing Inter and Source Serif 4 variable brand faces using pinned fonttools 4.56.0 / brotli 1.1.0; four Git blobs checked against exact runner-computed Git object hashes. No new runtime package. Official emitter now fetches these assets from the same first-party origin; deploy assets before enabling V3.
- Actual synthetic workflow 45746211510 rendered five real PDFs, passed raster and text extraction checks: post-session 2 pages, weekly 2, monthly 3, quarterly 3, annual 3. Annual title and 104 sessions preserved. This is synthetic proof, not hosted authorization or production certification. Follow-up browser and full CI gates remain.

## Elite 360 — dated trends and continuity milestones (first increment)
- Period evidence reuses canonical exercise volume comparison and recorded wellbeing. Daily means are bounded to ten rank-sampled observed dates (endpoints retained), with exact represented/available counts; missing values never become zero and large gaps break the visual connection. Series are carried in the existing signed evidence label/text/source/quality contract, avoiding schema changes. Shared browser/Edge graph geometry and parser are byte-identical and have a parity regression test. Weekly/monthly/quarterly/annual portfolios add confirmed seven-day continuity milestones and selected eligible trends within the existing twelve-row cap. No automatic interpretation of changes as progress. Physical sample and focused Node regression pending. IRI, body measurements, sport-specific comparisons and goals remain pending.
