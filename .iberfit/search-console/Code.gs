/**
 * @OnlyCurrentDoc
 * IBERFIT — Search Console → Google Sheets
 * Search Console: SOLO LECTURA.
 * Hoja: solo el documento actual.
 */

const IBERFIT_SEO = Object.freeze({
  DOMAIN: 'iberfit.cl',
  TZ: 'America/Santiago',
  DATA_LAG_DAYS: 3,
  MAIN_WINDOW_DAYS: 28,
  SHORT_WINDOW_DAYS: 7,
  BRAND_TERM: 'iberfit',
  DAILY_HOUR: 8,
  DAILY_MINUTE: 10,
  LIMITS: Object.freeze({
    queries: 1000,
    pages: 500,
    queryPage: 2000,
    devices: 20,
    countries: 250,
    historyQueries: 200,
  }),
});

const IBERFIT_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/spreadsheets.currentonly',
  'https://www.googleapis.com/auth/script.external_request',
  'https://www.googleapis.com/auth/script.scriptapp',
  'https://www.googleapis.com/auth/webmasters.readonly',
]);

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('IBERFIT SEO')
    .addItem('1. Autorizar y configurar', 'autorizarYConfigurar')
    .addItem('2. Sincronizar ahora', 'sincronizarAhora')
    .addSeparator()
    .addItem('Diagnóstico de conexión', 'diagnosticoConexion')
    .addItem('Recrear trigger diario', 'recrearTriggerDiario')
    .addToUi();
}

