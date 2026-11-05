// H-49 / WP-3.5: CORS de HTTP y de Socket.IO con la misma allowlist (CORS_ORIGINS).
// Un Origin fuera de la lista no recibe Access-Control-Allow-Origin.
import { API, caso, esperar } from '../harness.mjs';

const AJENO = 'https://evil.example';
const PERMITIDO = (process.env.CORS_ORIGINS ?? 'https://dashcampay.com').split(',').map((o) => o.trim()).filter(Boolean)[0];

/** fetch crudo: el caso necesita las cabeceras de respuesta. */
async function crudo(method, path, headers, n) {
  const res = await fetch(API + path, { method, headers: { 'x-forwarded-for': `10.254.0.${n}`, ...headers } });
  await res.text();
  return { status: res.status, acao: res.headers.get('access-control-allow-origin') };
}

caso('CORS', 'HTTP: un Origin no permitido no recibe Access-Control-Allow-Origin (preflight y GET)', async () => {
  const pre = await crudo('OPTIONS', '/login', { origin: AJENO, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }, 1);
  const get = await crudo('GET', '/clientes/public', { origin: AJENO }, 2);
  esperar(!pre.acao && !get.acao, `preflight ${pre.status} ACAO=${pre.acao}; GET ${get.status} ACAO=${get.acao}`);
  // Control: el origen permitido sí la recibe (si no, el caso no probaría nada).
  const ctl = await crudo('OPTIONS', '/login', { origin: PERMITIDO, 'access-control-request-method': 'POST' }, 3);
  esperar(ctl.acao === PERMITIDO, `origen permitido ${PERMITIDO} → ACAO=${ctl.acao}`);
  return `ajeno sin ACAO (preflight ${pre.status}, GET ${get.status}); ${PERMITIDO} con ACAO`;
});

caso('CORS', 'Socket.IO: el handshake con un Origin no permitido no recibe Access-Control-Allow-Origin', async () => {
  const ruta = `/socket.io/?EIO=4&transport=polling&t=${Date.now()}`;
  const ajeno = await crudo('GET', ruta, { origin: AJENO }, 4);
  const ctl = await crudo('GET', ruta, { origin: PERMITIDO }, 5);
  esperar(ctl.status < 500 && ctl.acao === PERMITIDO, `control ${PERMITIDO} → ${ctl.status} ACAO=${ctl.acao} (¿gateway arriba en /socket.io?)`);
  esperar(!ajeno.acao, `ajeno → ${ajeno.status} ACAO=${ajeno.acao}`);
  return `ajeno ${ajeno.status} ACAO=${ajeno.acao ?? '-'}; permitido ${ctl.status} ACAO=${ctl.acao}`;
});
