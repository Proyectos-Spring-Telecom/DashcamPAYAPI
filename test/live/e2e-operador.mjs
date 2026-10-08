// Recorrido del operador (lo que hace la app del Validador) sobre los datos que
// se dieron de alta desde la WebApp en la prueba E2E (cliente "QA E2E Transportes").
//   npx dotenvx run -q -- node test/live/e2e-operador.mjs
import { randomUUID } from 'node:crypto';
import { PASSWORD, db, http, q } from './harness.mjs';

const SERIE_VALIDADOR = 'QAE2E-VAL-0001';
const SERIE_MONEDERO = 'QAE2E-MON-0001';
const paso = (n, t) => console.log(`\n${n}. ${t}`);
const saldo = async () => Number((await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [SERIE_MONEDERO]))[0].Saldo);

paso(1, 'El operador inicia sesión en el validador del camión');
const l = await http('POST', '/login', {
  body: { userName: 'qa.e2e.operador@dashcam.test', password: PASSWORD, validadorId: SERIE_VALIDADOR },
});
console.log('   login →', l.status);
const token = l.body.token;
const [op] = await q('SELECT Id, ValidadorId FROM Usuarios WHERE UserName = ?', ['qa.e2e.operador@dashcam.test']);
console.log('   validador asignado al operador:', op.ValidadorId);
await new Promise((r) => setTimeout(r, 1000));
const [bit] = await q(
  `SELECT Descripcion FROM Bitacora WHERE IdUsuario = ? AND Descripcion LIKE 'Validador % asignado%' ORDER BY Id DESC LIMIT 1`,
  [op.Id],
);
console.log('   bitácora:', bit?.Descripcion ?? '(sin registro)');

paso(2, 'Abre turno con el validador');
const t = await http('POST', '/turnos', { token, body: { numeroSerieValidador: SERIE_VALIDADOR } });
console.log('   turno →', t.status, JSON.stringify(t.body).slice(0, 120));
const [turno] = await q(
  `SELECT t.Id FROM Turnos t JOIN Operadores o ON o.Id = t.IdOperador WHERE o.IdUsuario = ? ORDER BY t.Id DESC LIMIT 1`,
  [op.Id],
);

paso(3, 'Inicia viaje en la variante de la ruta');
const [variante] = await q(`SELECT Id FROM Variantes WHERE Nombre = 'QA E2E Variante Ida' ORDER BY Id DESC LIMIT 1`);
const v = await http('POST', '/viajes', { token, body: { idTurno: Number(turno.Id), idVariante: Number(variante.Id) } });
console.log('   viaje →', v.status, JSON.stringify(v.body).slice(0, 120));
const [viaje] = await q('SELECT Id FROM Viajes WHERE IdTurno = ? ORDER BY Id DESC LIMIT 1', [turno.Id]);

paso(4, 'Cobra un pasaje con el QR del pasajero');
const antes = await saldo();
const clave = randomUUID();
const cobro = {
  latitud: 21.1060,
  longitud: -86.8930,
  numeroSerieMonedero: SERIE_MONEDERO,
  numeroSerieValidador: SERIE_VALIDADOR,
  idViaje: Number(viaje.Id),
  esQR: true,
  claveIdempotencia: clave,
};
const d = await http('POST', '/transacciones/debito', { token, body: cobro });
console.log('   débito →', d.status, JSON.stringify(d.body).slice(0, 120));
console.log(`   saldo: $${antes} → $${await saldo()}`);

paso(5, 'El validador reintenta el mismo cobro (misma clave): no debe cobrar otra vez');
const d2 = await http('POST', '/transacciones/debito', { token, body: cobro });
console.log('   reintento →', d2.status, JSON.stringify(d2.body).slice(0, 120));
console.log(`   saldo: $${await saldo()}`);

await db.end();
