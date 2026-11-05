// Usuarios QA persistentes para revisar la WebApp a mano contra la API local.
//   npx dotenvx run -q -- node test/live/crear-demo.mjs          admin del cliente 6
//   npx dotenvx run -q -- node test/live/crear-demo.mjs --sa     super administrador (cliente 1)
//   ... --borrar                                                  elimina el usuario indicado
// La contraseña es PASSWORD de harness.mjs.
import { createRequire } from 'node:module';
import { PASSWORD, db, q } from './harness.mjs';
const bcrypt = createRequire(import.meta.url)('bcrypt');

const SA = process.argv.includes('--sa');
const USER = SA ? 'qa.rem.demo.sa@dashcam.test' : 'qa.rem.demo.admin@dashcam.test';
// Copia los permisos de un usuario real del mismo nivel: SA (Id 1) o admin del cliente 6 (Id 24).
const [rol, cliente, plantilla] = SA ? [1, 1, 1] : [2, 6, 24];

const [prev] = await q('SELECT Id FROM Usuarios WHERE UserName = ?', [USER]);
if (process.argv.includes('--borrar')) {
  if (prev) {
    for (const t of ['RefreshSessions', 'UsuariosPermisos', 'ConnectedUsers']) await q(`DELETE FROM ${t} WHERE IdUsuario = ?`, [prev.Id]);
    await q('DELETE FROM Usuarios WHERE Id = ?', [prev.Id]);
  }
  console.log('borrado', USER);
} else if (!prev) {
  const r = await q(
    `INSERT INTO Usuarios (UserName, PasswordHash, EmailConfirmado, Nombre, ApellidoPaterno, IdRol, IdCliente, Estatus)
     VALUES (?, ?, 1, 'QA', 'Demo', ?, ?, 1)`,
    [USER, await bcrypt.hash(PASSWORD, 10), rol, cliente],
  );
  await q(
    `INSERT INTO UsuariosPermisos (IdUsuario, IdPermiso, Estatus)
     SELECT ?, IdPermiso, 1 FROM UsuariosPermisos WHERE IdUsuario = ? AND Estatus = 1`,
    [r.insertId, plantilla],
  );
  console.log('creado', USER);
} else console.log('ya existe', USER);
await db.end();
