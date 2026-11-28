import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const load=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const install=load('supabase/release-procedures/gx_reassessment_draft_creation_v1.sql');
const rollback=load('supabase/release-procedures/gx_reassessment_draft_creation_v1.rollback.sql');
const originalMigration=load('supabase/migrations/20261015141000_m44_report_canonical_draft_bootstrap_v1.sql');
const original="CREATE OR REPLACE FUNCTION public.iberfit_m44_create_report_draft_impl_v1(p_client_id uuid, p_report_id uuid, p_draft jsonb)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''\nAS $function$\n"+originalMigration.split('as $function$\n')[1].split('$function$;')[0]+'$function$\n';
const hash=s=>createHash('md5').update(s).digest('hex');
const transform=(body,sql)=>{const edits=[...sql.matchAll(/a:=\$old\$([\s\S]*?)\$old\$;\s*b:=\$new\$([\s\S]*?)\$new\$;/gu)];assert.equal(edits.length,4);for(const [,a,b] of edits){assert.equal(body.split(a).length,2);body=body.replace(a,b);}return body;};
const candidate=transform(original,install);
test('verified LIVE baseline, exact transformed function, exact reverse restoration',()=>{
 assert.equal(hash(original),'517816721e7d19851e34745ed0e83c55');
 assert.equal(hash(candidate),'609cdb73e08cb26aa1c57c340237abb0');
 assert.equal(transform(candidate,rollback),original);
});
test('only reassessment bypasses training requirements; evidence and coach scope mandatory',()=>{
 const block=candidate.slice(candidate.indexOf("if v_type='reassessment' then"),candidate.indexOf("elsif v_type='post-session' then"));
 for(const pattern of [ /v_role is distinct from 'coach'/u,/auth\.jwt\(\)->>'role' is distinct from 'authenticated'/u,/v_source_type is distinct from 'professional_followup'/u,/p_draft->'sourceId' is distinct from 'null'::jsonb/u,/p_draft->'assessmentId' is distinct from 'null'::jsonb/u,/p_draft->'activitySeries' is distinct from '\[\]'::jsonb/u,/private\.iberfit_gx_followup_can_coach_v1\(p_client_id\) is distinct from true/u,/private\.iberfit_gx_reassessment_body_current_v1\(p_client_id,p_draft\) is distinct from true/u])assert.match(block,pattern);
 assert.match(candidate,/if v_type<>'reassessment' then\n  -- Completion[\s\S]*M44_REPORT_CONFIRMED_TRAINING_REQUIRED[\s\S]*M44_REPORT_ACTIVITY_SERIES_INCOMPLETE[\s\S]*end if; -- Training-only/u);
});
test('preserves existing private draft, canonical event, retry and revision boundaries',()=>{
 const anchor="  perform pg_advisory_xact_lock(hashtextextended('m44:report:'";
 assert.equal(candidate.slice(candidate.indexOf(anchor)),original.slice(original.indexOf(anchor)));
 assert.match(candidate,/'status','borrador','revision',1,'visibleToClient',false/u);
});
test('install requires evidence guards and both transformations preserve ACL, owner, exact hashes and transactions',()=>{
 for(const name of ['gx_reassessment_type_consistency','gx326_report_evidence_guard','gx326_issuance_evidence_guard','private.iberfit_gx_reassessment_body_current_v1'])assert.ok(install.includes(name));
 for(const sql of [install,rollback]){assert.match(sql,/proacl IS NOT DISTINCT FROM original_acl AND proowner=original_owner/u);assert.ok(sql.includes('{postgres=X/postgres,service_role=X/postgres}'));assert.match(sql,/has_function_privilege\(r.role_name,fn,'EXECUTE'\)/u);assert.match(sql,/IF md5\(body\) IS DISTINCT FROM/u);assert.match(sql,/COMMIT;\s*$/u);assert.doesNotMatch(sql,/\b(?:GRANT|DROP TABLE|DELETE FROM|TRUNCATE)\b/u);}
});
