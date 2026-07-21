# RC18 remote gate matrix

| Gate | Required evidence | Pass condition | Current status |
|---|---|---|---|
| Supabase project identity | URL and project reference | Exact `pjhmrhejsoofmouedavw` | Pending connector/runtime |
| RPC presence | Metadata query | Three v26 RPCs with exact signatures | Pending |
| Command registry | Registry export | Exact definitions, no missing or unexpected enabled commands | Pending |
| RLS | Metadata and role tests | All protected tables enabled; no cross-client access | Pending |
| Coach QA | Authenticated harness | Correct role and assigned-client visibility | Pending |
| Client QA | Authenticated harness | Own client only; no Coach routes | Pending |
| Physical devices | Signed checklist | iPhone, Android, tablet and desktop pass | Pending |
| Cloudflare canary | Deployment record | QA-only hostname and observed stability | Pending |
| Rollback | Rehearsal record | Prior version restored inside target time | Pending |
