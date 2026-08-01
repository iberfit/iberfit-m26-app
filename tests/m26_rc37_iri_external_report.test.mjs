import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IRI_EXTERNAL_REPORT_BUCKET,
  createIriExternalReportService,
  friendlyIriExternalReportError,
  iriExternalReportObjectPath,
  resolveIriExternalReportContext,
  validateIriExternalReportFile,
} from '../src/m26/workflows/iri-external-report-controller.js';
import { renderIriRoute, renderReportsRoute } from '../src/m26/modules/route-render.js';

const CLIENT_ID = '57339e70-7a99-48d6-820f-7d4a51f89d9d';
const ASSESSMENT_ID = 'a82e5560-2f67-4de9-bf5b-ad3bfb289d96';
const OLDER_ASSESSMENT_ID = '55afb4e1-e315-4598-9696-050a96ee9e2c';
const TOKEN = 'qa-access-token';

const runtime = {
  enabled: true,
  projectRef: 'pjhmrhejsoofmouedavw',
  url: 'https://pjhmrhejsoofmouedavw.supabase.co',
  publishableKey: 'sb_publishable_rc37_test',
  timeoutMs: 5_000,
  version: '26.0.0-canary.37',
};

function fileLike({ name = 'bioimpedancia.jpeg', type = 'image/jpeg', size = 194_916 } = {}) {
  const blob = new Blob(['contenido'], { type });
  Object.defineProperties(blob, {
    name: { value: name },
    size: { value: size },
  });
  return blob;
}

test('ruta canónica conserva un único objeto estable sin extensión', () => {
  assert.equal(
    iriExternalReportObjectPath(CLIENT_ID, ASSESSMENT_ID),
    `${CLIENT_ID}/${ASSESSMENT_ID}/bioimpedancia`
  );
  assert.equal(IRI_EXTERNAL_REPORT_BUCKET, 'iberfit-iri-external-reports');
});

test('validación permite únicamente PDF, JPEG y PNG hasta 50 MB', () => {
  assert.deepEqual(validateIriExternalReportFile(fileLike()), {
    fileName: 'bioimpedancia.jpeg',
    mimeType: 'image/jpeg',
    sizeBytes: 194_916,
  });
  assert.throws(
    () => validateIriExternalReportFile(fileLike({ type: 'image/webp' })),
    /MIME_INVALID/
  );
  assert.throws(
    () => validateIriExternalReportFile(fileLike({ size: 50_000_001 })),
    /SIZE_INVALID/
  );
  for (const candidate of [
    { name: 'bioimpedancia.pdf', type: 'application/pdf' },
    { name: 'bioimpedancia.png', type: 'image/png' },
    { name: 'bioimpedancia.jpg', type: 'image/jpeg' },
  ]) {
    assert.equal(
      validateIriExternalReportFile(fileLike({ ...candidate, size: 50_000_000 })).mimeType,
      candidate.type
    );
  }
  const coachHtml = renderIriRoute({
    current: {}, currentSummary: null, profile: {}, sourceProfile: {}, history: [], canEdit: true,
  });
  assert.match(coachHtml, /accept="application\/pdf,image\/png,image\/jpeg"/);
  assert.doesNotMatch(coachHtml, /accept="[^"]*image\/webp/);
});

test('contexto usa el cliente seleccionado y la evaluación IRI más reciente', () => {
  const context = resolveIriExternalReportContext({
    identity: { role: 'coach' },
    selectedClientId: CLIENT_ID,
    collections: {
      clients: [{ id: CLIENT_ID }],
      iriAssessments: [
        { id: OLDER_ASSESSMENT_ID, clientId: CLIENT_ID, assessmentDate: '2026-07-20' },
        { id: ASSESSMENT_ID, clientId: CLIENT_ID, assessmentDate: '2026-07-30' },
      ],
    },
  });
  assert.deepEqual(context, {
    role: 'coach',
    clientId: CLIENT_ID,
    assessmentId: ASSESSMENT_ID,
    canManage: true,
  });
});

test('cliente puede consultar pero no gestionar el documento', () => {
  const context = resolveIriExternalReportContext({
    identity: { role: 'client', clientId: CLIENT_ID },
    collections: {
      clients: [{ id: CLIENT_ID }],
      iriAssessments: [{ id: ASSESSMENT_ID, clientId: CLIENT_ID, assessmentDate: '2026-07-30' }],
    },
  });
  assert.equal(context.clientId, CLIENT_ID);
  assert.equal(context.assessmentId, ASSESSMENT_ID);
  assert.equal(context.canManage, false);
  const html = renderReportsRoute({
    role: 'client', latestIri: { id: ASSESSMENT_ID }, canManage: false, reports: [],
  });
  assert.match(html, /data-iri-external-report-host/);
  assert.doesNotMatch(html, /bodyCompositionAttachment|Subir informe|Reemplazar informe/);
});

