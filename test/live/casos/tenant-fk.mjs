// N-07: una FK padre de otro tenant no se acepta en un update.
// Tenant: un admin no lee por :id recursos de otro cliente (fuera de su jerarquía).
import { caso, crearMonedero, crearUsuario, esperar, http, login, omitir, q } from '../harness.mjs';

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

const CLIENTE_A = 6;

/** Clientes que el cliente ve (él y su jerarquía, igual que clientesPermitidos). */
async function alcance(cliente) {
  const res = await q('CALL spGetClientes(?)', [cliente]);
  const filas = Array.isArray(res?.[0]) ? res[0] : [];
  return [...new Set([cliente, ...filas.map((r) => Number(r.Id)).filter((n) => n > 0)])];
}

caso('Tenant', 'un admin del cliente A pide por :id vehículo, instalación y monedero del cliente B → 404', async () => {
  const dentro = await alcance(CLIENTE_A);
  const fuera = dentro.map(() => '?').join(',');
  const [veh] = await q(`SELECT Id FROM Vehiculos WHERE IdCliente NOT IN (${fuera}) ORDER BY Id DESC LIMIT 1`, dentro);
  const [ins] = await q(`SELECT Id FROM Instalaciones WHERE IdCliente NOT IN (${fuera}) ORDER BY Id DESC LIMIT 1`, dentro);
  const [cliB] = await q(`SELECT Id FROM Clientes WHERE Id NOT IN (${fuera}) ORDER BY Id LIMIT 1`, dentro);
  esperar(cliB, `no hay un cliente fuera de la jerarquía de ${CLIENTE_A}`);
  const serie = await crearMonedero({ cliente: Number(cliB.Id) });
  const [mon] = await q('SELECT Id FROM Monederos WHERE NumeroSerie = ?', [serie]);
  const token = await login(await crearUsuario({ rol: 2, cliente: CLIENTE_A }));

  // Control: su propio vehículo sí lo ve (si no, el 404 no probaría nada).
  const [propio] = await q('SELECT Id FROM Vehiculos WHERE IdCliente = ? ORDER BY Id DESC LIMIT 1', [CLIENTE_A]);
  if (propio) {
    const r = await http('GET', `/vehiculos/${propio.Id}`, { token });
    esperar(r.status === 200, `su propio vehículo ${propio.Id} → ${r.status}`);
  }
  const pedidos = [
    veh && `/vehiculos/${veh.Id}`,
    ins && `/instalaciones/${ins.Id}`,
    `/monederos/${mon.Id}`,
  ].filter(Boolean);
  const rs = [];
  for (const ruta of pedidos) rs.push(`${ruta}→${(await http('GET', ruta, { token })).status}`);
  esperar(rs.every((x) => x.endsWith('→404')), rs.join(' '));
  return `cliente B ${cliB.Id}: ${rs.join(' ')}`;
});

caso('N-07', 'verificaciones.update no acepta una instalación de otro cliente (404 y sin cambios)', async () => {
  const dentro = await alcance(CLIENTE_A);
  const fuera = dentro.map(() => '?').join(',');
  const [ver] = await q(
    `SELECT v.Id, v.IdInstalacion FROM Verificaciones v JOIN Instalaciones i ON i.Id = v.IdInstalacion
      WHERE i.IdCliente = ? ORDER BY v.Id DESC LIMIT 1`,
    [CLIENTE_A],
  );
  if (!ver) omitir(`no hay verificaciones de instalaciones del cliente ${CLIENTE_A}`);
  const [ajena] = await q(`SELECT Id FROM Instalaciones WHERE IdCliente NOT IN (${fuera}) ORDER BY Id DESC LIMIT 1`, dentro);
  if (!ajena) omitir(`no hay instalaciones fuera de la jerarquía de ${CLIENTE_A}`);
  const token = await login(await crearUsuario({ rol: 2, cliente: CLIENTE_A }));
  try {
    const r = await http('PATCH', `/verificaciones/${ver.Id}`, { body: { idInstalacion: Number(ajena.Id) }, token });
    const [despues] = await q('SELECT IdInstalacion FROM Verificaciones WHERE Id = ?', [ver.Id]);
    esperar(Number(despues.IdInstalacion) === Number(ver.IdInstalacion), `aceptó la instalación ajena ${ajena.Id} (status ${r.status})`);
    esperar(r.status === 404, `status ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    return `404; verificación ${ver.Id} intacta`;
  } finally {
    await q('UPDATE Verificaciones SET IdInstalacion = ? WHERE Id = ?', [ver.IdInstalacion, ver.Id]);
  }
});