function autorizarYConfigurar() {
  requireIberfitScopes_();
  const ss = getBoundSpreadsheet_();
  ensureStructure_(ss);
  const siteUrl = resolveSearchConsoleProperty_();
  setConfigValue_(ss, 'Propiedad Search Console', siteUrl);
  setConfigValue_(ss, 'Estado de conexión', 'AUTORIZADO · SINCRONIZANDO');
  SpreadsheetApp.flush();

  syncSearchConsole();
  installDailyTrigger_();

  setConfigValue_(ss, 'Estado de conexión', 'CONECTADO');
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    'IBERFIT SEO conectado',
    'Search Console quedó conectado en solo lectura. Se creó una sincronización diaria alrededor de las 08:10 (America/Santiago).',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function sincronizarAhora() {
  requireIberfitScopes_();
  syncSearchConsole();
  SpreadsheetApp.getUi().alert('Sincronización completada.');
}

function diagnosticoConexion() {
  requireIberfitScopes_();
  const ss = getBoundSpreadsheet_();
  const siteUrl = resolveSearchConsoleProperty_();
  const endDate = isoDaysAgo_(IBERFIT_SEO.DATA_LAG_DAYS);
  const startDate = isoDaysAgo_(IBERFIT_SEO.DATA_LAG_DAYS + 6);
  const result = searchAnalytics_(siteUrl, startDate, endDate, [], 1);
  setConfigValue_(ss, 'Propiedad Search Console', siteUrl);
  setConfigValue_(ss, 'Estado de conexión', 'DIAGNÓSTICO OK');
  SpreadsheetApp.getUi().alert(
    'Conexión correcta',
    `Propiedad detectada: ${siteUrl}\nConsulta API correcta: ${startDate} → ${endDate}\nFilas devueltas: ${(result.rows || []).length}`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function recrearTriggerDiario() {
  requireIberfitScopes_();
  installDailyTrigger_();
  SpreadsheetApp.getUi().alert('Trigger diario recreado para ~08:10 America/Santiago.');
}

function syncSearchConsole() {
  requireIberfitScopes_();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return;

  try {
    const ss = getBoundSpreadsheet_();
    ensureStructure_(ss);
    const siteUrl = resolveSearchConsoleProperty_();

    const endDate = isoDaysAgo_(IBERFIT_SEO.DATA_LAG_DAYS);
    const start28 = isoDaysAgo_(IBERFIT_SEO.DATA_LAG_DAYS + IBERFIT_SEO.MAIN_WINDOW_DAYS - 1);
    const start7 = isoDaysAgo_(IBERFIT_SEO.DATA_LAG_DAYS + IBERFIT_SEO.SHORT_WINDOW_DAYS - 1);
    const prev7End = isoDaysAgo_(IBERFIT_SEO.DATA_LAG_DAYS + IBERFIT_SEO.SHORT_WINDOW_DAYS);
    const prev7Start = isoDaysAgo_(IBERFIT_SEO.DATA_LAG_DAYS + IBERFIT_SEO.SHORT_WINDOW_DAYS * 2 - 1);

    setConfigValue_(ss, 'Propiedad Search Console', siteUrl);
    setConfigValue_(ss, 'Estado de conexión', 'SINCRONIZANDO');

    const totals28 = firstMetricRow_(searchAnalytics_(siteUrl, start28, endDate, [], 1));
    const nonBrand28 = firstMetricRow_(searchAnalytics_(
      siteUrl,
      start28,
      endDate,
      [],
      1,
      [{ dimension: 'query', operator: 'notContains', expression: IBERFIT_SEO.BRAND_TERM }]
    ));
    const totals7 = firstMetricRow_(searchAnalytics_(siteUrl, start7, endDate, [], 1));
    const prev7 = firstMetricRow_(searchAnalytics_(siteUrl, prev7Start, prev7End, [], 1));

    const queryRows = searchAnalytics_(siteUrl, start28, endDate, ['query'], IBERFIT_SEO.LIMITS.queries).rows || [];
    const pageRows = searchAnalytics_(siteUrl, start28, endDate, ['page'], IBERFIT_SEO.LIMITS.pages).rows || [];
    const queryPageRows = searchAnalytics_(siteUrl, start28, endDate, ['query', 'page'], IBERFIT_SEO.LIMITS.queryPage).rows || [];
    const deviceRows = searchAnalytics_(siteUrl, start28, endDate, ['device'], IBERFIT_SEO.LIMITS.devices).rows || [];
    const countryRows = searchAnalytics_(siteUrl, start28, endDate, ['country'], IBERFIT_SEO.LIMITS.countries).rows || [];

    upsertSummary_(ss, endDate, totals28, nonBrand28, totals7, prev7, siteUrl);
    writeDimensionSheet_(ss, 'Consultas', ['Fecha corte', 'Consulta', 'Clics', 'Impresiones', 'CTR', 'Posición'], queryRows, endDate);
    writeDimensionSheet_(ss, 'Páginas', ['Fecha corte', 'Página', 'Clics', 'Impresiones', 'CTR', 'Posición'], pageRows, endDate);
    writeDimensionSheet_(ss, 'Consultas × página', ['Fecha corte', 'Consulta', 'Página', 'Clics', 'Impresiones', 'CTR', 'Posición'], queryPageRows, endDate);
    writeDimensionSheet_(ss, 'Dispositivos', ['Fecha corte', 'Dispositivo', 'Clics', 'Impresiones', 'CTR', 'Posición'], deviceRows, endDate);
    writeDimensionSheet_(ss, 'Países', ['Fecha corte', 'País', 'Clics', 'Impresiones', 'CTR', 'Posición'], countryRows, endDate);

    const priorityMetrics = updatePriorityUrls_(ss, pageRows, endDate);
    appendHistoryOnce_(ss, endDate, totals28, queryRows, priorityMetrics);

    setConfigValue_(ss, 'Estado de conexión', 'CONECTADO');
    setConfigValue_(ss, 'Última sincronización', Utilities.formatDate(new Date(), IBERFIT_SEO.TZ, 'yyyy-MM-dd HH:mm:ss'));
    setConfigValue_(ss, 'Fuente', 'Google Search Console API oficial · solo lectura');
    SpreadsheetApp.flush();
  } catch (err) {
    try {
      const ss = getBoundSpreadsheet_();
      setConfigValue_(ss, 'Estado de conexión', `ERROR · ${String(err.message || err).slice(0, 180)}`);
    } catch (_) {}
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function requireIberfitScopes_() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, IBERFIT_SCOPES);
}

function getBoundSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Este código debe estar vinculado al Sheet “IBERFIT — SEO Search Console”.');
  return ss;
}

function resolveSearchConsoleProperty_() {
  const data = apiGetJson_('https://www.googleapis.com/webmasters/v3/sites');
  const entries = (data.siteEntry || []).filter(x => x.permissionLevel && x.permissionLevel !== 'siteUnverifiedUser');
  if (!entries.length) throw new Error('La cuenta autorizada no tiene propiedades verificadas accesibles en Search Console.');

  const exactDomain = entries.find(x => x.siteUrl === `sc-domain:${IBERFIT_SEO.DOMAIN}`);
  if (exactDomain) return exactDomain.siteUrl;

  const exactHttps = entries.find(x => x.siteUrl === `https://${IBERFIT_SEO.DOMAIN}/`);
  if (exactHttps) return exactHttps.siteUrl;

  const matching = entries.find(x => String(x.siteUrl).toLowerCase().includes(IBERFIT_SEO.DOMAIN));
  if (matching) return matching.siteUrl;

  throw new Error(`No encuentro una propiedad Search Console que corresponda a ${IBERFIT_SEO.DOMAIN}.`);
}

function searchAnalytics_(siteUrl, startDate, endDate, dimensions, rowLimit, filters) {
  const payload = {
    startDate,
    endDate,
    rowLimit: Math.max(1, Math.min(Number(rowLimit || 1000), 25000)),
    type: 'web',
  };
  if (dimensions && dimensions.length) payload.dimensions = dimensions;
  if (filters && filters.length) {
    payload.dimensionFilterGroups = [{ groupType: 'and', filters }];
  }

  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  return apiFetchJson_(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
  });
}

function apiGetJson_(url) {
  return apiFetchJson_(url, { method: 'get' });
}

function apiFetchJson_(url, options) {
  const opts = Object.assign({}, options || {}, {
    muteHttpExceptions: true,
    headers: Object.assign({}, (options && options.headers) || {}, {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
      Accept: 'application/json',
    }),
  });
  const response = UrlFetchApp.fetch(url, opts);
  const code = response.getResponseCode();
  const text = response.getContentText();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { raw: text }; }

  if (code < 200 || code >= 300) {
    const msg = body?.error?.message || body?.message || text || `HTTP ${code}`;
    if (code === 403 && /has not been used|disabled|accessNotConfigured|API/i.test(msg)) {
      throw new Error('Google rechazó la llamada porque la Search Console API no está habilitada para el proyecto de Apps Script. Abre Configuración del proyecto en Apps Script y vincula un proyecto de Google Cloud con Search Console API habilitada; después vuelve a ejecutar “Autorizar y configurar”.');
    }
    throw new Error(`Search Console API ${code}: ${msg}`);
  }
  return body;
}

