// Dinero en débito: H-08 (concurrencia por monedero), V2-15 (clave de otro monedero), V2-16 (histórico).
import { caso, crearMonedero, crearUsuario, esperar, http, login, q, uid, viajeAbierto } from '../harness.mjs';

// Viaje abierto de prueba (tarifa FIJA) del cliente 6 y un validador activo del mismo cliente.
const CLIENTE_DEBITO = 6;
let fixture;
async function preparar() {
  if (fixture) return fixture;
  const v = await viajeAbierto(CLIENTE_DEBITO);
  const adm = await crearUsuario({ rol: 2, cliente: CLIENTE_DEBITO });
  fixture = { ...v, token: await login(adm) };
  return fixture;
}

const debito = (f, serie, clave) => ({
  latitud: 21.1619,
  longitud: -86.8515,
  numeroSerieMonedero: serie,
  numeroSerieValidador: f.validador,
  idViaje: Number(f.idViaje),
  esQR: true,
  claveIdempotencia: clave,
});

const saldo = async (serie) => Number((await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]))[0].Saldo);

caso('DEB', 'un débito simple cobra la tarifa', async () => {
  const f = await preparar();
  const serie = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: 100 });
  const r = await http('POST', '/transacciones/debito', { body: debito(f, serie, uid()), token: f.token });
  esperar(r.status === 201 || r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  const s = await saldo(serie);
  esperar(s === 100 - f.tarifa, `saldo ${s}`);
  return `saldo ${s}`;
});

caso('H-08', '5 débitos en paralelo con la misma clave cobran una sola vez', async () => {
  const f = await preparar();
  const serie = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: 100 });
  const clave = uid();
  const rs = await Promise.all(Array.from({ length: 5 }, () => http('POST', '/transacciones/debito', { body: debito(f, serie, clave), token: f.token })));
  const [{ n }] = await q('SELECT COUNT(*) n FROM TransaccionesDebito WHERE NumeroSerieMonedero = ?', [serie]);
  const s = await saldo(serie);
  esperar(Number(n) === 1 && s === 100 - f.tarifa, `${n} débitos, saldo ${s}, estados ${rs.map((r) => r.status).join(',')}`);
  return `1 débito, saldo ${s}, estados ${rs.map((r) => r.status).join(',')}`;
});

caso('H-08', '5 débitos en paralelo con claves distintas: lo cobrado cuadra con el saldo y nunca sobregira', async () => {
  const f = await preparar();
  const inicial = 2 * f.tarifa + 10;
  const serie = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: inicial });
  const rs = await Promise.all(Array.from({ length: 5 }, () => http('POST', '/transacciones/debito', { body: debito(f, serie, uid()), token: f.token })));
  const ok = rs.filter((r) => r.status === 201 || r.status === 200).length;
  const s = await saldo(serie);
  // Los débitos seguidos pueden llevar descuento de transbordo: se compara contra lo cobrado, no contra la tarifa.
  const [{ cobrado, n }] = await q(
    'SELECT COALESCE(SUM(Monto), 0) cobrado, COUNT(*) n FROM TransaccionesDebito WHERE NumeroSerieMonedero = ? AND IdTipoTransaccion = 2',
    [serie],
  );
  esperar(s >= 0, `saldo negativo ${s}`);
  esperar(Math.abs(inicial - Number(cobrado) - s) < 0.01, `inicial ${inicial} - cobrado ${cobrado} != saldo ${s}`);
  esperar(Number(n) === ok, `${ok} aprobados pero ${n} débitos`);
  return `${ok} aprobados, cobrado ${cobrado}, saldo ${s}`;
});

caso('V2-15', 'la clave de un débito de otro monedero da 409', async () => {
  const f = await preparar();
  const a = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: 100 });
  const b = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: 100 });
  const clave = uid();
  await http('POST', '/transacciones/debito', { body: debito(f, a, clave), token: f.token });
  const r = await http('POST', '/transacciones/debito', { body: debito(f, b, clave), token: f.token });
  esperar(r.status === 409, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return '409';
});

