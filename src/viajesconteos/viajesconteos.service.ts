import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { CreateViajesconteoDto } from './dto/create-viajesconteo.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ViajesConteos } from 'src/entities/ViajesConteos';
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
export class ViajesconteosService {
  constructor(
    @InjectRepository(ViajesConteos)
    private readonly viajesconteosRepository: Repository<ViajesConteos>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(idUser: number, createViajesconteoDto: CreateViajesconteoDto) {
    try {
      const newViajesConteos = await this.viajesconteosRepository.create(
        createViajesconteoDto,
      );
      const viajesconteosSave =
        await this.viajesconteosRepository.save(newViajesConteos);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajesconteoDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesConteos',
        `Se creó el viajesconteos con viaje ID: ${createViajesconteoDto.idViaje} y conteo ID: ${createViajesconteoDto.idConteo}`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.VIAJESCONTEOS,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El viajeconteo ha sido creado exitosamente.',
        data: {
          id: Number(viajesconteosSave.idConteo),
          nombre:
            `Viaje ID: ${viajesconteosSave.idConteo} Transaccion ID: ${viajesconteosSave.idViaje} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createViajesconteoDto };
      await this.bitacoraLogger.logToBitacora(
        'ViajesConteos',
        `Se creó el viajesconteos con viaje ID: ${createViajesconteoDto.idViaje} y conteo ID: ${createViajesconteoDto.idConteo}`,
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
        message: `Se produjo un error al crear el viajesconteo.`,
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
  private async consultarViajesConteos(cliente: number) {
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

    -- Agrupamos los conteos en un JSON
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idConteo', cp.Id,
            'entradas', cp.Entradas,
            'salidas', cp.Salidas,
            'diferencia', cp.Diferencia,
            'fechaHora', cp.FechaHora,
            'fhRegistro', cp.FHRegistro,
            'numeroSerieContador', cp.NumeroSerieContador
        )
    ) AS conteos

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

WHERE v.Estatus = 1 -- opcional, filtrar viajes activos
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

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
    return this.viajesconteosRepository.query(query, [...ids]);
  }

  // Consultar posiciones para roles que usan solo el cliente actual
  private async consultarViajesConteosCL(cliente: number) {
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

    -- Agrupamos los conteos en un JSON
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idConteo', cp.Id,
            'entradas', cp.Entradas,
            'salidas', cp.Salidas,
            'diferencia', cp.Diferencia,
            'fechaHora', cp.FechaHora,
            'fhRegistro', cp.FHRegistro,
            'numeroSerieContador', cp.NumeroSerieContador
        )
    ) AS conteos

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

WHERE v.Estatus = 1 -- opcional, filtrar viajes activos
AND c = ?

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
    return this.viajesconteosRepository.query(query, [cliente]);
  }

  async findAllList(
    idUser: number,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let viajesconteos;

      switch (rol) {
        case 1: // Super Admin
          viajesconteos = await this.viajesconteosRepository.query(
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

    -- Agrupamos los conteos en un JSON
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idConteo', cp.Id,
            'entradas', cp.Entradas,
            'salidas', cp.Salidas,
            'diferencia', cp.Diferencia,
            'fechaHora', cp.FechaHora,
            'fhRegistro', cp.FHRegistro,
            'numeroSerieContador', cp.NumeroSerieContador
        )
    ) AS conteos

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

WHERE v.Estatus = 1 -- opcional, filtrar viajes activos

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
          viajesconteos = await this.consultarViajesConteos(cliente);
          break;

        default:
        case 3: // Operador
          viajesconteos = await this.consultarViajesConteosCL(cliente);
          break;
      }

      const _data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idConteo: Number(item.idConteo),
      }));
      const result: ApiResponseCommon = {
        data: viajesconteos,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Ocurrió un error al intentar obtener un listado de viajesconteos.',
        error: error.message,
      });
    }
  }

  private async consultarPoscionesPaginado(
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

    -- Agrupamos los conteos en un JSON
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idConteo', cp.Id,
            'entradas', cp.Entradas,
            'salidas', cp.Salidas,
            'diferencia', cp.Diferencia,
            'fechaHora', cp.FechaHora,
            'fhRegistro', cp.FHRegistro,
            'numeroSerieContador', cp.NumeroSerieContador
        )
    ) AS conteos

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

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
    return this.viajesconteosRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalPoscionesPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.viajesconteosRepository.query(query, [...ids]);
  }

  private async consultarPoscionesPaginadoCL(
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

    -- Agrupamos los conteos en un JSON
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idConteo', cp.Id,
            'entradas', cp.Entradas,
            'salidas', cp.Salidas,
            'diferencia', cp.Diferencia,
            'fechaHora', cp.FechaHora,
            'fhRegistro', cp.FHRegistro,
            'numeroSerieContador', cp.NumeroSerieContador
        )
    ) AS conteos

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

AND c.Id = ?   -- 🔹 aquí colocas el ID del cliente que quieres consultar

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
    return this.viajesconteosRepository.query(query, [cliente, limit, offset]);
  }

  private async consultarTotalPoscionesPaginadosCl(cliente: number) {
    const query = `  
    SELECT COUNT(*) AS total
FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

AND c.Id = ?   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.viajesconteosRepository.query(query, [cliente]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ) {
    try {
      const offset = (page - 1) * limit;
      let viajesconteos;
      let totalResult;
      switch (rol) {
        case 1:
          viajesconteos = await this.viajesconteosRepository.query(
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

    -- Agrupamos los conteos en un JSON
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idConteo', cp.Id,
            'entradas', cp.Entradas,
            'salidas', cp.Salidas,
            'diferencia', cp.Diferencia,
            'fechaHora', cp.FechaHora,
            'fhRegistro', cp.FHRegistro,
            'numeroSerieContador', cp.NumeroSerieContador
        ) 
    ) AS conteos

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

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
          totalResult = await this.viajesconteosRepository.query(
            `
    SELECT COUNT(*) AS total
FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

  `,
          );
          break;
        case 2: // Administrador
        case 8: // Reportes
        case 10: // Capturista
          viajesconteos = await this.consultarPoscionesPaginado(
            cliente,
            limit,
            offset,
          );

          totalResult = await this.consultarTotalPoscionesPaginados(cliente);
          break;

        default:
        case 3: // Operador
          viajesconteos = await this.consultarPoscionesPaginadoCL(
            cliente,
            limit,
            offset,
          );

          totalResult = await this.consultarTotalPoscionesPaginadosCl(cliente);
          break;
      }

      const total = Number(totalResult[0]?.total || 0);
      const data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idConteo: Number(item.idConteo),
      }));
      const result: ApiResponseCommon = {
        data: data,
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
        message: `Se produjo un error al obtener la paginación de viajesconteos.`,
        error: error.message,
      });
    }
  }

  async findOneViajes(id: number) {
    try {
      const viajesconteos = await this.viajesconteosRepository.query(
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

    -- Agrupamos los conteos en un JSON
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'idConteo', cp.Id,
            'entradas', cp.Entradas,
            'salidas', cp.Salidas,
            'diferencia', cp.Diferencia,
            'fechaHora', cp.FechaHora,
            'fhRegistro', cp.FHRegistro,
            'numeroSerieContador', cp.NumeroSerieContador
        )
    ) AS conteos

FROM Viajes v
INNER JOIN Clientes c ON v.IdCliente = c.Id
INNER JOIN Operadores o ON v.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Variantes d ON v.IdVariante = d.Id
INNER JOIN Rutas r ON d.IdRuta = r.Id
INNER JOIN Zonas reg ON r.IdZona = reg.Id

-- Conteos relacionados al viaje
LEFT JOIN ViajesConteos vc ON vc.IdViaje = v.Id
LEFT JOIN ConteoPasajeros cp ON cp.Id = vc.IdConteo

AND v.Id = ?   -- 🔹 aquí colocas el ID del cliente que quieres consultar

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
      const _data = viajesconteos.map((item) => ({
        ...item,
        idViaje: Number(item.idViaje),
        idCliente: Number(item.idCliente),
        idTurno: Number(item.idTurno),
        idOperador: Number(item.idOperador),
        idVariante: Number(item.idVariante),
        idConteo: Number(item.idConteo),
      }));
      const result: ApiResponseCommon = {
        data: viajesconteos,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message:
          'Ocurrió un error al intentar obtener un listado de viajesconteos.',
        error: error.message,
      });
    }
  }
}
