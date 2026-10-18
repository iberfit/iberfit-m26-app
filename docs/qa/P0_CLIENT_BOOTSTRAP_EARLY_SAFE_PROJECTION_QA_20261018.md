# P0 bootstrap early safe projection — evidence 2026-10-18

## Follow-up failure

In Ready PR #1006, QA Real Write gate #39171623247 failed only the M43 authenticated Client tablet test. The archived Playwright trace showed PostgREST `iberfit_bootstrap_v26` HTTP 500 after 8,777 ms; QA PostgreSQL logged SQLSTATE `57014` at 22:24:12 UTC under the original 8-second timeout. The session remained in protected recovery (“Continuar en IBERFIT”). This was not a layout selector or MFA bypass failure. All other QA write jobs passed.

## Cost and remediation

The Client QA bootstrap built an intermediate unredacted payload of 4,646,464 bytes before the existing M43 output privacy projection, while the final Client response contained 1,188,288 bytes. Of the intermediate bytes, sessionExecutions used 1,367,986 bytes versus 12,944 final, m26Entities 2,002,365 versus 460,753 final, sessions 248,223 versus 13,112 final, and reports 318,112 versus 5 final.

The proposed Stage 4 uses **the existing M43 safe projections** inside `public.iberfit_bootstrap_v26_rc29()` for **Client only** while aggregating sessions, session executions, and planning/session/session_execution entity bodies. Later M43 projection remains active, not removed or weakened. Safe projectors were idempotent for the 312 relevant canonical entities in QA. No RLS, grants, Auth, timeouts, or table writes.

## QA proof (transaction/ROLLBACK)

- QA baseline function MD5: `8896151785169af347449df0c5199709`.
- QA Stage 4 candidate MD5: `ce0cbff2a99e28bff593132a350de595`.
- Intermediate pre-v65e payload decreased from 4,646,464 to 1,514,852 bytes; final Client output unchanged (exact JSON equality).
- Four-role parity: Client A, Client B, Coach, Admin all exact JSON match. Paired full bootstrap example: Client A 1,106.0 → 644.4 ms, Client B 51.7 → 51.1 ms. Coach/Admin underlying rc29 also exact JSON match.

## PROD-compatible proof (transaction/ROLLBACK on QA fixture)

The real PROD rc29 source MD5 is `5c565986e5946e768cd84eb0398f76cb` and Stage 3 dedupe would produce `e62108e529544f3987e1be3f5ba1a2e2`. Stage 4 must apply **only after Stage 3** and produce `6ca1d901bb26ceedccfb7dc15945451d`.

Running the exact PROD-style Stage 3/4 definitions in a QA transaction: all four roles matched exact JSON. Client A 1,418.7 → 825.9 ms; Client B 56.7 → 54.4 ms; Admin and Coach remained identical. No QA-private publication-scope filters have been copied into the PROD migration.

## Gates

The previous Client Device Experience #39169772053 attempt 2 is SUCCESS after Stage 3. Stage 4 must repeat authenticated QA/Device gates and demonstrate no new PostgreSQL `57014` before merge and protected backend promotion. PROD remains untouched.
