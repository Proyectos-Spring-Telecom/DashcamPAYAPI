// Decisión de negocio: la tarjeta solo la usa el pasajero desde su propia sesión;
// caja, administración y operadores recargan en efectivo. Ver docs/decisiones-remediacion.md.
import { caso, crearMonedero, crearUsuario, esperar, http, login, uid } from '../harness.mjs';

caso('Tarjeta', 'caja/admin no puede recargar con tarjeta (403 antes de llamar a NetPay)', async () => {
  const adm = await crearUsuario({ rol: 2 });
  const token = await login(adm);
  const serie = await crearMonedero();
  const r = await http('POST', '/transacciones/recarga', {
    token,
    body: {
      idTipoTransaccion: 1,
      monto: 50,
      numeroSerieMonedero: serie,
      idMetodoPago: 3,
      tokenCardNetPay: 'tok_qa_no_se_usa',
      referenceIdNetPay: 'ref_qa_no_se_usa',
      sessionId: 'qa',
      deviceFingerPrint: 'qa',
      idDireccion: 1,
      claveIdempotencia: uid(),
    },
  });
  esperar(r.status === 403, `status ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return '403';
});

caso('Tarjeta', 'caja no puede cobrar una tarjeta guardada', async () => {
  const cajero = await crearUsuario({ rol: 11 });
  const r = await http('POST', '/netpay/payment/saved-card', {
    token: await login(cajero),
    body: { referenceId: 'ref_qa_no_existe', amount: 10 },
  });
  esperar(r.status === 403, `status ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
  return '403';
});
