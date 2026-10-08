import { correr } from './harness.mjs';
import './casos/auth-otp.mjs';
import './casos/sql-placeholders.mjs';
import './casos/jwt.mjs';
import './casos/recarga-idempotencia.mjs';
import './casos/debito.mjs';
import './casos/usuarios.mjs';
import './casos/monederos.mjs';
import './casos/tenant-fk.mjs';
import './casos/registro.mjs';
import './casos/bitacora.mjs';
import './casos/tarjeta.mjs';
import './casos/pasajero-estatus.mjs';

await correr();
