# RC18 requirement traceability

| Requirement | Implementation | Automated evidence | External evidence |
|---|---|---|---|
| Role isolation | `src/m26/shell/role-policy.js`, route guards | shell/core tests | Authenticated Coach/Client gate |
| Command idempotency | Command Bus and receipts | resilience tests | Supabase receipt inspection |
| Scientific IRI | norms engine and workflow | science tests | Clinical-method review |
| Catalog-only exercises | exercise catalog and builder | product/execution tests | Content review |
| Coach approval of IA | adaptive/session engine | adaptive tests | QA workflow |
| Offline recovery | offline storage/runtime | offline/resilience tests | Physical network interruption |
| Private notes online-only | engagement service | engagement/adaptive tests | Authenticated role test |
| Accessible responsive UI | Design system/renderers | visual Chromium evidence | Physical-device checklist |
| Rollback safety | protected artifacts/runbooks | recovery gates | Canary rehearsal |
