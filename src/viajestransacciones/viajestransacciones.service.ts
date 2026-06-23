import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateViajestransaccioneDto } from './dto/create-viajestransaccione.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ViajesTransacciones } from 'src/entities/ViajesTransacciones';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { Clientes } from 'src/entities/Clientes';
import { EnumModulos } from 'src/common/estatus.enum';

@Injectable()
export class ViajestransaccionesService {
  constructor(
    @InjectRepository(ViajesTransacciones)
    private readonly viajestransaccionesRepository: Repository<ViajesTransacciones>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) { }

  async create(
    idUser: number,
    createViajestransaccioneDto: CreateViajestransaccioneDto,
  ) {
    try {
      const newViajeTransacciones =
        await this.viajestransaccionesRepository.create(
          createViajestransaccioneDto,
        );
      const viajestransaccionesSave =
        await this.viajestransaccionesRepository.save(newViajeTransacciones);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajestransaccioneDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesTransacciones',
        `Se creó el viajestransacciones con viaje ID: ${createViajestransaccioneDto.idViaje} y transaccion ID: ${createViajestransaccioneDto.idTransaccionDebito}, ${createViajestransaccioneDto.idTransaccionRecarga}`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.VIAJESTRANSACCIONES, 
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El viajestransaccion ha sido creado exitosamente.',
        data: {
          id: Number(viajestransaccionesSave.idViaje),
          nombre:
            `Viaje ID: ${viajestransaccionesSave.idViaje} Transaccion ID: ${viajestransaccionesSave.idTransaccionDebito},  ${viajestransaccionesSave.idTransaccionRecarga} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajestransaccioneDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesTransacciones',
        `Se creó el viajestransacciones con viaje ID: ${createViajestransaccioneDto.idViaje} y transaccion ID: ${createViajestransaccioneDto.idTransaccionDebito}, ${createViajestransaccioneDto.idTransaccionRecarga}`,
        'CREATE',
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Se produjo un error al crear el viajestransaccion.`,
        error: error.message,
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente],
    );

    const idsFiltrados = clientesFiltrado[0]; // El primer índice contiene los resultados
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { data: [] }; // No hay clientes que consultar
    }

