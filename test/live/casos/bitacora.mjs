// M-013: lo que se escribe en la bitácora tiene que volver a verificar.
// Antes ~45 % fallaba (MySQL redondea ms en DATETIME(0)) y los PUT parciales
// fallaban siempre (claves undefined hasheadas como null).
import { caso, crearUsuario, esperar, http, login, q } from '../harness.mjs';

caso('M-013', 'la bitácora escrita en esta corrida verifica íntegra', async () => {
  const [{ desde }] = await q('SELECT COALESCE(MAX(Id), 0) desde FROM Bitacora');
  const sa = await crearUsuario({ rol: 1, cliente: 1 });
  const token = await login(sa);
  // Genera registros: PUT parcial (campos opcionales sin enviar) y logins.
  for (let i = 0; i < 4; i++) {
    const u = await crearUsuario({ rol: 11 });
    await http('PUT', `/usuarios/${u.id}`, { body: { nombre: `QA ${i}` }, token });
    await login(u);
  }
  await new Promise((r) => setTimeout(r, 1500)); // la cola escribe después del COMMIT
  const filas = await q('SELECT Id FROM Bitacora WHERE Id > ? AND Hash IS NOT NULL ORDER BY Id', [desde]);
  esperar(filas.length >= 8, `solo ${filas.length} registros nuevos`);
  const malos = [];
  for (const { Id } of filas) {
    const r = await http('GET', `/bitacora/${Id}/verify`, { token });
    const valido = r.body?.valido ?? r.body?.data?.valido;
    if (r.status !== 200 || valido !== true) malos.push(`${Id}:${r.status}:${valido}`);
  }
  esperar(malos.length === 0, `${malos.length}/${filas.length} no verifican: ${malos.join(' ')}`);
  return `${filas.length}/${filas.length} íntegros`;
});
