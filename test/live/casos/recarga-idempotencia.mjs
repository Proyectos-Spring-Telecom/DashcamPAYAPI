// R3 / V2-15: clave de idempotencia reservada antes de cobrar. R2: bitácora tras el COMMIT.
import { caso, crearMonedero, crearUsuario, esperar, http, login, q, uid } from '../harness.mjs';

const recarga = (serie, monto, clave) => ({
  idTipoTransaccion: 1,
  monto,
  numeroSerieMonedero: serie,
  idMetodoPago: 1,
  claveIdempotencia: clave,
});

caso('R3', '5 recargas en paralelo con la misma clave acreditan una sola vez', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const serie = await crearMonedero();
  const clave = uid();
  const rs = await Promise.all(
    Array.from({ length: 5 }, () => http('POST', '/transacciones/recarga', { body: recarga(serie, 50, clave), token })),
  );
  const estados = rs.map((r) => r.status).sort().join(',');
  esperar(rs.every((r) => [200, 201, 409].includes(r.status)), `estados ${estados} ${JSON.stringify(rs.find((r) => r.status >= 400 && r.status !== 409)?.body)}`);
  const [{ n }] = await q('SELECT COUNT(*) n FROM TransaccionesRecarga WHERE NumeroSerieMonedero = ?', [serie]);
  const [{ Saldo }] = await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]);
  const [res] = await q('SELECT Estado FROM ReservasRecarga WHERE ClaveIdempotencia = ?', [clave]);
  esperar(Number(n) === 1, `${n} recargas creadas`);
  esperar(Number(Saldo) === 50, `saldo ${Saldo}`);
  esperar(res?.Estado === 'COMPLETADA', `reserva ${res?.Estado}`);
  return `estados ${estados}; 1 recarga, saldo 50, reserva COMPLETADA`;
});

caso('R3', 'la misma clave con otro monto se rechaza (409) y no acredita', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const serie = await crearMonedero();
  const clave = uid();
  const r1 = await http('POST', '/transacciones/recarga', { body: recarga(serie, 20, clave), token });
  esperar(r1.status === 201 || r1.status === 200, `primera ${r1.status} ${JSON.stringify(r1.body)}`);
  const r2 = await http('POST', '/transacciones/recarga', { body: recarga(serie, 999, clave), token });
  esperar(r2.status === 409, `segunda ${r2.status}`);
  const [{ Saldo }] = await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]);
  esperar(Number(Saldo) === 20, `saldo ${Saldo}`);
  return '409; saldo 20';
});

caso('V2-15', 'la clave de la recarga de otro monedero no devuelve esa recarga', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const a = await crearMonedero();
  const b = await crearMonedero();
  const clave = uid();
  await http('POST', '/transacciones/recarga', { body: recarga(a, 30, clave), token });
  const r = await http('POST', '/transacciones/recarga', { body: recarga(b, 30, clave), token });
  esperar(r.status === 409, `status ${r.status} ${JSON.stringify(r.body)}`);
  return '409';
});

caso('R3', 'si la recarga falla antes de cobrar, la clave se libera', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const clave = uid();
  const r = await http('POST', '/transacciones/recarga', { body: recarga('NO-EXISTE-QA', 10, clave), token });
  esperar(r.status >= 400, `status ${r.status}`);
  const filas = await q('SELECT 1 FROM ReservasRecarga WHERE ClaveIdempotencia = ?', [clave]);
  esperar(filas.length === 0, 'la reserva quedó tomada');
  return `${r.status}; reserva liberada`;
});

caso('R2', '10 recargas en paralelo terminan y la bitácora llega después del COMMIT', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const serie = await crearMonedero();
  const t0 = Date.now();
  const rs = await Promise.all(
    Array.from({ length: 10 }, () => http('POST', '/transacciones/recarga', { body: recarga(serie, 5, uid()), token })),
  );
  const ms = Date.now() - t0;
  esperar(rs.every((r) => r.status === 201 || r.status === 200), `estados ${rs.map((r) => r.status).join(',')}`);
  const [{ Saldo }] = await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]);
  esperar(Number(Saldo) === 50, `saldo ${Saldo}`);
  let n = 0;
  for (let i = 0; i < 20 && n < 10; i++) {
    [{ n }] = await q(
      `SELECT COUNT(*) n FROM Bitacora WHERE Modulo = 'Monederos' AND Descripcion LIKE ? AND FechaCreacion >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`,
      [`Incremento atómico%${serie}%`],
    );
    n = Number(n);
    if (n < 10) await new Promise((r) => setTimeout(r, 250));
  }
  esperar(n === 10, `${n}/10 registros de bitácora`);
  return `10 en ${ms} ms; saldo 50; 10 registros de bitácora`;
});