function firstMetricRow_(response) {
  const r = (response.rows || [])[0] || {};
  return {
    clicks: Number(r.clicks || 0),
    impressions: Number(r.impressions || 0),
    ctr: Number(r.ctr || 0),
    position: Number(r.position || 0),
  };
}

function writeDimensionSheet_(ss, sheetName, headers, apiRows, endDate) {
  const sh = getOrCreateSheet_(ss, sheetName);
  ensureColumns_(sh, headers.length);
  const rows = (apiRows || []).map(r => [
    endDate,
    ...(r.keys || []),
    Number(r.clicks || 0),
    Number(r.impressions || 0),
    Number(r.ctr || 0),
    Number(r.position || 0),
  ]);
  replaceTable_(sh, headers, rows);
}

function upsertSummary_(ss, endDate, totals28, nonBrand28, totals7, prev7, siteUrl) {
  const sh = getOrCreateSheet_(ss, 'Resumen diario');
  const headers = [
    'Fecha datos', 'Clics 28d', 'Impresiones 28d', 'CTR 28d', 'Posición 28d',
    'Clics no branded 28d', 'Impresiones no branded 28d', 'Clics 7d', 'Impresiones 7d', 'Observaciones'
  ];
  ensureColumns_(sh, headers.length);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length);

  const note = [
    `7d vs 7d prev: clics ${formatDelta_(totals7.clicks, prev7.clicks)}`,
    `impresiones ${formatDelta_(totals7.impressions, prev7.impressions)}`,
    `propiedad ${siteUrl}`,
  ].join(' · ');
  const row = [
    endDate, totals28.clicks, totals28.impressions, totals28.ctr, totals28.position,
    nonBrand28.clicks, nonBrand28.impressions, totals7.clicks, totals7.impressions, note
  ];

  const lastRow = sh.getLastRow();
  let targetRow = lastRow + 1;
  if (lastRow >= 2) {
    const dates = sh.getRange(2, 1, lastRow - 1, 1).getDisplayValues().flat();
    const idx = dates.indexOf(endDate);
    if (idx >= 0) targetRow = idx + 2;
  }
  sh.getRange(targetRow, 1, 1, row.length).setValues([row]);
  sh.getRange(targetRow, 4).setNumberFormat('0.00%');
  sh.getRange(targetRow, 5).setNumberFormat('0.00');
  sh.setFrozenRows(1);
}

