// R1 (OTP en varchar(6)) y H-03 (reset de contraseña).
import { caso, crearUsuario, esperar, firmarProposito, hashOtp, http, q } from '../harness.mjs';

const CONFIRMACION = 0;
const RECUPERACION = 1;

async function sembrarOtp(u, tipo, codigo) {
  await q(
    `INSERT INTO CodigoAutenticacion (IdUsuario, Codigo, Tipo, FechaExpiracion, Usado, Estatus, Intentos)
     VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY), 1, 1, 0)`,
    [u.id, hashOtp(u.id, tipo, codigo), tipo],
  );
}

caso('R1', 'la columna Codigo acepta el hash de 64 caracteres', async () => {
  const [col] = await q(
    `SELECT COLUMN_TYPE t FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'CodigoAutenticacion' AND COLUMN_NAME = 'Codigo'`,
  );
  esperar(col.t === 'char(64)', `Codigo es ${col.t}`);
  return 'Codigo CHAR(64)';
});

caso('R1', 'verify con el OTP correcto confirma el correo', async () => {
  const u = await crearUsuario({ confirmado: 0 });
  await sembrarOtp(u, CONFIRMACION, '482913');
  const r = await http('PATCH', '/login/verify', { body: { userName: u.userName, codigo: '482913' } });
  esperar(r.status === 200, `status ${r.status} ${JSON.stringify(r.body)}`);
  const [row] = await q('SELECT EmailConfirmado e FROM Usuarios WHERE Id = ?', [u.id]);
  esperar(row.e === 1, 'EmailConfirmado no cambió');
  return '200 y EmailConfirmado=1';
});

caso('R1', 'el OTP de un usuario no sirve para otro', async () => {
  const a = await crearUsuario({ confirmado: 0 });
  const b = await crearUsuario({ confirmado: 0 });
  await sembrarOtp(a, CONFIRMACION, '111222');
  await sembrarOtp(b, CONFIRMACION, '333444');
  const r = await http('PATCH', '/login/verify', { body: { userName: b.userName, codigo: '111222' } });
  esperar(r.status === 400, `status ${r.status}`);
  return '400';
});

caso('R1', 'el OTP se invalida al quinto intento fallido', async () => {
  const u = await crearUsuario({ confirmado: 0 });
  await sembrarOtp(u, CONFIRMACION, '765432');
  for (let i = 0; i < 5; i++) {
    // IP distinta por intento: aquí se prueba el contador del OTP, no el throttler.
    const headers = { 'x-forwarded-for': `10.251.${u.id % 250}.${i + 1}` };
    await http('PATCH', '/login/verify', { body: { userName: u.userName, codigo: String(100000 + i) }, headers });
  }
  const [row] = await q('SELECT Intentos, Usado FROM CodigoAutenticacion WHERE IdUsuario = ?', [u.id]);
  esperar(row.Intentos === 5 && row.Usado === 0, `Intentos=${row.Intentos} Usado=${row.Usado}`);
  const headers = { 'x-forwarded-for': `10.251.${u.id % 250}.99` };
  const r = await http('PATCH', '/login/verify', { body: { userName: u.userName, codigo: '765432' }, headers });
  esperar(r.status === 400, `el código correcto pasó tras 5 fallos (status ${r.status})`);
  return 'Intentos=5, Usado=0; el correcto ya no pasa';
});

caso('R1', 'verify sin userName se rechaza', async () => {
  const r = await http('PATCH', '/login/verify', { body: { codigo: '123456' } });
  esperar(r.status === 400, `status ${r.status}`);
  return '400';
});

caso('H-03', 'recuperación con usuario inexistente responde igual que con uno real', async () => {
  const r = await http('POST', '/login/usuario/recuperar/acceso', { body: { userName: `nadie.${Date.now()}@dashcam.test` } });
  esperar(r.status === 200 || r.status === 201, `status ${r.status}`);
  esperar(!/no encontrado/i.test(JSON.stringify(r.body)), 'revela que el usuario no existe');
  return `${r.status} genérico`;
});

