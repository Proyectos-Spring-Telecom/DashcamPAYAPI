import { DataSource } from 'typeorm';

/**
 * Datos del token relevantes para autorización multi-tenant.
 * Coinciden con lo que devuelve `JwtStrategy.validate`.
 */
export interface TenantUser {
  userId: number;
  cliente: number;
  rol: number;
  idOperador?: number;
}

/**
 * Un resolver decide si el recurso identificado por `id` pertenece al tenant
 * del usuario. Debe replicar EXACTAMENTE la regla de visibilidad que ya usan
 * los listados del módulo, para no cambiar lo que un usuario legítimo ve.
 *
 * @returns true si el recurso existe y es del tenant; false si no existe o no
 *          pertenece (el guard responde 404 en ambos casos, sin filtrar la
 *          existencia del recurso).
 */
export type OwnershipResolver = (
  ds: DataSource,
  id: number | string,
  user: TenantUser,
) => Promise<boolean>;

/** Rol Super Administrador: ve todo (equivale al `case 1` de los listados). */
export const ROL_SUPER_ADMIN = 1;
/** Rol Pasajero: su pertenencia es por `IdPasajero`, no por cliente. */
export const ROL_PASAJERO = 9;

/**
 * Conjunto de clientes visibles para el usuario (él mismo + descendientes),
 * usando el mismo `spGetClientes` que los listados.
 */
export async function clientesPermitidos(
  ds: DataSource,
  cliente: number,
): Promise<number[]> {
  const result = await ds.query('CALL spGetClientes(?);', [cliente]);
  const filas = Array.isArray(result) ? (result[0] ?? []) : [];
  return filas
    .map((r: { Id?: number | string }) => Number(r.Id))
    .filter((n: number) => Number.isFinite(n));
}

/** Id del pasajero asociado al usuario del token (para rol Pasajero). */
async function pasajeroIdDeUsuario(
  ds: DataSource,
  userId: number,
): Promise<number | null> {
  const filas = await ds.query(
    'SELECT Id FROM Pasajeros WHERE IdUsuario = ? LIMIT 1',
    [userId],
  );
  return filas?.[0]?.Id != null ? Number(filas[0].Id) : null;
}

/** ¿El IdCliente dado está dentro de los clientes permitidos del usuario? */
async function clienteEnAlcance(
  ds: DataSource,
  user: TenantUser,
  idCliente: number | null,
): Promise<boolean> {
  if (idCliente == null) return false;
  const permitidos = await clientesPermitidos(ds, user.cliente);
  return permitidos.includes(Number(idCliente));
}

/**
 * Regla para recursos que cuelgan de un monedero (monedero, pasajero,
 * transacciones): rol Pasajero pertenece por `IdPasajero`; el resto por
 * `IdCliente`. Replica el `case 9` de esos listados.
 */
async function pertenecePorClienteOPasajero(
  ds: DataSource,
  user: TenantUser,
  idCliente: number | null,
  idPasajero: number | null,
): Promise<boolean> {
  if (Number(user.rol) === ROL_PASAJERO) {
    const pid = await pasajeroIdDeUsuario(ds, user.userId);
    return pid !== null && idPasajero !== null && Number(idPasajero) === pid;
  }
  return clienteEnAlcance(ds, user, idCliente);
}

/**
 * Factory: resolver cuya `sql` recibe el id y devuelve una fila con `IdCliente`
 * (directo o vía joins). La pertenencia es por cliente (self + descendientes).
 * Sirve para todos los recursos operativos scopeados por cliente.
 */
function porIdCliente(sql: string): OwnershipResolver {
  return async (ds, id, user) => {
    const row = (await ds.query(sql, [id]))?.[0];
    if (!row) return false;
    return clienteEnAlcance(
      ds,
      user,
      row.IdCliente != null ? Number(row.IdCliente) : null,
    );
  };
}

/**
 * Factory: resolver cuya `sql` devuelve `IdCliente` e `IdPasajero`. Aplica la
 * regla cliente-o-pasajero (para recursos que cuelgan del monedero).
 */
function porClienteOPasajero(sql: string): OwnershipResolver {
  return async (ds, id, user) => {
    const row = (await ds.query(sql, [id]))?.[0];
    if (!row) return false;
    return pertenecePorClienteOPasajero(
      ds,
      user,
      row.IdCliente != null ? Number(row.IdCliente) : null,
      row.IdPasajero != null ? Number(row.IdPasajero) : null,
    );
  };
}

