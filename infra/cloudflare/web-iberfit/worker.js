/**
 * WEB IBERFIT
 * Worker dedicado a la web corporativa iberfit.cl.
 *
 * Fase 1: servicio aislado y verificable. No tiene rutas de producción asociadas.
 * La vinculación de iberfit.cl se realizará únicamente después de certificar
 * la candidata web y verificar el target Cloudflare real.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/__health') {
      return Response.json({
        ok: true,
        service: 'WEB IBERFIT',
        worker: 'web-iberfit',
        purpose: 'corporate-web',
        productionDomainBound: false
      }, {
        headers: {
          'cache-control': 'no-store',
          'x-iberfit-service': 'web-iberfit'
        }
      });
    }

    return new Response('WEB IBERFIT infrastructure ready', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-iberfit-service': 'web-iberfit'
      }
    });
  }
};
