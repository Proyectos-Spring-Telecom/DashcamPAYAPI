// N-03 (extravío) y H-17 (alta de monedero).
import { caso, crearMonedero, crearPasajero, crearUsuario, esperar, http, login, q, uid } from '../harness.mjs';

const saldo = async (serie) => Number((await q('SELECT Saldo FROM Monederos WHERE NumeroSerie = ?', [serie]))[0].Saldo);

async function escenarioExtravio(saldoDestino) {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const pas = await crearPasajero();
  const origen = await crearMonedero({ saldo: 70 });
  await q('UPDATE Monederos SET IdPasajero = ? WHERE NumeroSerie = ?', [pas.idPasajero, origen]);
  const destino = await crearMonedero({ saldo: saldoDestino });
  const r = await http('POST', '/monederos/reporte/extravio', { body: { correo: pas.userName, numeroSerie: destino }, token });
  return { r, origen, destino };
}

caso('N-03', 'el extravío no acepta un destino con saldo', async () => {
  const { r, destino } = await escenarioExtravio(500);
  esperar(r.status === 400, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  esperar((await saldo(destino)) === 500, 'el destino cambió de saldo');
  return '400; destino intacto';
});

caso('N-03', 'el extravío a un destino vacío traspasa el saldo exacto', async () => {
  const { r, origen, destino } = await escenarioExtravio(0);
  esperar(r.status < 300, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  esperar((await saldo(destino)) === 70 && (await saldo(origen)) === 0, 'saldos inesperados');
  return 'destino 70, origen 0';
});

caso('H-17', 'el alta de monedero no acepta un pasajero de otro cliente', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const ajeno = await crearPasajero({ cliente: 6 });
  const r = await http('POST', '/monederos', {
    body: { numeroSerie: `QA-REM-H17-${uid().slice(0, 8)}`, idCliente: 4, idPasajero: ajeno.idPasajero },
    token,
  });
  esperar(r.status === 404, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return '404';
});