    // 3. Construir el query dinámico con los IDs
    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }

  // Consultar posiciones para roles que usan clientes hijos
  private async consultarViajesTransacciones(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);

    const query = `
SELECT
    v.Id AS idViaje,
    v.Inicio AS inicioViaje,
    v.Fin AS finViaje,
    v.Estatus AS estatusViaje,

    -- Datos del Cliente
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente,

    -- Datos del Operador
    o.Id AS idOperador,
    u.Nombre AS nombreOperador,
    u.ApellidoPaterno AS apellidoPaternoOperador,
    u.ApellidoMaterno AS apellidoMaternoOperador,

    -- Información del variante, ruta y región
    d.Nombre AS nombreVariante,
    r.Nombre AS nombreRuta,
    reg.Nombre AS nombreRegion,

    -- Agrupamos las transacciones de débito en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionDebito', td.Id,
            'controlTransaccionDebito', td.ControlTransaccion,
            'montoDebito', td.Monto,
            'fechaHoraDebito', td.FechaHoraFinal,
            'latitudDebito', td.LatitudFinal,
            'longitudDebito', td.LongitudFinal
        )
    ) AS transaccionesDebito,

    -- Agrupamos las transacciones de recarga en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionRecarga', tr.Id,
            'controlTransaccionRecarga', tr.ControlTransaccion,
            'montoRecarga', tr.Monto,
            'fechaHoraRecarga', tr.FechaHora,
            'latitudRecarga', tr.Latitud,
            'longitudRecarga', tr.Longitud
        )
    ) AS transaccionesRecarga

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE c.Id IN (${placeholders})

GROUP BY
    v.Id,
    v.Inicio,
    v.Fin,
    v.Estatus,
    c.Id,
    c.Nombre,
    c.ApellidoPaterno,
    c.ApellidoMaterno,
    o.Id,
    u.Nombre,
    u.ApellidoPaterno,
    u.ApellidoMaterno,
    d.Id,
    d.Nombre,
    r.Id,
    r.Nombre,
    reg.Id,
    reg.Nombre

ORDER BY v.Id DESC; 
    `;
    return this.viajestransaccionesRepository.query(query, [...ids]);
  }

  // Consultar posiciones para roles que usan solo el cliente actual
  private async consultarViajesTransaccionesCL(cliente: number) {
    const query = `
      SELECT
    v.Id AS idViaje,
    v.Inicio AS inicioViaje,
    v.Fin AS finViaje,
    v.Estatus AS estatusViaje,

    -- Datos del Cliente
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente,

    -- Datos del Operador
    o.Id AS idOperador,
    u.Nombre AS nombreOperador,
    u.ApellidoPaterno AS apellidoPaternoOperador,
    u.ApellidoMaterno AS apellidoMaternoOperador,

    -- Información del variante, ruta y región
    d.Nombre AS nombreVariante,
    r.Nombre AS nombreRuta,
    reg.Nombre AS nombreRegion,

    -- Agrupamos las transacciones de débito en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionDebito', td.Id,
            'controlTransaccionDebito', td.ControlTransaccion,
            'montoDebito', td.Monto,
            'fechaHoraDebito', td.FechaHoraFinal,
            'latitudDebito', td.LatitudFinal,
            'longitudDebito', td.LongitudFinal
        )
    ) AS transaccionesDebito,

    -- Agrupamos las transacciones de recarga en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionRecarga', tr.Id,
            'controlTransaccionRecarga', tr.ControlTransaccion,
            'montoRecarga', tr.Monto,
            'fechaHoraRecarga', tr.FechaHora,
            'latitudRecarga', tr.Latitud,
            'longitudRecarga', tr.Longitud
        )
    ) AS transaccionesRecarga

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE c.Id = ?

GROUP BY
    v.Id,
    v.Inicio,
    v.Fin,
    v.Estatus,
    c.Id,
    c.Nombre,
    c.ApellidoPaterno,
    c.ApellidoMaterno,
    o.Id,
    u.Nombre,
    u.ApellidoPaterno,
    u.ApellidoMaterno,
    d.Id,
    d.Nombre,
    r.Id,
    r.Nombre,
    reg.Id,
    reg.Nombre

ORDER BY v.Id DESC; 
    `;
    return this.viajestransaccionesRepository.query(query, [cliente]);
  }

  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let viajestransacciones;
      switch (rol) {
        case 1:
          viajestransacciones = await this.viajestransaccionesRepository.query(
            `
SELECT
    v.Id AS idViaje,
    v.Inicio AS inicioViaje,
    v.Fin AS finViaje,
    v.Estatus AS estatusViaje,

    -- Datos del Cliente
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente,

    -- Datos del Operador
    o.Id AS idOperador,
    u.Nombre AS nombreOperador,
    u.ApellidoPaterno AS apellidoPaternoOperador,
    u.ApellidoMaterno AS apellidoMaternoOperador,

    -- Información del variante, ruta y región
    d.Nombre AS nombreVariante,
    r.Nombre AS nombreRuta,
    reg.Nombre AS nombreRegion,

    -- Agrupamos las transacciones de débito en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionDebito', td.Id,
            'controlTransaccionDebito', td.ControlTransaccion,
            'montoDebito', td.Monto,
            'fechaHoraDebito', td.FechaHoraFinal,
            'latitudDebito', td.LatitudFinal,
            'longitudDebito', td.LongitudFinal
        )
    ) AS transaccionesDebito,

    -- Agrupamos las transacciones de recarga en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionRecarga', tr.Id,
            'controlTransaccionRecarga', tr.ControlTransaccion,
            'montoRecarga', tr.Monto,
            'fechaHoraRecarga', tr.FechaHora,
            'latitudRecarga', tr.Latitud,
            'longitudRecarga', tr.Longitud
        )
    ) AS transaccionesRecarga

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE v.Estatus = 1  -- Filtra los viajes activos

GROUP BY
    v.Id,
    v.Inicio,
    v.Fin,
    v.Estatus,
    c.Id,
    c.Nombre,
    c.ApellidoPaterno,
    c.ApellidoMaterno,
    o.Id,
    u.Nombre,
    u.ApellidoPaterno,
    u.ApellidoMaterno,
    d.Id,
    d.Nombre,
    r.Id,
    r.Nombre,
    reg.Id,
    reg.Nombre

ORDER BY v.Id DESC;  

              `,
          );
          break;
        case 2: // Administrador
        case 8: // Reportes
        case 10: // Capturista
          viajestransacciones = await this.consultarViajesTransacciones(cliente)
          break;

        default:
        case 3: // Operador
          viajestransacciones = await this.consultarViajesTransaccionesCL(cliente)
          break;
      }
      const data = viajestransacciones.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
      }));
      const result: ApiResponseCommon = {
        data: viajestransacciones,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }

  private async consultarViajesTransaccionesPaginado(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
    v.Id AS idViaje,
    v.Inicio AS inicioViaje,
    v.Fin AS finViaje,
    v.Estatus AS estatusViaje,

    -- Datos del Cliente
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente,

    -- Datos del Operador
    o.Id AS idOperador,
    u.Nombre AS nombreOperador,
    u.ApellidoPaterno AS apellidoPaternoOperador,
    u.ApellidoMaterno AS apellidoMaternoOperador,

    -- Información del variante, ruta y región
    d.Nombre AS nombreVariante,
    r.Nombre AS nombreRuta,
    reg.Nombre AS nombreRegion,

    -- Agrupamos las transacciones de débito en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionDebito', td.Id,
            'controlTransaccionDebito', td.ControlTransaccion,
            'montoDebito', td.Monto,
            'fechaHoraDebito', td.FechaHoraFinal,
            'latitudDebito', td.LatitudFinal,
            'longitudDebito', td.LongitudFinal
        )
    ) AS transaccionesDebito,

    -- Agrupamos las transacciones de recarga en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionRecarga', tr.Id,
            'controlTransaccionRecarga', tr.ControlTransaccion,
            'montoRecarga', tr.Monto,
            'fechaHoraRecarga', tr.FechaHora,
            'latitudRecarga', tr.Latitud,
            'longitudRecarga', tr.Longitud
        )
    ) AS transaccionesRecarga

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE c.Id IN (${placeholders})

