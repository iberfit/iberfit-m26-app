# RC74.4 Phase A hardening

This phase installs the offline rebase capability, QA/production runtime isolation, strict command-registry semantics, nested execution-revision normalization, and source-control convergence for the already-applied QA migrations H/I/J/L/M/N/O.

`EJECUCION_GUARDAR_PROGRESO` intentionally remains `conflictSensitive=false` in Phase A. The Phase B migration is staged under `recovery/rc74-4-phase-b/`, not `supabase/migrations/`, so deployment automation cannot activate it early.

Before Phase B: deploy this code to canary, pass local + remote read-only gates, verify the QA environment guard, verify there are zero active execution locks/executions, and verify there are zero `command_operation_identities_v26` rows for `EJECUCION_GUARDAR_PROGRESO` created under the old policy.
