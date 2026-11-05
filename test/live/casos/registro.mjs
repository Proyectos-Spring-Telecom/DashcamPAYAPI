// H-64: registro público por cliente. Cliente 5 se cierra solo durante el caso y se restaura.
import { RUN, caso, esperar, http, q, uid } from '../harness.mjs';

async function conRegistroCerrado(idCliente, fn) {
  const [c] = await q('SELECT PermiteRegistroPublico p FROM Clientes WHERE Id = ?', [idCliente]);
  await q('UPDATE Clientes SET PermiteRegistroPublico = 0 WHERE Id = ?', [idCliente]);
  try {
    return await fn();
  } finally {
    await q('UPDATE Clientes SET PermiteRegistroPublico = ? WHERE Id = ?', [c.p, idCliente]);
  }
}

caso('H-64', '/clientes/public omite al cliente con el registro cerrado', async () =>
  conRegistroCerrado(5, async () => {
    const r = await http('GET', '/clientes/public');
    esperar(r.status === 200, `status ${r.status}`);
    const ids = (r.body?.data ?? []).map((c) => Number(c.id));
    esperar(!ids.includes(5) && ids.length > 0, `ids ${ids.join(',')}`);
    return `ids visibles ${ids.join(',')}`;
  }));

caso('H-64', 'el registro de pasajero en un cliente cerrado se rechaza sin crear nada', async () =>
  conRegistroCerrado(5, async () => {
    const correo = `qa.rem.${RUN}.reg.${uid().slice(0, 6)}@dashcam.test`;
    const r = await http('POST', '/login/pasajero/registro', {
      body: {
        nombre: 'QA',
        apellidoPaterno: 'Registro',
        fechaNacimiento: '1995-08-15',
        correo,
        passwordHash: 'Clave-Segura-2026!',
        idCliente: 5,
      },
    });
    esperar(r.status === 400, `status ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const u = await q('SELECT Id FROM Usuarios WHERE UserName = ?', [correo]);
    esperar(u.length === 0, 'se creó el usuario');
    return '400; sin usuario';
  }));