caso('V2-16', 'el rechazo se historiza como fila nueva con IdTransaccionOrigen', async () => {
  const f = await preparar();
  const serie = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: 1 });
  const [{ antes }] = await q('SELECT COUNT(*) antes FROM HistoricoTransaccionesDebito');
  const r = await http('POST', '/transacciones/debito', { body: debito(f, serie, uid()), token: f.token });
  esperar(r.status >= 400, `un débito sin saldo dio ${r.status}`);
  const [viva] = await q('SELECT Id FROM TransaccionesDebito WHERE NumeroSerieMonedero = ? ORDER BY Id DESC LIMIT 1', [serie]);
  esperar(viva, 'no se guardó la transacción rechazada');
  const [{ despues }] = await q('SELECT COUNT(*) despues FROM HistoricoTransaccionesDebito');
  const hist = await q('SELECT Id FROM HistoricoTransaccionesDebito WHERE IdTransaccionOrigen = ?', [viva.Id]);
  esperar(Number(despues) === Number(antes) + 1 && hist.length === 1, `histórico ${antes}→${despues}, con origen ${hist.length}`);
  return `histórico +1, origen ${viva.Id}`;
});

// WP-1.6: criterios de concurrencia del núcleo de dinero.
const ok2xx = (r) => r.status === 200 || r.status === 201;
// IP distinta por petición paralela: aquí se prueba el bloqueo por monedero, no el throttler.
const ipParalela = (i) => ({ 'x-forwarded-for': `10.252.${Math.floor(i / 250)}.${(i % 250) + 1}` });

caso('H-08', '15 débitos en paralelo con saldo para uno: exactamente 1 aceptado y el saldo nunca es negativo', async () => {
  const f = await preparar();
  const inicial = f.tarifa;
  const serie = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: inicial });
  const rs = await Promise.all(Array.from({ length: 15 }, (_, i) =>
    http('POST', '/transacciones/debito', { body: debito(f, serie, uid()), token: f.token, headers: ipParalela(i) })));
  const aceptados = rs.filter(ok2xx).length;
  const s = await saldo(serie);
  const [{ cobrado, n }] = await q(
    'SELECT COALESCE(SUM(Monto), 0) cobrado, COUNT(*) n FROM TransaccionesDebito WHERE NumeroSerieMonedero = ? AND IdTipoTransaccion = 2 AND Monto > 0',
    [serie],
  );
  const estados = rs.map((r) => r.status).sort().join(',');
  esperar(s >= 0, `saldo negativo ${s} (estados ${estados})`);
  esperar(aceptados === 1 && Number(n) === 1, `${aceptados} aceptados y ${n} débitos con cobro (estados ${estados})`);
  esperar(Math.abs(inicial - Number(cobrado) - s) < 0.01, `inicial ${inicial} - cobrado ${cobrado} != saldo ${s}`);
  return `1 de 15 aceptado, saldo ${s}, estados ${estados}`;
});

caso('H-08', 'recargas en efectivo y débitos simultáneos sobre el mismo monedero no pierden actualizaciones', async () => {
  const f = await preparar();
  const inicial = 10 * f.tarifa;
  const serie = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: inicial });
  const recarga = () => ({ idTipoTransaccion: 1, monto: 7, numeroSerieMonedero: serie, idMetodoPago: 1, claveIdempotencia: uid() });
  const ops = [];
  for (let i = 0; i < 5; i++) {
    ops.push(http('POST', '/transacciones/recarga', { body: recarga(), token: f.token, headers: ipParalela(2 * i) }));
    ops.push(http('POST', '/transacciones/debito', { body: debito(f, serie, uid()), token: f.token, headers: ipParalela(2 * i + 1) }));
  }
  const rs = await Promise.all(ops);
  const recargas = rs.filter((_, i) => i % 2 === 0);
  const estados = rs.map((r) => r.status).join(',');
  esperar(recargas.every(ok2xx), `recargas ${recargas.map((r) => r.status).join(',')} ${JSON.stringify(recargas.find((r) => !ok2xx(r))?.body).slice(0, 200)}`);
  const [{ recargado }] = await q('SELECT COALESCE(SUM(Monto), 0) recargado FROM TransaccionesRecarga WHERE NumeroSerieMonedero = ?', [serie]);
  const [{ cobrado, n }] = await q(
    'SELECT COALESCE(SUM(Monto), 0) cobrado, COUNT(*) n FROM TransaccionesDebito WHERE NumeroSerieMonedero = ? AND IdTipoTransaccion = 2',
    [serie],
  );
  const s = await saldo(serie);
  esperar(Number(recargado) === 35, `recargado ${recargado} (esperado 35)`);
  esperar(Math.abs(inicial + Number(recargado) - Number(cobrado) - s) < 0.01,
    `lost-update: inicial ${inicial} + recargado ${recargado} - cobrado ${cobrado} != saldo ${s} (estados ${estados})`);
  return `inicial ${inicial} + 35 - ${cobrado} (${n} débitos) = saldo ${s}`;
});