GROUP BY
    v.Id,
    v.Inicio,
    v.Fin,
    v.Estatus,
    c.Id,
    c.Nombre,
    c.ApellidoPaterno,
    c.ApellidoMaterno,
    o.Id,
    u.Nombre,
    u.ApellidoPaterno,
    u.ApellidoMaterno,
    d.Id,
    d.Nombre,
    r.Id,
    r.Nombre,
    reg.Id,
    reg.Nombre

ORDER BY v.Id DESC
LIMIT ? OFFSET ?;
    `;
    return this.viajestransaccionesRepository.query(query, [
      ...ids,
      limit,
      offset,
    ]);
  }

  private async consultarTotalViajesTransaccionesPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdRegion = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE c.Id IN (${placeholders})
`;
    return await this.viajestransaccionesRepository.query(query, [...ids]);
  }

  private async consultarViajesTransaccionesPaginadoCL(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const query = `
SELECT
    v.Id AS idViaje,
    v.Inicio AS inicioViaje,
    v.Fin AS finViaje,
    v.Estatus AS estatusViaje,

    -- Datos del Cliente
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente,

    -- Datos del Operador
    o.Id AS idOperador,
    u.Nombre AS nombreOperador,
    u.ApellidoPaterno AS apellidoPaternoOperador,
    u.ApellidoMaterno AS apellidoMaternoOperador,

    -- Información del variante, ruta y región
    d.Nombre AS nombreVariante,
    r.Nombre AS nombreRuta,
    reg.Nombre AS nombreRegion,

    -- Agrupamos las transacciones de débito en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionDebito', td.Id,
            'controlTransaccionDebito', td.ControlTransaccion,
            'montoDebito', td.Monto,
            'fechaHoraDebito', td.FechaHoraFinal,
            'latitudDebito', td.LatitudFinal,
            'longitudDebito', td.LongitudFinal
        )
    ) AS transaccionesDebito,

    -- Agrupamos las transacciones de recarga en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionRecarga', tr.Id,
            'controlTransaccionRecarga', tr.ControlTransaccion,
            'montoRecarga', tr.Monto,
            'fechaHoraRecarga', tr.FechaHora,
            'latitudRecarga', tr.Latitud,
            'longitudRecarga', tr.Longitud
        )
    ) AS transaccionesRecarga

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE c.Id = ?

GROUP BY
    v.Id,
    v.Inicio,
    v.Fin,
    v.Estatus,
    c.Id,
    c.Nombre,
    c.ApellidoPaterno,
    c.ApellidoMaterno,
    o.Id,
    u.Nombre,
    u.ApellidoPaterno,
    u.ApellidoMaterno,
    d.Id,
    d.Nombre,
    r.Id,
    r.Nombre,
    reg.Id,
    reg.Nombre

ORDER BY v.Id DESC; 
LIMIT ? OFFSET ?;
    `;
    return this.viajestransaccionesRepository.query(query, [
      cliente,
      limit,
      offset,
    ]);
  }

  private async consultarTotalViajesTransaccionesPaginadosCl(cliente: number) {
    const query = `  
    SELECT COUNT(*) AS total
FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE c.Id = ?
`;
    return await this.viajestransaccionesRepository.query(query, [cliente]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number) {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let viajestransacciones

      switch (rol) {
        case 1:
          viajestransacciones = await this.viajestransaccionesRepository.query(
            `
SELECT
    v.Id AS idViaje,
    v.Inicio AS inicioViaje,
    v.Fin AS finViaje,
    v.Estatus AS estatusViaje,

    -- Datos del Cliente
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente,

    -- Datos del Operador
    o.Id AS idOperador,
    u.Nombre AS nombreOperador,
    u.ApellidoPaterno AS apellidoPaternoOperador,
    u.ApellidoMaterno AS apellidoMaternoOperador,

    -- Información del variante, ruta y región
    d.Nombre AS nombreVariante,
    r.Nombre AS nombreRuta,
    reg.Nombre AS nombreRegion,

    -- Agrupamos las transacciones de débito en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionDebito', td.Id,
            'controlTransaccionDebito', td.ControlTransaccion,
            'montoDebito', td.Monto,
            'fechaHoraDebito', td.FechaHoraFinal,
            'latitudDebito', td.LatitudFinal,
            'longitudDebito', td.LongitudFinal
        )
    ) AS transaccionesDebito,

    -- Agrupamos las transacciones de recarga en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionRecarga', tr.Id,
            'controlTransaccionRecarga', tr.ControlTransaccion,
            'montoRecarga', tr.Monto,
            'fechaHoraRecarga', tr.FechaHora,
            'latitudRecarga', tr.Latitud,
            'longitudRecarga', tr.Longitud
        )
    ) AS transaccionesRecarga

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id



GROUP BY
    v.Id,
    v.Inicio,
    v.Fin,
    v.Estatus,
    c.Id,
    c.Nombre,
    c.ApellidoPaterno,
    c.ApellidoMaterno,
    o.Id,
    u.Nombre,
    u.ApellidoPaterno,
    u.ApellidoMaterno,
    d.Id,
    d.Nombre,
    r.Id,
    r.Nombre,
    reg.Id,
    reg.Nombre

ORDER BY v.Id DESC
LIMIT ? OFFSET ?;
              `,
            [limit, offset],
          );
          // Query para total (sin paginación)
          totalResult = await this.viajestransaccionesRepository.query(
            `
   SELECT COUNT(*) AS total
FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id


  `,
          );
          break;
        case 2: // Administrador
        case 8: // Reportes
        case 10: // Capturista
          viajestransacciones = await this.consultarTotalViajesTransaccionesPaginados(cliente);

          totalResult = await this.consultarTotalViajesTransaccionesPaginados(cliente);
          break;

        case 3: // Operador
        default:
          viajestransacciones = await this.consultarTotalViajesTransaccionesPaginadosCl(cliente);

          totalResult = await this.consultarTotalViajesTransaccionesPaginadosCl(cliente);
          break;
      }

      const total = Number(totalResult[0]?.total || 0);
      const data = viajestransacciones.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
      }));
      const result: ApiResponseCommon = {
        data: viajestransacciones,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }

  async findOneViajes(id: number) {
    try {
      const viajestransacciones = await this.viajestransaccionesRepository.query(
        `
SELECT
    v.Id AS idViaje,
    v.Inicio AS inicioViaje,
    v.Fin AS finViaje,
    v.Estatus AS estatusViaje,

    -- Datos del Cliente
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente,

    -- Datos del Operador
    o.Id AS idOperador,
    u.Nombre AS nombreOperador,
    u.ApellidoPaterno AS apellidoPaternoOperador,
    u.ApellidoMaterno AS apellidoMaternoOperador,

    -- Información del variante, ruta y región
    d.Nombre AS nombreVariante,
    r.Nombre AS nombreRuta,
    reg.Nombre AS nombreRegion,

    -- Agrupamos las transacciones de débito en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionDebito', td.Id,
            'controlTransaccionDebito', td.ControlTransaccion,
            'montoDebito', td.Monto,
            'fechaHoraDebito', td.FechaHoraFinal,
            'latitudDebito', td.LatitudFinal,
            'longitudDebito', td.LongitudFinal
        )
    ) AS transaccionesDebito,

    -- Agrupamos las transacciones de recarga en un JSON Array
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idTransaccionRecarga', tr.Id,
            'controlTransaccionRecarga', tr.ControlTransaccion,
            'montoRecarga', tr.Monto,
            'fechaHoraRecarga', tr.FechaHora,
            'latitudRecarga', tr.Latitud,
            'longitudRecarga', tr.Longitud
        )
    ) AS transaccionesRecarga

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Transacciones relacionadas al viaje (usamos LEFT JOIN para permitir que los viajes sin transacciones también aparezcan)
LEFT JOIN ViajesTransacciones vt ON vt.IdViaje = v.Id
LEFT JOIN HistoricoTransaccionesDebito td ON vt.IdTransaccionDebito = td.Id
LEFT JOIN HistoricoTransaccionesRecarga tr ON vt.IdTransaccionRecarga = tr.Id

WHERE v.Id = ?

GROUP BY
    v.Id,
    v.Inicio,
    v.Fin,
    v.Estatus,
    c.Id,
    c.Nombre,
    c.ApellidoPaterno,
    c.ApellidoMaterno,
    o.Id,
    u.Nombre,
    u.ApellidoPaterno,
    u.ApellidoMaterno,
    d.Id,
    d.Nombre,
    r.Id,
    r.Nombre,
    reg.Id,
    reg.Nombre

ORDER BY v.Id DESC
              `,
        [id],
      );
      const data = viajestransacciones.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
      }));
      const result: ApiResponseCommon = {
        data: viajestransacciones,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }

  async findOneTransacciones(id: number) {
    try {
      const viajestransacciones = await this.viajestransaccionesRepository.query(
        `
SELECT 
  vt.IdViaje AS idViaje,
  v.Inicio AS inicioViaje,
  v.Fin AS finViaje,
  v.IdCliente AS idCliente,
  v.IdOperador AS idOperador,
  v.IdTurno AS idTurno,
  v.IdVariante AS idVariante,

  t.Id AS IdTransaccion,
  t.TipoTransaccion AS tipoTransaccion,
  t.Monto AS monto,
  t.Latitud AS latitud,
  t.Longitud AS longitud,
  t.FechaHora AS fecheHora,
  t.FHRegistro AS fhRegistro,
  t.NumeroSerieMonedero AS NumeroSerieMonedero,
  t.NumeroSerieValidador AS numeroSerieValidador 

FROM ViajesTransacciones vt
INNER JOIN Viajes v ON v.Id = vt.IdViaje
INNER JOIN Transacciones t ON t.Id = vt.IdTransaccion
WHERE t.Id = ?
ORDER BY v.Id DESC;
              `,
        [id],
      );
      const data = viajestransacciones.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idTransaccion: Number(item.idTransaccion),
        monto: Number(item.monto),
      }));
      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Ocurrió un error al intentar obtener un listado de viajestransacciones.',
        error: error.message,
      });
    }
  }
}