function updatePriorityUrls_(ss, pageRows, endDate) {
  const sh = getOrCreateSheet_(ss, 'URLs prioritarias');
  ensureColumns_(sh, 12);
  const metricHeaders = ['Clics 28d', 'Impresiones 28d', 'CTR 28d', 'Posición 28d', 'Actualizado'];
  sh.getRange(1, 8, 1, 5).setValues([metricHeaders]);
  styleHeader_(sh, 12);

  const byUrl = new Map();
  (pageRows || []).forEach(r => {
    const url = normalizeUrl_((r.keys || [])[0] || '');
    byUrl.set(url, {
      url,
      clicks: Number(r.clicks || 0),
      impressions: Number(r.impressions || 0),
      ctr: Number(r.ctr || 0),
      position: Number(r.position || 0),
    });
  });

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const urls = sh.getRange(2, 2, lastRow - 1, 1).getDisplayValues().flat();
  const out = urls.map(u => {
    const m = byUrl.get(normalizeUrl_(u)) || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    return [m.clicks, m.impressions, m.ctr, m.position, endDate];
  });
  sh.getRange(2, 8, out.length, 5).setValues(out);
  sh.getRange(2, 10, out.length, 1).setNumberFormat('0.00%');
  sh.getRange(2, 11, out.length, 1).setNumberFormat('0.00');

  return urls.map((u, i) => ({
    url: normalizeUrl_(u),
    clicks: out[i][0],
    impressions: out[i][1],
    ctr: out[i][2],
    position: out[i][3],
  }));
}

function appendHistoryOnce_(ss, endDate, totals28, queryRows, priorityMetrics) {
  const sh = getOrCreateSheet_(ss, 'Histórico');
  const headers = ['Fecha captura', 'Fecha datos', 'Ventana', 'Dimensión', 'Clave 1', 'Clave 2', 'Clics', 'Impresiones', 'CTR', 'Posición'];
  ensureColumns_(sh, headers.length);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length);

  if (sh.getLastRow() >= 2) {
    const existingDates = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getDisplayValues().flat();
    if (existingDates.includes(endDate)) return;
  }

  const captured = Utilities.formatDate(new Date(), IBERFIT_SEO.TZ, 'yyyy-MM-dd HH:mm:ss');
  const rows = [[captured, endDate, '28d', 'TOTAL', 'iberfit.cl', '', totals28.clicks, totals28.impressions, totals28.ctr, totals28.position]];

  (queryRows || []).slice(0, IBERFIT_SEO.LIMITS.historyQueries).forEach(r => {
    rows.push([captured, endDate, '28d', 'QUERY', (r.keys || [])[0] || '', '', Number(r.clicks || 0), Number(r.impressions || 0), Number(r.ctr || 0), Number(r.position || 0)]);
  });
  (priorityMetrics || []).forEach(m => {
    rows.push([captured, endDate, '28d', 'PAGE_PRIORITY', m.url, '', m.clicks, m.impressions, m.ctr, m.position]);
  });

  sh.getRange(sh.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  const first = sh.getLastRow() - rows.length + 1;
  sh.getRange(first, 9, rows.length, 1).setNumberFormat('0.00%');
  sh.getRange(first, 10, rows.length, 1).setNumberFormat('0.00');
  sh.setFrozenRows(1);
}

