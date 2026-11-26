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
