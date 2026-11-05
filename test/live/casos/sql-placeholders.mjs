// R4: un ? dentro de un comentario SQL desplazaba los parámetros de mysql2.
import { caso, crearUsuario, esperar, http, login, q } from '../harness.mjs';

caso('R4', 'GET /transacciones/list responde para el rol 1', async () => {
  const sa = await crearUsuario({ rol: 1, cliente: 1 });
  const r = await http('GET', '/transacciones/list', { token: await login(sa) });
  esperar(r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return '200';
});

caso('R4', 'GET /transacciones/DEBITO/:id devuelve el débito pedido', async () => {
  const [deb] = await q('SELECT Id FROM TransaccionesDebito ORDER BY Id DESC LIMIT 1');
  esperar(deb, 'no hay débitos en la BD para probar');
  const sa = await crearUsuario({ rol: 1, cliente: 1 });
  const r = await http('GET', `/transacciones/DEBITO/${deb.Id}`, { token: await login(sa) });
  esperar(r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const data = r.body?.data ?? r.body;
  const id = Number(data?.id ?? data?.Id ?? data?.[0]?.id ?? data?.[0]?.Id);
  esperar(id === Number(deb.Id), `devolvió id ${id}, se pidió ${deb.Id}`);
  return `200, id ${deb.Id}`;
});
