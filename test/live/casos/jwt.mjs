// P1 JwtStrategy: rol/cliente desde la BD, typ obligatorio, iss/aud.
import { createRequire } from 'node:module';
import { PASSWORD, caso, crearUsuario, esperar, firmarProposito, http, login, q } from '../harness.mjs';

const jwt = createRequire(import.meta.url)('jsonwebtoken');
const firmarAccess = (payload, opts = {}) =>
  jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m', ...opts });

caso('JWT', 'token sin typ se rechaza', async () => {
  const u = await crearUsuario({ rol: 2 });
  const t = firmarAccess({ id: u.id, email: u.userName, cliente: u.cliente, rol: 2, tv: 0 }, { issuer: 'dashcampay-api', audience: 'dashcampay' });
  const r = await http('GET', '/login/me', { token: t });
  esperar(r.status === 401, `status ${r.status}`);
  return '401';
});

caso('JWT', 'token sin iss/aud se rechaza', async () => {
  const u = await crearUsuario({ rol: 2 });
  const t = firmarAccess({ id: u.id, email: u.userName, cliente: u.cliente, rol: 2, tv: 0, typ: 'access' });
  const r = await http('GET', '/login/me', { token: t });
  esperar(r.status === 401, `status ${r.status}`);
  return '401';
});

caso('JWT', 'el rol del token no manda: un pasajero que se firma rol 1 sigue siendo pasajero', async () => {
  const u = await crearUsuario({ rol: 9 });
  const t = firmarAccess(
    { id: u.id, email: u.userName, cliente: 1, rol: 1, tv: 0, typ: 'access' },
    { issuer: 'dashcampay-api', audience: 'dashcampay' },
  );
  // /roles/list es solo para roles 1 y 2: con rol tomado del token pasaría.
  const r = await http('GET', '/roles/list', { token: t });
  esperar(r.status === 403, `pasajero con rol 1 en el token obtuvo ${r.status}`);
  return `${r.status}`;
});

caso('JWT', 'desactivar al usuario corta su token al instante', async () => {
  const u = await crearUsuario({ rol: 2 });
  const t = await login(u);
  await q('UPDATE Usuarios SET Estatus = 0 WHERE Id = ?', [u.id]);
  const r = await http('GET', '/login/me', { token: t });
  esperar(r.status === 401, `status ${r.status}`);
  return '401';
});

caso('R4', 'GET /transacciones/list responde para el rol 2 (rama default)', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const r = await http('GET', '/transacciones/list', { token: await login(adm) });
  esperar(r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return '200';
});

caso('Refresh', '5 refresh en paralelo con el mismo token: solo uno obtiene sesión nueva', async () => {
  const u = await crearUsuario({ rol: 2 });
  const l = await http('POST', '/login', { body: { userName: u.userName, password: PASSWORD } });
  const refreshToken = l.body.refreshToken ?? l.body.data?.refreshToken;
  esperar(refreshToken, 'el login no devolvió refreshToken');
  const rs = await Promise.all(Array.from({ length: 5 }, () => http('POST', '/login/refresh', { body: { refreshToken } })));
  const ok = rs.filter((r) => r.status === 200 || r.status === 201).length;
  esperar(ok === 1, `${ok} refresh exitosos (${rs.map((r) => r.status).join(',')})`);
  return `1 de 5 (${rs.map((r) => r.status).join(',')})`;
});

caso('Tenant', 'un id mal formado responde 404 antes de consultar la BD', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const r = await http('GET', '/usuarios/1abc', { token });
  esperar(r.status === 404, `status ${r.status}`);
  return '404';
});

// N-01: los tokens de propósito (confirmación de correo, reset) no son access tokens.
const RUTAS_AUTENTICADAS = ['/login/me', '/transacciones/list', '/usuarios/list'];
async function comoBearer(token) {
  const rs = [];
  for (const ruta of RUTAS_AUTENTICADAS) rs.push(`${ruta}→${(await http('GET', ruta, { token })).status}`);
  return rs;
}

caso('N-01', 'un token de confirmación de correo (email_confirm) usado como Bearer da 401', async () => {
  const u = await crearUsuario({ rol: 2 });
  // Igual que el del correo: secreto de propósito, typ email_confirm, tv vigente.
  const token = firmarProposito({ id: u.id, email: u.userName, typ: 'email_confirm', tv: 0 });
  const rs = await comoBearer(token);
  esperar(rs.every((x) => x.endsWith('→401')), rs.join(' '));
  return rs.join(' ');
});

caso('N-01', 'un token de reset (pwd_reset) usado como Bearer da 401', async () => {
  const u = await crearUsuario({ rol: 2 });
  const token = firmarProposito({ id: u.id, email: u.userName, typ: 'pwd_reset', tv: 0 });
  const rs = await comoBearer(token);
  esperar(rs.every((x) => x.endsWith('→401')), rs.join(' '));
  return rs.join(' ');
});

caso('N-01', 'un token email_confirm firmado con JWT_SECRET e iss/aud válidos también da 401 (manda typ)', async () => {
  const u = await crearUsuario({ rol: 2 });
  const token = firmarAccess(
    { id: u.id, email: u.userName, cliente: u.cliente, rol: 2, tv: 0, typ: 'email_confirm' },
    { issuer: 'dashcampay-api', audience: 'dashcampay' },
  );
  const rs = await comoBearer(token);
  esperar(rs.every((x) => x.endsWith('→401')), rs.join(' '));
  return rs.join(' ');
});