test('Admin conserva permiso de subida y reemplazo sobre el cliente seleccionado', () => {
  const context = resolveIriExternalReportContext({
    identity: { role: 'admin' },
    selectedClientId: CLIENT_ID,
    collections: {
      clients: [{ id: CLIENT_ID }],
      iriAssessments: [{ id: ASSESSMENT_ID, clientId: CLIENT_ID, assessmentDate: '2026-07-30' }],
    },
  });
  assert.equal(context.canManage, true);
  assert.equal(context.clientId, CLIENT_ID);
  assert.equal(context.assessmentId, ASSESSMENT_ID);
});

test('servicio ejecuta consulta, upload, RPC y URL firmada con contrato v12.4', async () => {
  const calls = [];
  const objectPath = `${CLIENT_ID}/${ASSESSMENT_ID}/bioimpedancia`;
  const report = {
    id: 'b3965964-fcda-42d7-be3f-e0a9c88b3950',
    ok: true,
    clientId: CLIENT_ID,
    assessmentId: ASSESSMENT_ID,
    bucketId: IRI_EXTERNAL_REPORT_BUCKET,
    objectPath,
    fileName: 'bioimpedancia.jpeg',
    mimeType: 'image/jpeg',
    sizeBytes: 194_916,
    visibleToClient: true,
    version: 2,
    uploadedAt: '2026-08-01T02:40:40.367221+00:00',
    updatedAt: '2026-08-01T02:40:40.367221+00:00',
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/rest/v1/iri_external_reports_v26?')) {
      return Response.json([{ ...report, client_id: CLIENT_ID, assessment_id: ASSESSMENT_ID }]);
    }
    if (url.includes('/storage/v1/object/sign/')) {
      return Response.json({ signedURL: `/storage/v1/object/sign/${IRI_EXTERNAL_REPORT_BUCKET}/${objectPath}?token=test` });
    }
    if (url.includes('/rest/v1/rpc/iberfit_register_iri_external_report_v12')) {
      return Response.json(report);
    }
    if (url.includes('/storage/v1/object/')) return Response.json({ Key: objectPath });
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  const service = createIriExternalReportService({ runtime, fetchImpl });
  const file = fileLike();

  const loaded = await service.getReport(TOKEN, { assessmentId: ASSESSMENT_ID });
  assert.equal(loaded.version, 2);

  const uploaded = await service.uploadObject(TOKEN, {
    clientId: CLIENT_ID,
    assessmentId: ASSESSMENT_ID,
    file,
  });
  assert.equal(uploaded.objectPath, objectPath);
  const uploadCall = calls.find((item) => item.url.includes('/storage/v1/object/') && !item.url.includes('/sign/'));
  assert.equal(uploadCall.options.method, 'POST');
  assert.equal(uploadCall.options.body, file);
  assert.equal(uploadCall.options.headers['x-upsert'], 'true');
  assert.equal(uploadCall.options.headers['content-type'], 'image/jpeg');

  const registered = await service.registerReport(TOKEN, {
    clientId: CLIENT_ID,
    assessmentId: ASSESSMENT_ID,
    fileName: 'bioimpedancia.jpeg',
    mimeType: 'image/jpeg',
    sizeBytes: 194_916,
    objectPath,
  });
  assert.equal(registered.visibleToClient, true);
  assert.equal(registered.version, 2);
  const rpcCall = calls.find((item) => item.url.includes('iberfit_register_iri_external_report_v12'));
  assert.deepEqual(JSON.parse(rpcCall.options.body), {
    p_client_id: CLIENT_ID,
    p_assessment_id: ASSESSMENT_ID,
    p_file_name: 'bioimpedancia.jpeg',
    p_mime_type: 'image/jpeg',
    p_size_bytes: 194_916,
    p_object_path: objectPath,
  });

  const signed = await service.signedUrl(TOKEN, { objectPath });
  assert.match(signed, /^https:\/\/pjhmrhejsoofmouedavw\.supabase\.co\/storage\/v1\/object\/sign\//);
});

test('mensajes convierten códigos técnicos en acciones comprensibles', () => {
  assert.equal(
    friendlyIriExternalReportError(new Error('V124_MIME_TYPE_INVALID')),
    'Formato no permitido. Usa PDF, JPG o PNG.'
  );
  assert.match(
    friendlyIriExternalReportError(new Error('M26_IRI_EXTERNAL_REPORT_TIMEOUT')),
    /conectar/i
  );
});
