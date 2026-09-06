#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const BATCH_SCHEMA = "iberfit.exercise.media.approved-batch.v1";
const PROD_ORIGIN = "https://pjhmrhejsoofmouedavw.supabase.co";
const BROKER_URL = `${PROD_ORIGIN}/functions/v1/iberfit-exercise-media-publisher`;
const BUCKET = "iberfit-exercise-media";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const SAFE_REL = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,499}$/u;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.(?:webp|png|jpe?g)$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const MAX_BATCH = 25;
const MAX_BYTES = 5_000_000;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}
function within(root, file) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, file);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error("IBERFIT_APPROVED_MEDIA_LOCAL_PATH_ESCAPE");
  }
  return resolved;
}
function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("IBERFIT_APPROVED_MEDIA_JPEG_INVALID");
  let i = 2;
  const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  while (i + 3 < bytes.length) {
    while (i < bytes.length && bytes[i] !== 0xff) i++;
    while (i < bytes.length && bytes[i] === 0xff) i++;
    if (i >= bytes.length) break;
    const marker = bytes[i++];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (i + 1 >= bytes.length) break;
    const len = bytes.readUInt16BE(i);
    if (len < 2 || i + len > bytes.length) throw new Error("IBERFIT_APPROVED_MEDIA_JPEG_SEGMENT_INVALID");
    if (sof.has(marker)) {
      if (len < 7) throw new Error("IBERFIT_APPROVED_MEDIA_JPEG_SOF_INVALID");
      return { width: bytes.readUInt16BE(i + 5), height: bytes.readUInt16BE(i + 3) };
    }
    i += len;
  }
  throw new Error("IBERFIT_APPROVED_MEDIA_JPEG_DIMENSIONS_MISSING");
}
function pngDimensions(bytes) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  if (bytes.length < 24 || !bytes.subarray(0,8).equals(sig) || bytes.toString("ascii",12,16) !== "IHDR") {
    throw new Error("IBERFIT_APPROVED_MEDIA_PNG_INVALID");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function webpDimensions(bytes) {
  if (bytes.length < 30 || bytes.toString("ascii",0,4) !== "RIFF" || bytes.toString("ascii",8,12) !== "WEBP") {
    throw new Error("IBERFIT_APPROVED_MEDIA_WEBP_INVALID");
  }
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = bytes.toString("ascii", i, i + 4);
    const size = bytes.readUInt32LE(i + 4);
    const d = i + 8;
    if (d + size > bytes.length) throw new Error("IBERFIT_APPROVED_MEDIA_WEBP_CHUNK_INVALID");
    if (type === "VP8X" && size >= 10) {
      const width = 1 + bytes[d+4] + (bytes[d+5] << 8) + (bytes[d+6] << 16);
      const height = 1 + bytes[d+7] + (bytes[d+8] << 8) + (bytes[d+9] << 16);
      return { width, height };
    }
    if (type === "VP8L" && size >= 5 && bytes[d] === 0x2f) {
      const b1=bytes[d+1],b2=bytes[d+2],b3=bytes[d+3],b4=bytes[d+4];
      return { width:1+(b1|((b2&0x3f)<<8)), height:1+((b2>>6)|(b3<<2)|((b4&0x0f)<<10)) };
    }
    if (type === "VP8 " && size >= 10 && bytes[d+3]===0x9d && bytes[d+4]===0x01 && bytes[d+5]===0x2a) {
      return { width: bytes.readUInt16LE(d+6)&0x3fff, height: bytes.readUInt16LE(d+8)&0x3fff };
    }
    i = d + size + (size % 2);
  }
  throw new Error("IBERFIT_APPROVED_MEDIA_WEBP_DIMENSIONS_MISSING");
}
function dimensions(bytes, mime) {
  if (mime === "image/jpeg") return jpegDimensions(bytes);
  if (mime === "image/png") return pngDimensions(bytes);
  if (mime === "image/webp") return webpDimensions(bytes);
  throw new Error("IBERFIT_APPROVED_MEDIA_MIME_INVALID");
}

