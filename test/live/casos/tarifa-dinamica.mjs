// D-15 / V2-06: tarifa dinámica (abierta o por estaciones) cobra al bajar.
//  - Lectura repetida al subir (< 1 min, mismo viaje): no cobra ni abre otro viaje.
//    Si una lectura posterior es bajada, nuevo abordaje o transbordo depende del
//    tiempo entre lecturas y del tipo de tarifa (regla de negocio); no se prueba aquí.
//  - Dos taps simultáneos sobre una ABIERTA: un solo cobro.
// Necesitan un viaje con tarifa dinámica en la BD (viajeAbiertoDinamico); si no hay, se omiten.
import { caso, crearMonedero, crearUsuario, esperar, http, login, omitir, q, uid, viajeAbiertoDinamico } from '../harness.mjs';

const SIN_DATOS = 'no hay viaje con tarifa abierta/estaciones, recorrido y validador activo (ver README: variante "QA E2E Abierta")';
const SALDO = 500;

let fixture;
async function preparar() {
  if (fixture !== undefined) return fixture;
  const v = await viajeAbiertoDinamico();
  fixture = v ? { ...v, token: await login(await crearUsuario({ rol: 2, cliente: v.cliente })) } : null;
  return fixture;
}

const tap = (f, serie, punto, headers = {}) =>
  http('POST', '/transacciones/debito', {
    token: f.token,
    headers,
    body: {
      latitud: punto.lat,
      longitud: punto.lng,
      numeroSerieMonedero: serie,
      numeroSerieValidador: f.validador,
      idViaje: f.idViaje,
      esQR: true,
      esMultiple: false,
      cantidadPasajes: 1,
      claveIdempotencia: uid(),
    },
  });

const ok2xx = (r) => r.status === 200 || r.status === 201;
const saldo = async (serie) => Number((await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]))[0].Saldo);
const abiertas = async (serie) =>
  Number((await q('SELECT COUNT(*) n FROM TransaccionesDebito WHERE NumeroSerieMonedero = ? AND ControlTransaccion = 1', [serie]))[0].n);
// La API exige ≥ 1 min entre subir y bajar: se simula el tiempo de viaje atrasando el inicio.
const viajar = (serie, min = 5) =>
  q(
    `UPDATE TransaccionesDebito SET FechaHoraInicio = FechaHoraInicio - INTERVAL ? MINUTE
      WHERE NumeroSerieMonedero = ? AND ControlTransaccion = 1`,
    [min, serie],
  );
const r2 = (x) => Math.round(x * 100) / 100;

/** Sube y deja el viaje listo para bajar (5 min después). */
async function subir(f, serie) {
  const r = await tap(f, serie, f.sube);
  esperar(ok2xx(r), `subir → ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  esperar((await abiertas(serie)) === 1, 'al subir no quedó una ABIERTA');
  await viajar(serie);
}

caso('D-15', 'tarifa dinámica: lectura repetida al subir (< 1 min, mismo viaje) no cobra ni abre otro viaje', async () => {
  const f = await preparar();
  if (!f) omitir(SIN_DATOS);
  const serie = await crearMonedero({ cliente: f.cliente, saldo: SALDO });
  const sube = await tap(f, serie, f.sube);
  esperar(ok2xx(sube), `subir → ${sube.status} ${JSON.stringify(sube.body).slice(0, 200)}`);
  const otra = await tap(f, serie, f.sube);
  esperar(ok2xx(otra), `2.ª lectura → ${otra.status} ${JSON.stringify(otra.body).slice(0, 200)}`);
  const s1 = await saldo(serie);
  const quedan = await abiertas(serie);
  esperar(s1 === SALDO, `la lectura repetida cobró ${r2(SALDO - s1)}`);
  esperar(quedan === 1, `quedaron ${quedan} ABIERTA (se esperaba 1)`);
  return `2.ª lectura ${otra.status} sin cobro; 1 ABIERTA`;
});

caso('V2-06', 'tarifa dinámica: dos taps simultáneos sobre una ABIERTA cobran una sola vez', async () => {
  const f = await preparar();
  if (!f) omitir(SIN_DATOS);
  // Referencia: el mismo recorrido con un solo tap de bajada, en otro monedero.
  const ref = await crearMonedero({ cliente: f.cliente, saldo: SALDO });
  await subir(f, ref);
  const rb = await tap(f, ref, f.baja);
  esperar(ok2xx(rb), `bajada de referencia → ${rb.status} ${JSON.stringify(rb.body).slice(0, 200)}`);
  const esperado = r2(SALDO - (await saldo(ref)));
  esperar(esperado > 0, 'la bajada de referencia no cobró');

  const serie = await crearMonedero({ cliente: f.cliente, saldo: SALDO });
  await subir(f, serie);
  const rs = await Promise.all([
    tap(f, serie, f.baja, { 'x-forwarded-for': '10.253.0.1' }),
    tap(f, serie, f.baja, { 'x-forwarded-for': '10.253.0.2' }),
  ]);
  const cobrado = r2(SALDO - (await saldo(serie)));
  const quedan = await abiertas(serie);
  const estados = rs.map((r) => r.status).join(',');
  esperar(cobrado === esperado, `cobrado ${cobrado}, esperado ${esperado} (estados ${estados})`);
  esperar(quedan === 0, `quedó ${quedan} ABIERTA tras los dos taps (estados ${estados})`);
  return `un cobro de ${cobrado} (referencia ${esperado}); estados ${estados}`;
});
