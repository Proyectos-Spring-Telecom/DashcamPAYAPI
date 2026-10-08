// H-02: lo que un administrador puede otorgar al crear o editar usuarios.
import { RUN, caso, crearUsuario, esperar, http, login, q, uid } from '../harness.mjs';

async function adminConPermisos(permisos) {
  const adm = await crearUsuario({ rol: 2 });
  for (const p of permisos) {
    await q('INSERT INTO UsuariosPermisos (IdUsuario, IdPermiso, Estatus) VALUES (?, ?, 1)', [adm.id, p]);
  }
  return { adm, token: await login(adm) };
}

const nuevo = (extra = {}) => ({
  userName: `qa.rem.${RUN}.api.${uid().slice(0, 8)}@dashcam.test`,
  passwordHash: 'Clave-Segura-2026!',
  emailConfirmado: 1,
  nombre: 'QA',
  apellidoPaterno: 'Api',
  idRol: 11,
  idCliente: 4,
  permisosIds: [],
  ...extra,
});

caso('H-02', 'un admin no otorga permisos que no tiene', async () => {
  const { token } = await adminConPermisos([1, 2]);
  const ok = await http('POST', '/usuarios', { body: nuevo({ permisosIds: [1] }), token });
  esperar(ok.status === 201 || ok.status === 200, `con permiso propio ${ok.status} ${JSON.stringify(ok.body).slice(0, 200)}`);
  const no = await http('POST', '/usuarios', { body: nuevo({ permisosIds: [1, 3] }), token });
  esperar(no.status === 403, `con permiso ajeno ${no.status}`);
  return `propio ${ok.status}, ajeno 403`;
});

caso('H-02', 'el alta exige contraseña de 12 o más', async () => {
  const { token } = await adminConPermisos([]);
  const r = await http('POST', '/usuarios', { body: nuevo({ passwordHash: 'Corta-1!' }), token });
  esperar(r.status === 400, `status ${r.status}`);
  return '400';
});

caso('H-02', 'un PUT sin estatus no reactiva al usuario dado de baja', async () => {
  const { token } = await adminConPermisos([]);
  const u = await crearUsuario({ rol: 11 });
  await q('UPDATE Usuarios SET Estatus = 0 WHERE Id = ?', [u.id]);
  const r = await http('PUT', `/usuarios/${u.id}`, { body: { nombre: 'QA editado' }, token });
  esperar(r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const [row] = await q('SELECT Estatus FROM Usuarios WHERE Id = ?', [u.id]);
  esperar(Number(row.Estatus) === 0, 'el PUT lo reactivó');
  return 'sigue inactivo';
});

caso('H-02', 'cambiar el rol corta la sesión vigente del usuario', async () => {
  const { token } = await adminConPermisos([]);
  const u = await crearUsuario({ rol: 11 });
  const suyo = await login(u);
  const r = await http('PUT', `/usuarios/${u.id}`, { body: { idRol: 10 }, token });
  esperar(r.status === 200, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  const me = await http('GET', '/login/me', { token: suyo });
  esperar(me.status === 401, `el token viejo sigue sirviendo (${me.status})`);
  return 'token anterior 401';
});
