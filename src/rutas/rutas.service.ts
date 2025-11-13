import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateRutaDto } from "./dto/create-ruta.dto";
import { UpdateRutaDto } from "./dto/update-ruta.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Zonas } from "src/entities/Zonas";
import { Rutas } from "src/entities/Rutas";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { UsuariosZonas } from "src/entities/UsuariosZonas";
import { UpdateRutasEstatusDto } from "./dto/update-ruta-estatus.dto";
import { Clientes } from "src/entities/Clientes";

@Injectable()
export class RutasService {
  constructor(
    @InjectRepository(Zonas)
    private readonly zonasRepository: Repository<Zonas>,
    @InjectRepository(Rutas)
    private readonly rutasRepository: Repository<Rutas>,
    @InjectRepository(UsuariosZonas)
    private readonly usuariozonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}

  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createRutaDto: CreateRutaDto
  ): Promise<ApiCrudResponse> {
    try {
      let Zona;

      Zona = await this.zonasRepository.findOne({
        where: { id: createRutaDto.idZona },
      });
      if (!Zona) throw new NotFoundException("Zona no encontrada");

      const newRuta = this.rutasRepository.create(createRutaDto);
      const rutaSave = await this.rutasRepository.save(newRuta);

      // Registro en la bitácora SUCCESS
      const querylogger = { createRutaDto };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se creó una ruta con nombre: ${rutaSave.nombre}  y Id ${rutaSave.id}`,
        "CREATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.SUCCESS
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "Ruta creada correctamente",
        data: {
          id: Number(rutaSave.id),
          nombre: `Ruta ${rutaSave.id} Nombre: ${rutaSave.nombre}`,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createRutaDto };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se creó una ruta con nombre: ${createRutaDto.nombre}`,
        "CREATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al crear ruta",
        error: error.message,
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    const clientesFiltrado = await this.clienteRepository.query(
      `CALL spGetClientes(?);`,
      [cliente]
    );

    const idsFiltrados = clientesFiltrado[0]; // El primer índice contiene los resultados
    const ids = idsFiltrados
      .map((clientesFiltrado: any) => Number(clientesFiltrado.Id))
      .filter(Boolean);
    if (ids.length === 0) {
      return { data: [] }; // No hay clientes que consultar
    }

    // 3. Construir el query dinámico con los IDs
    const placeholders = ids.map(() => "?").join(", ");
    return { ids, placeholders };
  }

  private async consultarRutasPaginado(
    cliente: number,
    limit: number,
    offset: number
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
  r.Estatus = 1
  AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY ru.Id DESC


  LIMIT ? OFFSET ?;
    `;
    return this.usuariozonasRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalRutasPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
  SELECT COUNT(*) AS total
FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
  r.Estatus = 1
  AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.usuariozonasRepository.query(query, [...ids]);
  }

  async obtenerRutasPorUsuarioSQL(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ) {
    const offset = (page - 1) * limit;
    let data;
    let totalResult;
    switch (rol) {
      case 1:
        // Consulta de datos paginados Usuario SuperAdministrador
        data = await this.usuariozonasRepository.query(
          `
SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
  r.Estatus = 1
ORDER BY ru.Id DESC

  LIMIT ? OFFSET ?;
  `,
          [limit, offset]
        );

        // Query para total (sin paginación)
        totalResult = await this.usuariozonasRepository.query(
          `
  SELECT COUNT(*) AS total
FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
  r.Estatus = 1
  `
        );
        break;

      case 2:
        // Consulta de datos paginados Usuario Administrador
        data = await this.consultarRutasPaginado(cliente, limit, offset);

        // Query para total (sin paginación)
        totalResult = await this.consultarTotalRutasPaginados(cliente);
        break;

      case 8:
        // Consulta de datos paginados Usuario Reportes
        data = await this.consultarRutasPaginado(cliente, limit, offset);

        // Query para total (sin paginación)
        totalResult = await this.consultarTotalRutasPaginados(cliente);
        break;

      case 10:
        // Consulta de datos paginados Usuario Capturista
        data = await this.consultarRutasPaginado(cliente, limit, offset);

        // Query para total (sin paginación)
        totalResult = await this.consultarTotalRutasPaginados(cliente);
        break;

      default:
        // Consulta de datos paginados resto Usuario
        data = await this.usuariozonasRepository.query(
          `
SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

  FROM UsuariosZonas ur
  INNER JOIN Zonas r ON ur.IdZona = r.Id
  INNER JOIN Rutas ru ON ru.IdZona = r.Id
  LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
  INNER JOIN Clientes c ON r.IdCliente = c.Id

  WHERE ur.IdUsuario = ?
    AND ur.Estatus = 1
    AND r.Estatus = 1
  
  ORDER BY ru.Id DESC
  LIMIT ? OFFSET ?;
  `,
          [idUser, limit, offset]
        );

        // Query para total (sin paginación)
        totalResult = await this.usuariozonasRepository.query(
          `
    SELECT COUNT(*) AS total
  FROM UsuariosZonas ur
  INNER JOIN Zonas r ON ur.IdZona = r.Id
  INNER JOIN Rutas ru ON ru.IdZona = r.Id
  LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
  INNER JOIN Clientes c ON r.IdCliente = c.Id

  WHERE ur.IdUsuario = ?
    AND ur.Estatus = 1
    AND r.Estatus = 1
  `,
          [idUser]
        );
        break;
    }

    const total = Number(totalResult[0]?.total || 0);

    // Mapeo de resultados con conversión de tipos y manejo de idZonaFin
    const rutas = data.map((item) => ({
      ...item,
      id: item.id ? Number(item.id) : null,
      idZona: item.idZona ? Number(item.idZona) : null,
      idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
      idZonaFinDetalle: item.idZonaFinDetalle
        ? Number(item.idZonaFinDetalle)
        : null,
      idCliente: item.idCliente ? Number(item.idCliente) : null,
    }));

    return {
      data: rutas,
      pagination: {
        total,
        page,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  private async consultarRutasListado(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
    SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
      c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
ORDER BY ru.Id DESC;
    `;
    return await this.usuariozonasRepository.query(query, [...ids]);
  }

  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let rutas;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario Administrador
          rutas = await this.usuariozonasRepository.query(
            `
SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
  r.Estatus = 1
  AND ru.Estatus = 1
  AND c.Estatus = 1
ORDER BY ru.Id DESC
  `
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          rutas = await this.consultarRutasListado(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          rutas = await this.consultarRutasListado(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          rutas = await this.consultarRutasListado(cliente);
          break;

        default:
          // Consulta de datos paginados Usuario
          rutas = await this.usuariozonasRepository.query(
            `
            SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM UsuariosZonas ur
INNER JOIN Zonas r ON ur.IdZona = r.Id            -- Zona inicial
INNER JOIN Rutas ru ON ru.IdZona = r.Id              -- Ruta
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id        -- Zona final (puede ser null)
INNER JOIN Clientes c ON r.IdCliente = c.Id            -- Cliente

WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND c.Estatus = 1

ORDER BY ru.Id DESC;

            `,
            [idUser]
          );
          break;
      }

      if (rutas.length === 0) {
        throw new NotFoundException("Rutas no encontradas");
      }

      // Mapeo de resultados con conversión de tipos y manejo de idZonaFin
      const data = rutas.map((item) => ({
        ...item,
        id: item.id ? Number(item.id) : null,
        idZona: item.idZona ? Number(item.idZona) : null,
        idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
        idZonaFinDetalle: item.idZonaFinDetalle
          ? Number(item.idZonaFinDetalle)
          : null,
        idCliente: item.idCliente ? Number(item.idCliente) : null,
      }));

      // API response
      const result: ApiResponseCommon = {
        data: data,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al obtener listado de rutas",
        error: error.message,
      });
    }
  }

  private async consultarRutasOne(id: number, cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
     SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
      c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND r.Estatus = 1
  AND ru.Id = ?
ORDER BY ru.Id DESC;
    `;
    return await this.usuariozonasRepository.query(query, [...ids, id]);
  }

  async findOne(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let ruta;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          ruta = await this.usuariozonasRepository.query(
            `
     SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Rutas ru
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE r.Estatus = 1
  AND ru.Id = ?
ORDER BY ru.Id DESC;

            `,
            [id]
          );
          break;

        case 2:
          ruta = await this.consultarRutasOne(id, cliente);
          break;

        case 8:
          ruta = await this.consultarRutasOne(id, cliente);
          break;

        case 10:
          ruta = await this.consultarRutasOne(id, cliente);
          break;

        default:
          // Consulta de datos paginados Usuario
          ruta = await this.usuariozonasRepository.query(
            `
            SELECT 
  -- RUTA
    ru.Id AS id,
    ru.Nombre AS nombre,
    ru.PuntoInicio AS puntoInicio,
    ru.NombreInicio AS nombreInicio,
    ru.PuntoFin AS puntoFin,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,
    ru.IdZonaFin AS idZonaFin,

  -- Zona INICIAL
  r.Id AS idZona,
  r.Nombre AS nombreZona,
  r.Descripcion AS descripcionZona,
  r.FechaCreacion AS fechaCreacionZona,
  r.FechaActualizacion AS fechaActualizacionZona,
  r.Estatus AS estatusZona,

  -- Zona FINAL (si existe)
  rf.Id AS idZonaFinDetalle,
  rf.Nombre AS nombreZonaFinDetalle,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- CLIENTE
  c.Id AS idCliente,
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM UsuariosZonas ur
INNER JOIN Zonas r ON ur.IdZona = r.Id            -- Zona inicial
INNER JOIN Rutas ru ON ru.IdZona = r.Id              -- Ruta
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id        -- Zona final (puede ser null)
INNER JOIN Clientes c ON r.IdCliente = c.Id            -- Cliente

WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Id = ?

ORDER BY ru.Id DESC;

            `,
            [idUser, id]
          );
          break;
      }

      if (ruta.length == 0) {
        throw new NotFoundException("Ruta no encontrado");
      }

      // Conversión directa de IDs
      const Zona = ruta.idZona2;

      const data = ruta.map((item) => ({
        ...item,
        id: Number(item.id),
        idZona: Number(item.idZona),
        idZonaFin: Number(item.idZonaFin),
        idZonaFinDetalle: Number(item.idZonaFinDetalle),
        idCliente: Number(item.idCliente),
      }));

      //APi response
      const result: ApiResponseCommon = {
        data: data,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al obtener una ruta",
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateRutasEstatusDto: UpdateRutasEstatusDto
  ) {
    try {
      const ruta = await this.rutasRepository.findOne({ where: { id: id } });
      if (!ruta) throw new NotFoundException("Ruta no encontrada");

      const estatus = updateRutasEstatusDto.estatus;
      await this.rutasRepository.update(id, { estatus: estatus });

      // Registro en la bitácora SUCCESS
      const querylogger = { updateRutasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se actualizo estatus a ${estatus}  de una Ruta con Id: ${ruta.id}`,
        "UPDATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.SUCCESS
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "Estatus de la ruta actualizada correctamente",
        data: {
          id: id,
          nombre: `Ruta ${id} `,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateRutasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se actualizo estatus a ${updateRutasEstatusDto.estatus}  de una Ruta con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar estatus de una ruta",
        error: error.message,
      });
    }
  }

  async update(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateRutaDto: UpdateRutaDto
  ) {
    try {
      const ruta = await this.rutasRepository.findOne({ where: { id: id } });
      if (!ruta) throw new NotFoundException("Ruta no encontrada");

      await this.rutasRepository.update(id, updateRutaDto);

      // Registro en la bitácora SUCCESS
      const querylogger = { updateRutaDto };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se actualizo una Rutas con Id: ${ruta.id}`,
        "UPDATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.SUCCESS
      );

      // API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Ruta actualizada correctamente",
        data: {
          id: id,
          nombre: `Ruta ${id} `,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateRutaDto };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se actualizo una Ruta con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar ruta",
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number, rol: number) {
    try {
      const ruta = await this.rutasRepository.findOne({ where: { id: id } });
      if (!ruta) throw new NotFoundException("Ruta no encontrada");

      await this.rutasRepository.update(id, { estatus: 0 });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se elimino una Ruta con Id: ${ruta.id}`,
        "UPDATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.SUCCESS
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "Ruta eliminada logicamente correctamente",
        data: {
          id: id,
          nombre: `Ruta ${id}, Nombre: ${ruta.nombre} `,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se elimino una Ruta con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al eliminado logico una ruta",
        error: error.message,
      });
    }
  }

  async removeTotal(id: number, idUser: number, rol: number) {
    try {
      let ruta;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador
          ruta = await this.rutasRepository.findOne({
            where: { id: id },
          });
          if (!ruta) throw new NotFoundException("Ruta no encontrada");
          break;

        default:
          // Usuarios normales - solo sus Zonas asignadas
          throw new BadRequestException(`Acceso denegado`);
          break;
      }

      await this.rutasRepository.delete({ id: id });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se elimino una Ruta con Id: ${ruta.id}`,
        "DELETE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.SUCCESS
      );

      // API response (con mensajes corregidos)
      const result: ApiCrudResponse = {
        status: "success",
        message: "Ruta eliminada correctamente", // ✅ Corregido
        data: {
          id: id,
          nombre: `Ruta ${id}, Nombre: ${ruta.nombre} `, // ✅ Mejorado
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Rutas",
        `Se elimino una Ruta con Id: ${id}`,
        "DELETE",
        querylogger,
        idUser,
        17,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al eliminado permanente una ruta",
        error: error.message,
      });
    }
  }
}
