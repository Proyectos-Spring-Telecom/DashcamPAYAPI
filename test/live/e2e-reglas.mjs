// Reglas de operación sobre el cliente de la prueba E2E (cliente 7):
//  - el validador no cierra un turno con un viaje activo,
//  - no se cobra en un viaje cerrado,
//  - el cobro usa la tarifa activa y una variante tiene una sola tarifa activa,
//  - /dashboard/kpi y /permisos/permisosAgrupados responden (sin nombre de base fijo).
//   npx dotenvx run -q -- node test/live/e2e-reglas.mjs
import { randomUUID } from 'node:crypto';
import { PASSWORD, db, http, q } from './harness.mjs';

const VALIDADOR = 'QAE2E-VAL-0001';
const ip = (n) => ({ 'X-Forwarded-For': `10.4.4.${n}` });
const login = async (userName, extra = {}, n = 1) =>
  (await http('POST', '/login', { body: { userName, password: PASSWORD, ...extra }, headers: ip(n) })).body.token;
const op = await login('qa.e2e.operador@dashcam.test', { validadorId: VALIDADOR }, 1);
const adm = await login('qa.e2e.admin@dashcam.test', {}, 2);

const resultados = [];
const check = (nombre, ok, detalle) => resultados.push({ nombre, ok, detalle });
const msg = (r) => `${r.status} ${typeof r.body === 'object' ? r.body?.message ?? '' : r.body}`;

const [ab] = await q("SELECT va.Id, t.Id idTarifa FROM Variantes va JOIN Tarifas t ON t.IdVariante = va.Id WHERE va.Nombre = 'QA E2E Abierta' AND t.Estatus = 1");
const [es] = await q("SELECT va.Id, t.Id idTarifa FROM Variantes va JOIN Tarifas t ON t.IdVariante = va.Id WHERE va.Nombre = 'QA E2E Estaciones' AND t.Estatus = 1");

// Turno abierto del validador (se abre si no hay).
await http('POST', '/turnos', { token: op, body: { numeroSerieValidador: VALIDADOR } });
const [turno] = await q(
  `SELECT t.Id FROM Turnos t JOIN Instalaciones i ON i.Id = t.IdInstalacion JOIN Validadores v ON v.Id = i.IdValidador
    WHERE v.NumeroSerie = ? AND t.Fin IS NULL ORDER BY t.Id DESC LIMIT 1`,
  [VALIDADOR],
);
const idTurno = Number(turno.Id);
const abrirViaje = async (idVariante) => {
  const r = await http('POST', '/viajes', { token: op, body: { idTurno, idVariante: Number(idVariante) } });
  const [v] = await q('SELECT Id FROM Viajes WHERE IdTurno = ? ORDER BY Id DESC LIMIT 1', [idTurno]);
  return { r, id: Number(v.Id) };
};
const monedero = async () => {
  const serie = `QAE2E-REG-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e4)}`;
  await q(`INSERT INTO Monederos (NumeroSerie, Saldo, FechaActivacion, Estatus, IdCliente, EsVirtual, IdCard)
           VALUES (?, 200, UTC_TIMESTAMP(), 1, 7, 0, ?)`, [serie, `CARD-${serie}`]);
  return serie;
};
const cobrar = (serie, idViaje) =>
  http('POST', '/transacciones/debito', {
    token: op,
    body: { latitud: 21.1084222, longitud: -86.8943401, numeroSerieValidador: VALIDADOR, idViaje,
      esQR: false, esMultiple: false, cantidadPasajes: 0, idCard: `CARD-${serie}`, claveIdempotencia: randomUUID() },
  });

// 1) Turno con viaje activo no se cierra.
const v1 = await abrirViaje(ab.Id);
const cierreValidador = await http('PATCH', `/turnos/${idTurno}`, { token: op, body: { numeroSerieValidador: VALIDADOR } });
check('Validador: cerrar turno con viaje activo se rechaza', cierreValidador.status === 400, msg(cierreValidador));

// 2) No se cobra en un viaje cerrado.
await http('PATCH', `/viajes/${v1.id}`, { token: op, body: {} });
const s1 = await monedero();
const enCerrado = await cobrar(s1, v1.id);
check('Cobro en viaje cerrado se rechaza', enCerrado.status === 400, msg(enCerrado));

// 3) Tarifa inactiva: no se cobra; una sola tarifa activa por variante.
const dup = await http('POST', '/tarifas', {
  token: adm,
  body: { tarifaBase: 9, idTipoTarifa: 3, costoPorEstacion: 2, cantidadEstacionesBase: 1, estatus: 1, idVariante: Number(es.Id) },
});
check('Crear una 2.ª tarifa activa en la variante se rechaza', dup.status === 400, msg(dup));
const off = await http('PATCH', `/tarifas/estatus/${es.idTarifa}`, { token: adm, body: { estatus: 0 } });
const v2 = await abrirViaje(es.Id);
const s2 = await monedero();
const sinTarifa = await cobrar(s2, v2.id);
check('Cobro con la tarifa de la variante desactivada se rechaza', off.status < 300 && sinTarifa.status === 400, `desactivar ${off.status}; cobro ${msg(sinTarifa)}`);
const on = await http('PATCH', `/tarifas/estatus/${es.idTarifa}`, { token: adm, body: { estatus: 1 } });
const conTarifa = await cobrar(s2, v2.id);
check('Reactivada la tarifa, el cobro pasa', on.status < 300 && conTarifa.status < 300, `reactivar ${on.status}; cobro ${msg(conTarifa)}`);
// El cobro abrió un viaje del pasajero (tarifa por estaciones): se baja para no dejarlo abierto.
await q('UPDATE TransaccionesDebito SET FechaHoraInicio = FechaHoraInicio - INTERVAL 5 MINUTE WHERE NumeroSerieMonedero = ? AND ControlTransaccion = 1', [s2]);
await cobrar(s2, v2.id);

// 4) Cerrado el viaje, el turno sí se cierra.
await http('PATCH', `/viajes/${v2.id}`, { token: op, body: {} });
const cierreOk = await http('PATCH', `/turnos/${idTurno}`, { token: op, body: { numeroSerieValidador: VALIDADOR } });
check('Sin viajes activos el turno se cierra', cierreOk.status < 300, msg(cierreOk));

// 5) Consultas corregidas.
const kpi = await http('POST', '/dashboard/kpi', { token: adm, body: { idCliente: 7, filtro: 3 } });
check('POST /dashboard/kpi responde (Zonas en lugar de Regiones)', kpi.status < 300, `${kpi.status}`);
const permisos = await http('GET', '/permisos/permisosAgrupados', { token: adm });
check('GET /permisos/permisosAgrupados responde sin nombre de base fijo', permisos.status < 300 && Array.isArray(permisos.body), `${permisos.status}, ${Array.isArray(permisos.body) ? permisos.body.length : '?'} grupos`);

for (const r of resultados) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.nombre}\n      ${r.detalle}`);
console.log(`\n${resultados.filter((r) => r.ok).length}/${resultados.length} reglas como se esperaba`);
await db.end();
