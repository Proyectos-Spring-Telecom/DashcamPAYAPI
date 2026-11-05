// Cobros por tipo de tarifa sobre las variantes de la prueba E2E (cliente 7):
// "QA E2E Abierta" (incremental) y "QA E2E Estaciones". Hace de validador
// (operador con sesión en QAE2E-VAL-0001), calcula el monto esperado por su
// cuenta y lo compara con lo que cobró la API.
//   npx dotenvx run -q -- node test/live/e2e-tarifas.mjs
import { randomUUID } from 'node:crypto';
import { PASSWORD, db, http, q } from './harness.mjs';

const CLIENTE = 7;
const VALIDADOR = 'QAE2E-VAL-0001';
const RUN = Date.now().toString(36).toUpperCase();

// ---------- oráculo independiente (misma fórmula de distancia que haversine-distance) ----------
const R = 6378137;
const rad = (x) => (x * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const masCercano = (pts, p) => pts.reduce((best, x, i) => (dist(p, x) < dist(p, pts[best]) ? i : best), 0);
const r2 = (x) => Math.round(x * 100) / 100;

function incremental(t, metros) {
  const base = Number(t.TarifaBase);
  const baseM = Number(t.DistanciaBaseKm) * 1000;
  if (metros <= baseM) return base;
  return r2(base + Math.ceil((metros - baseM) / Number(t.IncrementoCadaMetros)) * Number(t.CostoAdicional));
}
function cobroMaximoAbierta(t, ruta, sube) {
  const i = masCercano(ruta, sube);
  let m = dist(sube, ruta[i]);
  for (let k = i; k < ruta.length - 1; k++) m += dist(ruta[k], ruta[k + 1]);
  return incremental(t, m);
}
function esperadoAbierta(t, ruta, sube, baja) {
  return Math.min(incremental(t, dist(sube, baja)), cobroMaximoAbierta(t, ruta, sube));
}
function esperadoEstaciones(t, est, sube, baja) {
  const n = Math.abs(masCercano(est, baja) - masCercano(est, sube));
  return r2(Number(t.TarifaBase) + Math.max(0, n - Number(t.CantidadEstacionesBase)) * Number(t.CostoPorEstacion));
}

// ---------- preparación ----------
const variantes = await q(
  `SELECT va.Id, va.Nombre, va.RecorridoDetallado, t.TipoTarifa, t.TarifaBase, t.DistanciaBaseKm,
          t.IncrementoCadaMetros, t.CostoAdicional, t.CostoPorEstacion, t.CantidadEstacionesBase
     FROM Variantes va JOIN Tarifas t ON t.IdVariante = va.Id AND t.Estatus = 1
    WHERE va.Nombre IN ('QA E2E Abierta', 'QA E2E Estaciones')`,
);
const V = Object.fromEntries(variantes.map((v) => [v.Nombre, v]));
const abierta = V['QA E2E Abierta'];
const estaciones = V['QA E2E Estaciones'];
// El DTO acepta hasta 7 decimales (lo que entrega un GPS); los puntos del mapa traen 15.
const gps = (p) => ({ ...p, lat: Number(p.lat.toFixed(7)), lng: Number(p.lng.toFixed(7)) });
const ruta = abierta.RecorridoDetallado.map(gps);
const est = estaciones.RecorridoDetallado.map(gps);

const l = await http('POST', '/login', {
  body: { userName: 'qa.e2e.operador@dashcam.test', password: PASSWORD, validadorId: VALIDADOR },
  headers: { 'X-Forwarded-For': '10.5.5.5' },
});
const token = l.body.token;
const t = await http('POST', '/turnos', { token, body: { numeroSerieValidador: VALIDADOR } });
const [turno] = await q(
  `SELECT t.Id FROM Turnos t JOIN Instalaciones i ON i.Id = t.IdInstalacion JOIN Validadores v ON v.Id = i.IdValidador
    WHERE v.NumeroSerie = ? AND t.Fin IS NULL ORDER BY t.Id DESC LIMIT 1`,
  [VALIDADOR],
);
console.log(`Turno ${turno?.Id} (POST /turnos → ${t.status})`);

// Un viaje activo por operador: se cierra el pendiente y cada variante abre el suyo.
const [{ IdOperador: idOperador }] = await q('SELECT IdOperador FROM Turnos WHERE Id = ?', [turno.Id]);
const pendientes = await q('SELECT Id FROM Viajes WHERE IdOperador = ? AND Estatus = 1 AND Fin IS NULL', [idOperador]);
for (const p of pendientes) {
  const r = await http('PATCH', `/viajes/${p.Id}`, { token, body: {} });
  console.log(`Viaje pendiente ${p.Id} cerrado (PATCH → ${r.status})`);
}
const viaje = {};
async function abrirViaje(v) {
  const r = await http('POST', '/viajes', { token, body: { idTurno: Number(turno.Id), idVariante: Number(v.Id) } });
  if (r.status >= 300) throw new Error(`POST /viajes → ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  const [vi] = await q('SELECT Id FROM Viajes WHERE IdTurno = ? AND IdVariante = ? ORDER BY Id DESC LIMIT 1', [turno.Id, v.Id]);
  viaje[v.Nombre] = Number(vi.Id);
  console.log(`Viaje ${vi.Id} sobre "${v.Nombre}" (POST /viajes → ${r.status})`);
}
async function cerrarViaje(v) {
  const r = await http('PATCH', `/viajes/${viaje[v.Nombre]}`, { token, body: {} });
  console.log(`Viaje ${viaje[v.Nombre]} cerrado (PATCH → ${r.status})`);
}

let nMon = 0;
async function monedero(saldo) {
  nMon++;
  const serie = `QAE2E-TAR-${RUN}-${nMon}`;
  const idCard = `CARD-${RUN}-${nMon}`;
  await q(
    `INSERT INTO Monederos (NumeroSerie, Saldo, FechaActivacion, Estatus, IdCliente, EsVirtual, IdCard)
     VALUES (?, ?, UTC_TIMESTAMP(), 1, ?, 0, ?)`,
    [serie, saldo, CLIENTE, idCard],
  );
  return { serie, idCard };
}
const saldo = async (serie) => Number((await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]))[0].Saldo);
const filas = (serie) =>
  q(
    `SELECT Id, IdTipoTransaccion tipo, ControlTransaccion ctl, Monto, CobroMaximo, DistanciaRecorrida dist
       FROM TransaccionesDebito WHERE NumeroSerieMonedero = ? ORDER BY Id`,
    [serie],
  );

async function validar(m, nombreVariante, p, { qr = false } = {}) {
  const body = {
    latitud: p.lat, longitud: p.lng, numeroSerieValidador: VALIDADOR,
    idViaje: viaje[nombreVariante], esQR: qr, esMultiple: false, cantidadPasajes: qr ? 1 : 0,
    claveIdempotencia: randomUUID(),
    ...(qr ? { numeroSerieMonedero: m.serie } : { idCard: m.idCard }),
  };
  const r = await http('POST', '/transacciones/debito', { token, body });
  if (r.status >= 300) console.log('      ', qr ? 'QR' : 'tarjeta', '→', r.status, JSON.stringify(r.body).slice(0, 200));
  return r;
}
// La API exige ≥ 1 min entre subir y bajar con tarjeta: se simula el tiempo de viaje.
const viajar = (serie, min = 5) =>
  q(
    `UPDATE TransaccionesDebito SET FechaHoraInicio = FechaHoraInicio - INTERVAL ? MINUTE
      WHERE NumeroSerieMonedero = ? AND ControlTransaccion = 1`,
    [min, serie],
  );

const resultados = [];
async function escenario(nombre, { variante, sube, baja, qr = false, saldoInicial = 200, esperado }) {
  const m = await monedero(saldoInicial);
  const r1 = await validar(m, variante, sube, { qr });
  let r2v = null;
  if (baja) {
    await viajar(m.serie);
    r2v = await validar(m, variante, baja, { qr });
  }
  const s = await saldo(m.serie);
  const fs = await filas(m.serie);
  const cobrado = r2(saldoInicial - s);
  const abiertas = fs.filter((f) => Number(f.ctl) === 1).length;
  const ok = esperado.cobrado === cobrado && esperado.abiertas === abiertas;
  resultados.push({ nombre, ok, esperado, cobrado, abiertas, sube: r1.status, baja: r2v?.status ?? '-', filas: fs });
}

// ---------- escenarios ----------
const corto = gps({ lat: ruta[0].lat - 0.0018, lng: ruta[0].lng + 0.0012 }); // ~240 m del inicio
await abrirViaje(abierta);
await escenario('Abierta · tarjeta · inicio → punto 4 de la ruta', {
  variante: 'QA E2E Abierta', sube: ruta[0], baja: ruta[3],
  esperado: { cobrado: esperadoAbierta(abierta, ruta, ruta[0], ruta[3]), abiertas: 0 },
});
await escenario('Abierta · tarjeta · viaje corto (< distancia base)', {
  variante: 'QA E2E Abierta', sube: ruta[0], baja: corto,
  esperado: { cobrado: esperadoAbierta(abierta, ruta, ruta[0], corto), abiertas: 0 },
});
await escenario('Abierta · tarjeta · punto 2 → final de la ruta', {
  variante: 'QA E2E Abierta', sube: ruta[1], baja: ruta[ruta.length - 1],
  esperado: { cobrado: esperadoAbierta(abierta, ruta, ruta[1], ruta[ruta.length - 1]), abiertas: 0 },
});
await escenario('Abierta · saldo menor al cobro máximo (se rechaza al subir)', {
  variante: 'QA E2E Abierta', sube: ruta[0], saldoInicial: 5,
  esperado: { cobrado: 0, abiertas: 0 },
});
await escenario('Abierta · QR · sube y baja con el QR', {
  variante: 'QA E2E Abierta', sube: ruta[0], baja: ruta[3], qr: true,
  esperado: { cobrado: esperadoAbierta(abierta, ruta, ruta[0], ruta[3]), abiertas: 0 },
});

// Doble validación al subir (< 1 min): no cobra ni abre un segundo viaje.
{
  const m = await monedero(200);
  const r1 = await validar(m, 'QA E2E Abierta', ruta[0]);
  const rr2 = await validar(m, 'QA E2E Abierta', ruta[0]);
  const fs = await filas(m.serie);
  const abiertas = fs.filter((f) => Number(f.ctl) === 1).length;
  const cobrado = r2(200 - (await saldo(m.serie)));
  resultados.push({
    nombre: 'Abierta · tarjeta · doble validación al subir (< 1 min)',
    ok: abiertas === 1 && cobrado === 0 && rr2.body?.message === 'Viaje ya iniciado',
    esperado: { cobrado: 0, abiertas: 1 }, cobrado, abiertas, sube: r1.status, baja: `${rr2.status} "${rr2.body?.message}"`, filas: fs,
  });
  // Se baja para no dejar el viaje abierto (lo cobraría el barrido de 4 h).
  await viajar(m.serie);
  await validar(m, 'QA E2E Abierta', ruta[1]);
}

// Olvidó validar al bajar: sube aquí y la siguiente validación es en otro camión.
const olvido = await monedero(200);
await validar(olvido, 'QA E2E Abierta', ruta[0]);
await cerrarViaje(abierta);

await abrirViaje(estaciones);
await escenario('Estaciones · tarjeta · E1 → E4 (3 estaciones)', {
  variante: 'QA E2E Estaciones', sube: est[0], baja: est[3],
  esperado: { cobrado: esperadoEstaciones(estaciones, est, est[0], est[3]), abiertas: 0 },
});
await escenario('Estaciones · tarjeta · E2 → E3 (1 estación)', {
  variante: 'QA E2E Estaciones', sube: est[1], baja: est[2],
  esperado: { cobrado: esperadoEstaciones(estaciones, est, est[1], est[2]), abiertas: 0 },
});
await escenario('Estaciones · QR · E1 → E4', {
  variante: 'QA E2E Estaciones', sube: est[0], baja: est[3], qr: true,
  esperado: { cobrado: esperadoEstaciones(estaciones, est, est[0], est[3]), abiertas: 0 },
});

// Continúa el pasajero que olvidó bajar: sube al camión de estaciones en E2.
// Se cierra su viaje anterior (tarifa abierta, de ruta[0] a E2) y se abre el nuevo;
// al bajar en E4 se cobra el tramo por estaciones.
{
  await viajar(olvido.serie);
  const r1 = await validar(olvido, 'QA E2E Estaciones', est[1]);
  await viajar(olvido.serie);
  const r2v = await validar(olvido, 'QA E2E Estaciones', est[3]);
  const fs = await filas(olvido.serie);
  const abiertas = fs.filter((f) => Number(f.ctl) === 1).length;
  const cobrado = r2(200 - (await saldo(olvido.serie)));
  const esperado = r2(esperadoAbierta(abierta, ruta, ruta[0], est[1]) + esperadoEstaciones(estaciones, est, est[1], est[3]));
  resultados.push({
    nombre: 'Olvidó bajar del camión de tarifa abierta y sube a otro (estaciones E2 → E4)',
    ok: abiertas === 0 && cobrado === esperado,
    esperado: { cobrado: esperado, abiertas: 0 }, cobrado, abiertas, sube: r1.status, baja: r2v.status, filas: fs,
  });
}

await cerrarViaje(estaciones);

// ---------- reporte ----------
console.log(`\nTarifa abierta: base $${abierta.TarifaBase}, ${abierta.DistanciaBaseKm} km incluidos, +$${abierta.CostoAdicional} cada ${abierta.IncrementoCadaMetros} m`);
console.log(`Tarifa por estaciones: base $${estaciones.TarifaBase}, ${estaciones.CantidadEstacionesBase} estación incluida, +$${estaciones.CostoPorEstacion} por estación extra (${est.length} estaciones)\n`);
for (const r of resultados) {
  console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}`);
  console.log(`      esperado $${r.esperado.cobrado} y ${r.esperado.abiertas} abiertas | cobrado $${r.cobrado} y ${r.abiertas} abiertas | sube ${r.sube}, baja ${r.baja}`);
  for (const f of r.filas) console.log(`        tx ${f.Id}: tipo ${f.tipo}, control ${f.ctl}, monto ${f.Monto}, cobroMax ${f.CobroMaximo}, dist ${f.dist}`);
}
console.log(`\n${resultados.filter((r) => r.ok).length}/${resultados.length} escenarios como se esperaba`);
await db.end();
