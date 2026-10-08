// Arnés de pruebas en vivo (WP-0.2): ataca la API corriendo y verifica en la BD.
// Uso: npm run test:live            (API en LIVE_API_URL, por defecto http://localhost:3000)
//      npm run test:live -- R1 H-03 (solo esos grupos)
// Crea usuarios QA con prefijo qa.rem. en el cliente LIVE_CLIENTE_ID y los borra al final.
import { createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

export const API = process.env.LIVE_API_URL || 'http://localhost:3000';
export const CLIENTE = Number(process.env.LIVE_CLIENTE_ID || 4);
export const PASSWORD = 'Qa-Remediacion-2026!';
export const RUN = Date.now().toString(36);

export const db = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  connectionLimit: 4,
  timezone: 'Z',
});

export async function q(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

export async function http(method, path, { body, token, headers = {} } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ipCaso,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const creados = [];
// IP simulada por caso: el throttler cuenta por IP (trust proxy 1) y los casos no deben estorbarse.
let ipCaso = '10.250.0.1';

/** Usuario QA confirmado y activo. rol 9 = pasajero, 2 = administrador, 3 = operador. */
export async function crearUsuario({ rol = 9, cliente = CLIENTE, confirmado = 1, sufijo = '' } = {}) {
  const userName = `qa.rem.${RUN}.${rol}${sufijo}.${creados.length}@dashcam.test`;
  const hash = await bcrypt.hash(PASSWORD, 10);
  const r = await q(
    `INSERT INTO Usuarios (UserName, PasswordHash, EmailConfirmado, Nombre, ApellidoPaterno, IdRol, IdCliente, Estatus)
     VALUES (?, ?, ?, 'QA', 'Remediacion', ?, ?, 1)`,
    [userName, hash, confirmado, rol, cliente],
  );
  const u = { id: Number(r.insertId), userName, rol, cliente };
  creados.push(u.id);
  return u;
}

const monederos = [];

/** Monedero QA activo con saldo dado, en el cliente indicado. */
export async function crearMonedero({ cliente = CLIENTE, saldo = 0 } = {}) {
  const serie = `QA-REM-${RUN}-${monederos.length}`.toUpperCase();
  await q(
    `INSERT INTO Monederos (NumeroSerie, Saldo, FechaActivacion, Estatus, IdCliente, EsVirtual)
     VALUES (?, ?, UTC_TIMESTAMP(), 1, ?, 1)`,
    [serie, saldo, cliente],
  );
  monederos.push(serie);
  return serie;
}

/** Pasajero QA (usuario rol 9 + fila en Pasajeros) del cliente indicado. */
export async function crearPasajero({ cliente = CLIENTE } = {}) {
  const u = await crearUsuario({ rol: 9, cliente, sufijo: 'p' });
  const r = await q(
    `INSERT INTO Pasajeros (Nombre, ApellidoPaterno, FechaNacimiento, Correo, Estatus, IdUsuario)
     VALUES ('QA', 'Pasajero', '1990-01-01', ?, 1, ?)`,
    [u.userName, u.id],
  );
  return { ...u, idPasajero: Number(r.insertId) };
}

export async function login(u) {
  const r = await http('POST', '/login', { body: { userName: u.userName, password: PASSWORD } });
  if (r.status >= 300) throw new Error(`login ${u.userName} → ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.token ?? r.body.data?.token;
}

export function hashOtp(idUsuario, tipo, codigo) {
  return createHmac('sha256', process.env.OTP_PEPPER)
    .update(`${idUsuario}:${tipo}:${codigo}`)
    .digest('hex');
}

export function firmarProposito(payload, opts = {}) {
  return jwt.sign(payload, process.env.JWT_PURPOSE_SECRET, { algorithm: 'HS256', expiresIn: '15m', ...opts });
}

const viajesQA = [];

/**
 * Viaje abierto de prueba con tarifa fija: el débito ya no cobra en viajes
 * cerrados. Copia turno, operador y variante del último viaje con tarifa fija
 * activa del cliente y se borra en limpiar().
 */
export async function viajeAbierto(cliente) {
  const [base] = await q(
    `SELECT v.IdTurno, v.IdOperador, v.IdVariante, t.TarifaBase tarifa,
            (SELECT d.NumeroSerie FROM Validadores d WHERE d.IdCliente = v.IdCliente AND d.Estatus = 1 LIMIT 1) validador
       FROM Viajes v JOIN Tarifas t ON t.IdVariante = v.IdVariante AND t.Estatus = 1 AND t.TipoTarifa = 1
      WHERE v.IdCliente = ? ORDER BY v.Id DESC LIMIT 1`,
    [cliente],
  );
  if (!base?.validador) throw new Error(`no hay viaje con tarifa fija y validador en el cliente ${cliente}`);
  const r = await q(
    `INSERT INTO Viajes (Inicio, EstadoActual, Estatus, IdCliente, IdTurno, IdOperador, IdVariante)
     VALUES (UTC_TIMESTAMP(), 1, 1, ?, ?, ?, ?)`,
    [cliente, base.IdTurno, base.IdOperador, base.IdVariante],
  );
  viajesQA.push(Number(r.insertId));
  return { idViaje: Number(r.insertId), tarifa: Number(base.tarifa), validador: base.validador };
}

export async function limpiar() {
  if (monederos.length) {
    const series = monederos.map(() => '?').join(',');
    for (const sql of [
      `DELETE FROM ReservasRecarga WHERE NumeroSerieMonedero IN (${series})`,
      `DELETE FROM HistoricoTransaccionesRecarga WHERE NumeroSerieMonedero IN (${series})`,
      `DELETE FROM TransaccionesRecarga WHERE NumeroSerieMonedero IN (${series})`,
      `DELETE h FROM HistoricoTransaccionesDebito h JOIN TransaccionesDebito t ON t.Id = h.IdTransaccionOrigen WHERE t.NumeroSerieMonedero IN (${series})`,
      `DELETE FROM HistoricoTransaccionesDebito WHERE NumeroSerieMonedero IN (${series})`,
      `DELETE FROM TransaccionesDebito WHERE NumeroSerieMonedero IN (${series})`,
      `DELETE FROM Monederos WHERE NumeroSerie IN (${series})`,
    ]) {
      try { await q(sql, monederos); } catch (e) { console.warn('limpieza:', e.message); }
    }
  }
  if (viajesQA.length) {
    const ids = viajesQA.join(',');
    for (const sql of [`DELETE FROM ViajesTransacciones WHERE IdViaje IN (${ids})`, `DELETE FROM Viajes WHERE Id IN (${ids})`]) {
      try { await q(sql); } catch (e) { console.warn('limpieza:', e.message); }
    }
  }
  // También los usuarios QA que crearon los casos a través de la API.
  const viaApi = await q('SELECT Id FROM Usuarios WHERE UserName LIKE ?', [`qa.rem.${RUN}.%`]);
  for (const { Id } of viaApi) if (!creados.includes(Number(Id))) creados.push(Number(Id));
  if (!creados.length) return;
  const ids = creados.join(',');
  for (const sql of [
    `DELETE FROM RefreshSessions WHERE IdUsuario IN (${ids})`,
    `DELETE FROM CodigoAutenticacion WHERE IdUsuario IN (${ids})`,
    `DELETE FROM UsuariosPermisos WHERE IdUsuario IN (${ids})`,
    `DELETE FROM ConnectedUsers WHERE IdUsuario IN (${ids})`,
    `DELETE q FROM QRCodes q JOIN Pasajeros p ON p.Id = q.IdPasajero WHERE p.IdUsuario IN (${ids})`,
    `DELETE FROM Pasajeros WHERE IdUsuario IN (${ids})`,
    `DELETE FROM Usuarios WHERE Id IN (${ids})`,
  ]) {
    try { await q(sql); } catch (e) { console.warn('limpieza:', e.message); }
  }
}

// ---- runner ----
const casos = [];
export function caso(grupo, nombre, fn) { casos.push({ grupo, nombre, fn }); }
export function esperar(cond, msg) { if (!cond) throw new Error(msg); }

export async function correr() {
  const filtro = process.argv.slice(2);
  const sel = casos.filter((c) => !filtro.length || filtro.includes(c.grupo));
  const resultados = [];
  for (const [i, c] of sel.entries()) {
    ipCaso = `10.250.${Math.floor(i / 250)}.${(i % 250) + 1}`;
    const t0 = Date.now();
    try {
      const detalle = await c.fn();
      resultados.push({ grupo: c.grupo, nombre: c.nombre, ok: true, ms: Date.now() - t0, detalle: detalle ?? '' });
      console.log(`  ✔ [${c.grupo}] ${c.nombre}`);
    } catch (e) {
      resultados.push({ grupo: c.grupo, nombre: c.nombre, ok: false, ms: Date.now() - t0, detalle: e.message });
      console.log(`  ✘ [${c.grupo}] ${c.nombre}\n      ${e.message}`);
    }
  }
  await limpiar();
  await db.end();
  const ok = resultados.filter((r) => r.ok).length;
  console.log(`\n${ok}/${resultados.length} casos en verde`);
  writeFileSync(new URL('./last-run.json', import.meta.url), JSON.stringify({ fecha: new Date().toISOString(), api: API, resultados }, null, 2));
  process.exitCode = ok === resultados.length ? 0 : 1;
}

export const uid = () => randomUUID();