caso('H-03', 'reset sin token Bearer se rechaza aunque traiga código', async () => {
  const u = await crearUsuario();
  const r = await http('POST', '/login/cambiar/accesso', { body: { userName: u.userName, codigo: '123456', password: 'Nueva-Clave-2026!' } });
  esperar(r.status === 401, `status ${r.status}`);
  return '401';
});

caso('H-03', 'el token de reset sirve una sola vez', async () => {
  const u = await crearUsuario();
  const token = firmarProposito({ id: u.id, email: u.userName, typ: 'pwd_reset', tv: 0 });
  const body = { userName: u.userName, password: 'Nueva-Clave-2026!' };
  const r1 = await http('POST', '/login/cambiar/accesso', { body, token });
  esperar(r1.status === 200 || r1.status === 201, `primer uso ${r1.status} ${JSON.stringify(r1.body)}`);
  const r2 = await http('POST', '/login/cambiar/accesso', { body: { ...body, password: 'Otra-Clave-2026!' }, token });
  esperar(r2.status === 401, `segundo uso ${r2.status}`);
  return `1º ${r1.status}, 2º ${r2.status}`;
});

caso('H-03', 'un token de reset sin tv (emitido antes) no sirve', async () => {
  const u = await crearUsuario();
  const token = firmarProposito({ id: u.id, email: u.userName, typ: 'pwd_reset' });
  const r = await http('POST', '/login/cambiar/accesso', { body: { userName: u.userName, password: 'Nueva-Clave-2026!' }, token });
  esperar(r.status === 401, `status ${r.status}`);
  return '401';
});

caso('H-03', 'el token de reset de A no cambia la contraseña de B', async () => {
  const a = await crearUsuario();
  const b = await crearUsuario();
  const token = firmarProposito({ id: a.id, email: a.userName, typ: 'pwd_reset', tv: 0 });
  const r = await http('POST', '/login/cambiar/accesso', { body: { userName: b.userName, password: 'Nueva-Clave-2026!' }, token });
  esperar(r.status === 403, `status ${r.status}`);
  return '403';
});

// Anti-enumeración en la recuperación: la respuesta no distingue si el usuario existe.
const mensaje = (r) => (typeof r.body === 'string' ? r.body : r.body?.message ?? JSON.stringify(r.body));

caso('H-03', 'cambiar/accesso sin Bearer: misma respuesta con usuario existente e inexistente', async () => {
  const u = await crearUsuario();
  const body = (userName) => ({ userName, password: 'Nueva-Clave-2026!' });
  const real = await http('POST', '/login/cambiar/accesso', { body: body(u.userName) });
  const falso = await http('POST', '/login/cambiar/accesso', { body: body(`nadie.${Date.now()}@dashcam.test`) });
  esperar(real.status === falso.status, `status existente ${real.status} vs inexistente ${falso.status}`);
  esperar(mensaje(real) === mensaje(falso), `mensajes distintos: "${mensaje(real)}" vs "${mensaje(falso)}"`);
  esperar(real.status === 401 && /Token inválido o expirado/.test(mensaje(real)), `${real.status} "${mensaje(real)}"`);
  return `${real.status} "${mensaje(real)}" en ambos`;
});

caso('H-03', 'verify: usuario inexistente y existente con código erróneo responden igual', async () => {
  const u = await crearUsuario({ confirmado: 0 });
  await sembrarOtp(u, CONFIRMACION, '246810');
  const real = await http('PATCH', '/login/verify', { body: { userName: u.userName, codigo: '135791' } });
  const falso = await http('PATCH', '/login/verify', { body: { userName: `nadie.${Date.now()}@dashcam.test`, codigo: '135791' } });
  esperar(real.status === falso.status, `status existente ${real.status} vs inexistente ${falso.status}`);
  esperar(mensaje(real) === mensaje(falso), `mensajes distintos: "${mensaje(real)}" vs "${mensaje(falso)}"`);
  esperar(real.status >= 400 && real.status < 500, `status ${real.status}`);
  return `${real.status} "${mensaje(real)}" en ambos`;
});