/**
 * Registro central de resolvers de pertenencia por recurso.
 * Se referencian por nombre desde `@TenantResource('<nombre>')`.
 *
 * Cada SQL replica el join de pertenencia que ya usa el listado del módulo
 * (fuente de verdad), para no cambiar lo que ve un usuario legítimo.
 */
export const ownershipResolvers: Record<string, OwnershipResolver> = {
  // --- El recurso ES un cliente: debe estar dentro del alcance del token ---
  cliente: async (ds, id, user) => clienteEnAlcance(ds, user, Number(id)),

  // --- Recursos que cuelgan del monedero (rol Pasajero por IdPasajero) ---
  monedero: porClienteOPasajero(
    'SELECT IdCliente, IdPasajero FROM Monederos WHERE Id = ? LIMIT 1',
  ),
  pasajero: async (ds, id, user) => {
    if (Number(user.rol) === ROL_PASAJERO) {
      const pid = await pasajeroIdDeUsuario(ds, user.userId);
      return pid !== null && Number(id) === pid;
    }
    // Otros roles: el pasajero pertenece vía el cliente de su monedero.
    const row = (
      await ds.query(
        `SELECT m.IdCliente AS IdCliente
           FROM Pasajeros p
           INNER JOIN Monederos m ON m.IdPasajero = p.Id
          WHERE p.Id = ? LIMIT 1`,
        [id],
      )
    )?.[0];
    if (!row) return false;
    return clienteEnAlcance(
      ds,
      user,
      row.IdCliente != null ? Number(row.IdCliente) : null,
    );
  },
  transaccionDebito: porClienteOPasajero(
    `SELECT m.IdCliente AS IdCliente, m.IdPasajero AS IdPasajero
       FROM TransaccionesDebito td
       INNER JOIN Monederos m ON td.NumeroSerieMonedero = m.NumeroSerie
      WHERE td.Id = ? LIMIT 1`,
  ),
  transaccionRecarga: porClienteOPasajero(
    `SELECT m.IdCliente AS IdCliente, m.IdPasajero AS IdPasajero
       FROM TransaccionesRecarga tr
       INNER JOIN Monederos m ON tr.NumeroSerieMonedero = m.NumeroSerie
      WHERE tr.Id = ? LIMIT 1`,
  ),

  // --- Recursos con IdCliente directo ---
  vehiculo: porIdCliente(
    'SELECT IdCliente FROM Vehiculos WHERE Id = ? LIMIT 1',
  ),
  instalacion: porIdCliente(
    'SELECT IdCliente FROM Instalaciones WHERE Id = ? LIMIT 1',
  ),
  taller: porIdCliente('SELECT IdCliente FROM Talleres WHERE Id = ? LIMIT 1'),
  transbordo: porIdCliente(
    'SELECT IdCliente FROM TransbordosPermitidos WHERE Id = ? LIMIT 1',
  ),
  turno: porIdCliente('SELECT IdCliente FROM Turnos WHERE Id = ? LIMIT 1'),
  validador: porIdCliente(
    'SELECT IdCliente FROM Validadores WHERE Id = ? LIMIT 1',
  ),
  zona: porIdCliente('SELECT IdCliente FROM Zonas WHERE Id = ? LIMIT 1'),
  contador: porIdCliente(
    'SELECT IdCliente FROM Contadores WHERE Id = ? LIMIT 1',
  ),
  usuario: porIdCliente('SELECT IdCliente FROM Usuarios WHERE Id = ? LIMIT 1'),
  viaje: porIdCliente('SELECT IdCliente FROM Viajes WHERE Id = ? LIMIT 1'),
  catTipoPasajero: porIdCliente(
    'SELECT IdCliente FROM CatTiposPasajeros WHERE Id = ? LIMIT 1',
  ),
  historicoInstalacion: porIdCliente(
    'SELECT IdCliente FROM HistoricoInstalaciones WHERE Id = ? LIMIT 1',
  ),

  // --- Recursos con IdCliente transitivo (mismo join que su listado) ---
  operador: porIdCliente(
    `SELECT u.IdCliente AS IdCliente
       FROM Operadores o
       INNER JOIN Usuarios u ON o.IdUsuario = u.Id
      WHERE o.Id = ? LIMIT 1`,
  ),
  licencia: porIdCliente(
    `SELECT u.IdCliente AS IdCliente
       FROM Licencias l
       INNER JOIN Operadores o ON l.IdOperador = o.Id
       INNER JOIN Usuarios u ON o.IdUsuario = u.Id
      WHERE l.Id = ? LIMIT 1`,
  ),
  ruta: porIdCliente(
    `SELECT z.IdCliente AS IdCliente
       FROM Rutas ru
       INNER JOIN Zonas z ON ru.IdZona = z.Id
      WHERE ru.Id = ? LIMIT 1`,
  ),
  variante: porIdCliente(
    `SELECT z.IdCliente AS IdCliente
       FROM Variantes v
       INNER JOIN Rutas ru ON v.IdRuta = ru.Id
       INNER JOIN Zonas z ON ru.IdZona = z.Id
      WHERE v.Id = ? LIMIT 1`,
  ),
  tarifa: porIdCliente(
    `SELECT z.IdCliente AS IdCliente
       FROM Tarifas t
       INNER JOIN Variantes v ON t.IdVariante = v.Id
       INNER JOIN Rutas ru ON v.IdRuta = ru.Id
       INNER JOIN Zonas z ON ru.IdZona = z.Id
      WHERE t.Id = ? LIMIT 1`,
  ),
  verificacion: porIdCliente(
    `SELECT i.IdCliente AS IdCliente
       FROM Verificaciones ve
       INNER JOIN Instalaciones i ON ve.IdInstalacion = i.Id
      WHERE ve.Id = ? LIMIT 1`,
  ),
  incidente: porIdCliente(
    `SELECT i.IdCliente AS IdCliente
       FROM Incidentes inc
       INNER JOIN Instalaciones i ON inc.IdInstalacion = i.Id
      WHERE inc.Id = ? LIMIT 1`,
  ),
  mantenimientoCombustible: porIdCliente(
    `SELECT i.IdCliente AS IdCliente
       FROM MantenimientoCombustible mc
       INNER JOIN Instalaciones i ON mc.IdInstalacion = i.Id
      WHERE mc.Id = ? LIMIT 1`,
  ),
  mantenimientoKilometraje: porIdCliente(
    `SELECT i.IdCliente AS IdCliente
       FROM MantenimientoKilometraje mk
       INNER JOIN Instalaciones i ON mk.IdInstalacion = i.Id
      WHERE mk.Id = ? LIMIT 1`,
  ),
  mantenimientoVehicular: porIdCliente(
    `SELECT i.IdCliente AS IdCliente
       FROM MantenimientoVehicular mv
       INNER JOIN Instalaciones i ON mv.IdInstalacion = i.Id
      WHERE mv.Id = ? LIMIT 1`,
  ),
  posicion: porIdCliente(
    `SELECT d.IdCliente AS IdCliente
       FROM Posiciones p
       INNER JOIN Validadores d ON p.NumeroSerieValidador = d.NumeroSerie
      WHERE p.Id = ? LIMIT 1`,
  ),
  conteoPasajero: porIdCliente(
    `SELECT bv.IdCliente AS IdCliente
       FROM ConteoPasajeros cp
       INNER JOIN Contadores bv ON cp.NumeroSerieContador = bv.NumeroSerie
      WHERE cp.Id = ? LIMIT 1`,
  ),
  usuarioInstalacion: porIdCliente(
    `SELECT i.IdCliente AS IdCliente
       FROM UsuariosInstalaciones ui
       INNER JOIN Instalaciones i ON ui.IdInstalacion = i.Id
      WHERE ui.Id = ? LIMIT 1`,
  ),
  usuarioZona: porIdCliente(
    `SELECT z.IdCliente AS IdCliente
       FROM UsuariosZonas uz
       INNER JOIN Zonas z ON uz.IdZona = z.Id
      WHERE uz.Id = ? LIMIT 1`,
  ),
  bitacoraEntry: porIdCliente(
    `SELECT u.IdCliente AS IdCliente
       FROM Bitacora b
       INNER JOIN Usuarios u ON b.IdUsuario = u.Id
      WHERE b.Id = ? LIMIT 1`,
  ),
};