export function validateApprovedBatch(batch, { sourceRoot = "." } = {}) {
  if (!batch || Array.isArray(batch) || typeof batch !== "object") throw new Error("IBERFIT_APPROVED_BATCH_INVALID");
  if (batch.schema !== BATCH_SCHEMA || batch.target !== "prod") throw new Error("IBERFIT_APPROVED_BATCH_SCHEMA_TARGET_INVALID");
  if (!Array.isArray(batch.items) || batch.items.length < 1 || batch.items.length > MAX_BATCH) {
    throw new Error("IBERFIT_APPROVED_BATCH_SIZE_INVALID");
  }
  const ids = new Set();
  const paths = new Set();
  const validated = [];
  for (const item of batch.items) {
    const id = String(item?.exercise_id || "");
    if (!SAFE_ID.test(id) || ids.has(id)) throw new Error(`IBERFIT_APPROVED_EXERCISE_ID_INVALID:${id}`);
    ids.add(id);
    if (item?.human_approved !== true || item?.publishable !== true) {
      throw new Error(`IBERFIT_APPROVED_HUMAN_APPROVAL_REQUIRED:${id}`);
    }
    const approval = item?.approval || {};
    const scopes = Array.isArray(approval.scopes) ? approval.scopes.map(String) : [];
    if (approval.method !== "human_owner_approval" || !scopes.includes("visual") || !scopes.includes("biomechanics")) {
      throw new Error(`IBERFIT_APPROVED_SCOPE_INVALID:${id}`);
    }
    if (String(approval.automatic_qa || "").toLowerCase() === "failed") {
      throw new Error(`IBERFIT_APPROVED_AUTOMATIC_QA_FAILED:${id}`);
    }
    const media = item?.media;
    const movement = media?.movement;
    if (media?.schema !== "iberfit.exercise.visual.v1" ||
        media?.style !== "iberfit-premium-movement-pair-v1" ||
        media?.bucket !== BUCKET ||
        media?.published !== true ||
        media?.qa?.biomechanics !== "approved" ||
        media?.qa?.visual !== "approved" ||
        (media?.clientVisible !== true && media?.coachVisible !== true)) {
      throw new Error(`IBERFIT_APPROVED_MEDIA_INVALID:${id}`);
    }
    const storagePath = String(movement?.path || "");
    const parts = storagePath.split("/");
    if (parts.length !== 2 || parts[0] !== id || !SAFE_FILE.test(parts[1]) || storagePath.includes("..") || paths.has(storagePath)) {
      throw new Error(`IBERFIT_APPROVED_STORAGE_PATH_INVALID:${id}`);
    }
    paths.add(storagePath);
    const mime = String(movement?.mime || "");
    if (!["image/jpeg","image/png","image/webp"].includes(mime)) throw new Error(`IBERFIT_APPROVED_MIME_INVALID:${id}`);
    const expectedSha = String(movement?.sha256 || "").toLowerCase();
    if (!SHA256.test(expectedSha)) throw new Error(`IBERFIT_APPROVED_SHA_INVALID:${id}`);
    const rel = String(item?.local_path || "");
    if (!SAFE_REL.test(rel) || rel.startsWith("/") || rel.split("/").includes("..")) {
      throw new Error(`IBERFIT_APPROVED_LOCAL_PATH_INVALID:${id}`);
    }
    const localPath = within(sourceRoot, rel);
    if (!fs.existsSync(localPath) || !fs.statSync(localPath).isFile()) throw new Error(`IBERFIT_APPROVED_FILE_MISSING:${id}`);
    const bytes = fs.readFileSync(localPath);
    if (bytes.length < 100 || bytes.length > MAX_BYTES) throw new Error(`IBERFIT_APPROVED_FILE_SIZE_INVALID:${id}`);
    const actualSha = sha256(bytes);
    if (actualSha !== expectedSha) throw new Error(`IBERFIT_APPROVED_FILE_SHA_MISMATCH:${id}`);
    if (!parts[1].toLowerCase().includes(expectedSha.slice(0,12))) throw new Error(`IBERFIT_APPROVED_IMMUTABLE_PATH_REQUIRED:${id}`);
    const actual = dimensions(bytes, mime);
    if (actual.width !== Number(movement.width) || actual.height !== Number(movement.height)) {
      throw new Error(`IBERFIT_APPROVED_DIMENSIONS_MISMATCH:${id}:${actual.width}x${actual.height}`);
    }
    validated.push(Object.freeze({ item, id, media, bytes, mime, storagePath, sha256: actualSha, width: actual.width, height: actual.height }));
  }
  return Object.freeze(validated);
}

