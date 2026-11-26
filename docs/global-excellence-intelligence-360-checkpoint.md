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
