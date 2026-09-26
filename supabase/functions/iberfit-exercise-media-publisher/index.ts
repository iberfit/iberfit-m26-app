import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const PROD_REF = "pjhmrhejsoofmouedavw";
const BUCKET = "iberfit-exercise-media";
const AUDIENCE = "iberfit-exercise-media-prod";
const EXPECTED_REPOSITORY = "iberfit/iberfit-m26-app";
const EXPECTED_REPOSITORY_ID = "1306074388";
const EXPECTED_REF = "refs/heads/canary/rc74-4";
const EXPECTED_WORKFLOW_REF =
  "iberfit/iberfit-m26-app/.github/workflows/exercise-media-publish-approved.yml@refs/heads/canary/rc74-4";
const MAX_BYTES = 5_000_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.(?:webp|png|jpe?g)$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  if (!value.startsWith("Bearer ")) fail("IBERFIT_PUBLISHER_OIDC_REQUIRED", 401);
  return value.slice(7).trim();
}
async function authenticate(req: Request) {
  const token = bearer(req);
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: "https://token.actions.githubusercontent.com",
    audience: AUDIENCE,
  });
  if (payload.repository !== EXPECTED_REPOSITORY || String(payload.repository_id || "") !== EXPECTED_REPOSITORY_ID) {
    fail("IBERFIT_PUBLISHER_REPOSITORY_FORBIDDEN", 403);
  }
  if (payload.ref !== EXPECTED_REF) fail("IBERFIT_PUBLISHER_REF_FORBIDDEN", 403);
  if (payload.workflow_ref !== EXPECTED_WORKFLOW_REF) fail("IBERFIT_PUBLISHER_WORKFLOW_FORBIDDEN", 403);
  if (!["workflow_dispatch", "workflow_call", "schedule", "push"].includes(String(payload.event_name || ""))) {
    fail("IBERFIT_PUBLISHER_EVENT_FORBIDDEN", 403);
  }
  if (payload.runner_environment && payload.runner_environment !== "github-hosted") {
    fail("IBERFIT_PUBLISHER_RUNNER_FORBIDDEN", 403);
  }
  return payload;
}
function parseItem(raw: string) {
  let item: any;
  try { item = JSON.parse(raw); } catch { fail("IBERFIT_PUBLISHER_ITEM_JSON_INVALID"); }
  const id = String(item?.exercise_id || "").trim();
  const media = item?.media;
  const movement = media?.movement;
  const approval = item?.approval || {};
  if (!SAFE_ID.test(id)) fail("IBERFIT_PUBLISHER_EXERCISE_ID_INVALID");
  if (item?.human_approved !== true || item?.publishable !== true) fail("IBERFIT_PUBLISHER_HUMAN_APPROVAL_REQUIRED");
  if (approval?.method !== "human_owner_approval") fail("IBERFIT_PUBLISHER_APPROVAL_METHOD_INVALID");
  const scopes = Array.isArray(approval?.scopes) ? approval.scopes.map(String) : [];
  if (!scopes.includes("visual") || !scopes.includes("biomechanics")) fail("IBERFIT_PUBLISHER_APPROVAL_SCOPE_INVALID");
  if (String(approval?.automatic_qa || "").toLowerCase() === "failed") fail("IBERFIT_PUBLISHER_AUTOMATIC_QA_FAILED");
  if (!media || Array.isArray(media) || typeof media !== "object") fail("IBERFIT_PUBLISHER_MEDIA_INVALID");
  if (media.schema !== "iberfit.exercise.visual.v1" ||
      media.style !== "iberfit-premium-movement-pair-v1" ||
      media.bucket !== BUCKET ||
      media.published !== true ||
      media?.qa?.biomechanics !== "approved" ||
      media?.qa?.visual !== "approved" ||
      (media.clientVisible !== true && media.coachVisible !== true)) {
    fail("IBERFIT_PUBLISHER_MEDIA_NOT_APPROVED");
  }
  const path = String(movement?.path || "");
  const parts = path.split("/");
  if (parts.length !== 2 || parts[0] !== id || !SAFE_FILE.test(parts[1]) || path.includes("..")) fail("IBERFIT_PUBLISHER_STORAGE_PATH_INVALID");
  const mime = String(movement?.mime || "");
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) fail("IBERFIT_PUBLISHER_MIME_INVALID");
  const sha = String(movement?.sha256 || "").toLowerCase();
  if (!SHA256.test(sha)) fail("IBERFIT_PUBLISHER_SHA_INVALID");
  const width = Number(movement?.width);
  const height = Number(movement?.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 5000 || height > 5000) {
    fail("IBERFIT_PUBLISHER_DIMENSIONS_INVALID");
  }
  if (!parts[1].toLowerCase().includes(sha.slice(0, 12))) fail("IBERFIT_PUBLISHER_IMMUTABLE_PATH_REQUIRED");
  return { item, id, media, movement, path, mime, sha };
}
async function digestHex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const claims = await authenticate(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl.includes(PROD_REF) || serviceRole.length < 20) fail("IBERFIT_PUBLISHER_PROD_ENV_INVALID", 500);

    const form = await req.formData();
    const itemRaw = String(form.get("item") || "");
    const file = form.get("file");
    if (!(file instanceof File)) fail("IBERFIT_PUBLISHER_FILE_REQUIRED");
    const parsed = parseItem(itemRaw);
    if (file.size < 100 || file.size > MAX_BYTES) fail("IBERFIT_PUBLISHER_FILE_SIZE_INVALID");
    if (file.type !== parsed.mime) fail("IBERFIT_PUBLISHER_FILE_MIME_MISMATCH");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const actualSha = await digestHex(bytes);
    if (actualSha !== parsed.sha) fail("IBERFIT_PUBLISHER_FILE_SHA_MISMATCH");

    const db = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-client-info": "iberfit-exercise-media-publisher/1" } },
    });

    const [folder, filename] = parsed.path.split("/");
    const listed = await db.storage.from(BUCKET).list(folder, { limit: 100, search: filename, sortBy: { column: "name", order: "asc" } });
    if (listed.error) fail(`IBERFIT_PUBLISHER_STORAGE_LIST_FAILED:${listed.error.message}`, 502);
    const alreadyExists = (listed.data || []).some((x: any) => x.name === filename);
    let newlyUploaded = false;

    if (alreadyExists) {
      const existing = await db.storage.from(BUCKET).download(parsed.path);
      if (existing.error || !existing.data) fail("IBERFIT_PUBLISHER_EXISTING_OBJECT_READ_FAILED", 502);
      const existingSha = await digestHex(new Uint8Array(await existing.data.arrayBuffer()));
      if (existingSha !== parsed.sha) fail("IBERFIT_PUBLISHER_EXISTING_OBJECT_CONFLICT", 409);
    } else {
      const uploaded = await db.storage.from(BUCKET).upload(parsed.path, bytes, { cacheControl: "31536000", contentType: parsed.mime, upsert: false });
      if (uploaded.error) fail(`IBERFIT_PUBLISHER_UPLOAD_FAILED:${uploaded.error.message}`, 502);
      newlyUploaded = true;
    }

    const verify = await db.storage.from(BUCKET).download(parsed.path);
    if (verify.error || !verify.data) {
      if (newlyUploaded) await db.storage.from(BUCKET).remove([parsed.path]);
      fail("IBERFIT_PUBLISHER_UPLOAD_VERIFY_READ_FAILED", 502);
    }
    const storedSha = await digestHex(new Uint8Array(await verify.data.arrayBuffer()));
    if (storedSha !== parsed.sha) {
      if (newlyUploaded) await db.storage.from(BUCKET).remove([parsed.path]);
      fail("IBERFIT_PUBLISHER_UPLOAD_VERIFY_SHA_FAILED", 502);
    }

    const finalized = await db.rpc("iberfit_finalize_exercise_media_system_v1", {
      p_exercise_id: parsed.id,
      p_manifest: parsed.media,
    });
    if (finalized.error || finalized.data?.ok !== true || finalized.data?.mediaStatus !== "aprobado") {
      if (newlyUploaded) await db.storage.from(BUCKET).remove([parsed.path]);
      fail(`IBERFIT_PUBLISHER_FINALIZE_FAILED:${finalized.error?.message || "invalid_response"}`, 502);
    }

    const publicUrl = db.storage.from(BUCKET).getPublicUrl(parsed.path).data.publicUrl;
    return json({
      ok: true,
      exercise_id: parsed.id,
      path: parsed.path,
      sha256: parsed.sha,
      bytes: bytes.byteLength,
      public_url: publicUrl,
      already_existed: alreadyExists,
      finalization: finalized.data,
      run_id: String(claims.run_id || ""),
    });
  } catch (error: any) {
    const status = Number(error?.status) || (
      String(error?.code || "").startsWith("ERR_JWT") || /JWT|signature|issuer|audience/i.test(String(error?.message || "")) ? 401 : 400
    );
    return json({ ok: false, error: String(error?.message || error || "UNKNOWN") }, status);
  }
});