async function verifyPublic(fetchImpl, result, expectedSha) {
  const url = String(result?.public_url || "");
  if (!url.startsWith(`${PROD_ORIGIN}/storage/v1/object/public/${BUCKET}/`)) {
    throw new Error("IBERFIT_APPROVED_PUBLIC_URL_INVALID");
  }
  const response = await fetchImpl(url, { method:"GET", cache:"no-store", redirect:"error" });
  if (!response?.ok) throw new Error(`IBERFIT_APPROVED_PUBLIC_VERIFY_HTTP_${response?.status || 0}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha256(bytes) !== expectedSha) throw new Error("IBERFIT_APPROVED_PUBLIC_VERIFY_SHA_MISMATCH");
  return { url, bytes: bytes.length };
}

export async function publishApprovedBatch(batch, {
  sourceRoot = ".",
  oidcToken = "",
  apply = false,
  brokerUrl = BROKER_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const validated = validateApprovedBatch(batch, { sourceRoot });
  if (!apply) return Object.freeze({ ok:true, applied:false, target:"prod", count:validated.length });
  if (brokerUrl !== BROKER_URL) throw new Error("IBERFIT_APPROVED_BROKER_URL_INVALID");
  if (typeof fetchImpl !== "function") throw new Error("IBERFIT_APPROVED_FETCH_UNAVAILABLE");
  if (String(oidcToken).length < 100) throw new Error("IBERFIT_APPROVED_GITHUB_OIDC_REQUIRED");

  const results = [];
  for (const entry of validated) {
    const form = new FormData();
    form.set("item", JSON.stringify(entry.item));
    form.set("file", new Blob([entry.bytes], { type: entry.mime }), path.basename(entry.storagePath));
    const response = await fetchImpl(brokerUrl, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: {
        authorization: `Bearer ${oidcToken}`,
        "x-client-info": "iberfit-exercise-media-github-publisher/1",
      },
      body: form,
    });
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response?.ok || body?.ok !== true || body?.exercise_id !== entry.id || body?.sha256 !== entry.sha256) {
      throw new Error(`IBERFIT_APPROVED_BROKER_FAILED:${entry.id}:${response?.status || 0}:${String(body?.error || "invalid_response").slice(0,300)}`);
    }
    const publicVerification = await verifyPublic(fetchImpl, body, entry.sha256);
    results.push(Object.freeze({ ...body, public_verification: publicVerification }));
  }
  return Object.freeze({ ok:true, applied:true, target:"prod", count:results.length, results:Object.freeze(results) });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}
function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i+1] : null;
}
export async function runCli(argv=process.argv.slice(2), env=process.env) {
  const manifestPath = arg(argv,"--manifest");
  const sourceRoot = arg(argv,"--source-root") || ".";
  const evidencePath = arg(argv,"--evidence");
  const apply = argv.includes("--apply");
  if (!manifestPath) throw new Error("USAGE: node scripts/exercise-media/publish-approved-via-broker.mjs --manifest <batch.json> --source-root <dir> [--apply] [--evidence <json>]");
  const result = await publishApprovedBatch(readJson(manifestPath), {
    sourceRoot,
    oidcToken: env.IBERFIT_GITHUB_OIDC_TOKEN || "",
    apply,
  });
  if (evidencePath) {
    fs.mkdirSync(path.dirname(path.resolve(evidencePath)), { recursive:true });
    fs.writeFileSync(path.resolve(evidencePath), `${JSON.stringify(result,null,2)}\n`);
  }
  console.log(JSON.stringify({ ok:result.ok, applied:result.applied, target:result.target, count:result.count }));
  return result;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invoked === import.meta.url) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
