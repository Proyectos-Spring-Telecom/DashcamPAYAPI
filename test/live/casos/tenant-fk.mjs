// N-07: una FK padre de otro tenant no se acepta en un update.
import { caso, crearUsuario, esperar, http, login, q } from '../harness.mjs';

caso('N-07', 'rutas.update no acepta un idZonaFin de otro cliente', async () => {
  // Ruta 1 y zona 1 son del cliente 6; la zona 3 es del cliente 5.
  const [ruta] = await q('SELECT Id, IdZonaFin FROM Rutas WHERE Id = 1');
  esperar(ruta, 'no existe la ruta 1');
  const adm = await crearUsuario({ rol: 2, cliente: 6 });
  const token = await login(adm);
  try {
    const r = await http('PUT', '/rutas/1', { body: { idZonaFin: 3 }, token });
    const [despues] = await q('SELECT IdZonaFin FROM Rutas WHERE Id = 1');
    esperar(Number(despues.IdZonaFin) !== 3, `aceptó la zona ajena (status ${r.status})`);
    esperar(r.status === 404, `status ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    return '404; ruta intacta';
  } finally {
    await q('UPDATE Rutas SET IdZonaFin = ? WHERE Id = 1', [ruta.IdZonaFin]);
  }
});
