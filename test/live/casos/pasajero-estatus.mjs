// D-12: desactivar al pasajero desactiva su usuario (sesión cortada) y bloquea los cobros.
import { PASSWORD, caso, crearMonedero, crearPasajero, crearUsuario, esperar, http, login, q, uid, viajeAbierto } from '../harness.mjs';

const CLIENTE_DEBITO = 6;

caso('D-12', 'pasajero desactivado: sin login, token anterior inválido y débito rechazado; al reactivar vuelve todo', async () => {
  const v = await viajeAbierto(CLIENTE_DEBITO);
  const adm = await login(await crearUsuario({ rol: 2, cliente: CLIENTE_DEBITO }));
  const p = await crearPasajero({ cliente: CLIENTE_DEBITO });
  const serie = await crearMonedero({ cliente: CLIENTE_DEBITO, saldo: 100 });
  await q('UPDATE Monederos SET IdPasajero = ? WHERE NumeroSerie = ?', [p.idPasajero, serie]);
  const tokenPasajero = await login(p);

  const debito = () => http('POST', '/transacciones/debito', {
    token: adm,
    body: {
      latitud: 21.1619, longitud: -86.8515, numeroSerieMonedero: serie,
      numeroSerieValidador: v.validador, idViaje: Number(v.idViaje), esQR: true, claveIdempotencia: uid(),
    },
  });
  const estatus = (e) => http('PATCH', `/pasajeros/estatus/${p.idPasajero}`, { token: adm, body: { estatus: e } });
  const saldo = async () => Number((await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]))[0].Saldo);

  const baja = await estatus(0);
  esperar(baja.status < 300, `desactivar → ${baja.status} ${JSON.stringify(baja.body).slice(0, 200)}`);
  const [u] = await q('SELECT Estatus FROM Usuarios WHERE Id = ?', [p.id]);
  const loginBaja = await http('POST', '/login', { body: { userName: p.userName, password: PASSWORD } });
  const perfil = await http('GET', '/login/me', { token: tokenPasajero });
  const d1 = await debito();
  const s1 = await saldo();
  esperar(Number(u.Estatus) === 0, `usuario Estatus ${u.Estatus}`);
  esperar(loginBaja.status >= 400, `login del pasajero desactivado → ${loginBaja.status}`);
  esperar(perfil.status === 401, `token previo → ${perfil.status}`);
  esperar(d1.status === 400 && s1 === 100, `débito → ${d1.status} ${JSON.stringify(d1.body).slice(0, 120)}, saldo ${s1}`);

  const alta = await estatus(1);
  esperar(alta.status < 300, `reactivar → ${alta.status}`);
  const loginAlta = await http('POST', '/login', { body: { userName: p.userName, password: PASSWORD } });
  const d2 = await debito();
  const s2 = await saldo();
  esperar(loginAlta.status < 300, `login tras reactivar → ${loginAlta.status}`);
  esperar(d2.status < 300 && s2 < 100, `débito tras reactivar → ${d2.status}, saldo ${s2}`);
  return `baja: login ${loginBaja.status}, token ${perfil.status}, débito ${d1.status}; alta: login ${loginAlta.status}, débito ${d2.status} (saldo ${s2})`;
});