function ensureStructure_(ss) {
  const expected = {
    'Configuración': ['Parámetro', 'Valor'],
    'Resumen diario': ['Fecha datos', 'Clics 28d', 'Impresiones 28d', 'CTR 28d', 'Posición 28d', 'Clics no branded 28d', 'Impresiones no branded 28d', 'Clics 7d', 'Impresiones 7d', 'Observaciones'],
    'Consultas': ['Fecha corte', 'Consulta', 'Clics', 'Impresiones', 'CTR', 'Posición'],
    'Páginas': ['Fecha corte', 'Página', 'Clics', 'Impresiones', 'CTR', 'Posición'],
    'Consultas × página': ['Fecha corte', 'Consulta', 'Página', 'Clics', 'Impresiones', 'CTR', 'Posición'],
    'Dispositivos': ['Fecha corte', 'Dispositivo', 'Clics', 'Impresiones', 'CTR', 'Posición'],
    'Países': ['Fecha corte', 'País', 'Clics', 'Impresiones', 'CTR', 'Posición'],
    'Histórico': ['Fecha captura', 'Fecha datos', 'Ventana', 'Dimensión', 'Clave 1', 'Clave 2', 'Clics', 'Impresiones', 'CTR', 'Posición'],
  };

  Object.entries(expected).forEach(([name, headers]) => {
    const sh = getOrCreateSheet_(ss, name);
    ensureColumns_(sh, headers.length);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    styleHeader_(sh, headers.length);
    sh.setFrozenRows(1);
  });

  const cfg = getOrCreateSheet_(ss, 'Configuración');
  const defaults = [
    ['Propiedad Search Console', 'AUTO'],
    ['Zona horaria', IBERFIT_SEO.TZ],
    ['Retraso de datos (días)', IBERFIT_SEO.DATA_LAG_DAYS],
    ['Ventana diaria principal (días)', IBERFIT_SEO.MAIN_WINDOW_DAYS],
    ['Ventana comparativa corta (días)', IBERFIT_SEO.SHORT_WINDOW_DAYS],
    ['Marca / términos branded', IBERFIT_SEO.BRAND_TERM],
    ['Estado de conexión', 'PENDIENTE_AUTORIZACIÓN_GSC'],
    ['Última sincronización', ''],
    ['Fuente', 'Google Search Console API oficial · solo lectura'],
  ];
  defaults.forEach(([k, v]) => ensureConfigValue_(cfg, k, v));
}

function replaceTable_(sh, headers, rows) {
  const cols = headers.length;
  ensureColumns_(sh, cols);
  const lastRow = Math.max(sh.getLastRow(), 1);
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, cols).clearContent();
  sh.getRange(1, 1, 1, cols).setValues([headers]);
  if (rows.length) sh.getRange(2, 1, rows.length, cols).setValues(rows);
  styleHeader_(sh, cols);
  sh.setFrozenRows(1);

  const ctrCol = headers.indexOf('CTR') + 1;
  const posCol = headers.indexOf('Posición') + 1;
  if (rows.length && ctrCol > 0) sh.getRange(2, ctrCol, rows.length, 1).setNumberFormat('0.00%');
  if (rows.length && posCol > 0) sh.getRange(2, posCol, rows.length, 1).setNumberFormat('0.00');
}

function styleHeader_(sh, cols) {
  sh.getRange(1, 1, 1, cols)
    .setBackground('#F1F3F2')
    .setFontColor('#163F2D')
    .setFontWeight('bold')
    .setWrap(true);
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureColumns_(sh, needed) {
  if (sh.getMaxColumns() < needed) sh.insertColumnsAfter(sh.getMaxColumns(), needed - sh.getMaxColumns());
}

function setConfigValue_(ss, key, value) {
  const sh = getOrCreateSheet_(ss, 'Configuración');
  ensureConfigValue_(sh, key, value, true);
}

function ensureConfigValue_(sh, key, value, overwrite) {
  const last = Math.max(sh.getLastRow(), 1);
  const keys = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues().flat() : [];
  const idx = keys.indexOf(key);
  if (idx >= 0) {
    const cell = sh.getRange(idx + 2, 2);
    if (overwrite || cell.getDisplayValue() === '') cell.setValue(value);
  } else {
    sh.appendRow([key, value]);
  }
}

function installDailyTrigger_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncSearchConsole')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncSearchConsole')
    .timeBased()
    .atHour(IBERFIT_SEO.DAILY_HOUR)
    .nearMinute(IBERFIT_SEO.DAILY_MINUTE)
    .everyDays(1)
    .inTimezone(IBERFIT_SEO.TZ)
    .create();
}

function isoDaysAgo_(daysAgo) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - Number(daysAgo));
  return Utilities.formatDate(d, IBERFIT_SEO.TZ, 'yyyy-MM-dd');
}

function formatDelta_(current, previous) {
  const c = Number(current || 0);
  const p = Number(previous || 0);
  if (p === 0) return c === 0 ? '0.0%' : 'nuevo';
  const pct = ((c - p) / p) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function normalizeUrl_(url) {
  const s = String(url || '').trim().split('#')[0].split('?')[0];
  if (!s) return '';
  return s.endsWith('/') ? s : `${s}/`;
}
