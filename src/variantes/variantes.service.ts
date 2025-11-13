import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateVariantesDto } from "./dto/create-variantes.dto";
import { UpdateVariantesDto } from "./dto/update-variantes.dto";
import { generarRecorridoDetallado } from "../utils/recorrido.utils";
import {
  ApiVariantesResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "../common/ApiResponse";
import { InjectRepository } from "@nestjs/typeorm";
import { Rutas } from "src/entities/Rutas";
import { Repository } from "typeorm";
import { Variantes } from "src/entities/Variantes";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import { UsuariosZonas } from "src/entities/UsuariosZonas";
import { UpdateVariantesEstatusDto } from "./dto/update-variantes-estatus.dto";
import { Clientes } from "src/entities/Clientes";

@Injectable()
export class VariantesService {
  constructor(
    @InjectRepository(Rutas)
    private readonly rutasRepository: Repository<Rutas>,
    @InjectRepository(UsuariosZonas)
    private readonly usuariosZonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Variantes)
    private readonly VariantesRepository: Repository<Variantes>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}

  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createVariantesDto: CreateVariantesDto
  ) {
    try {
      const { recorridoDetallado: puntos } = createVariantesDto;
      const newVariantes =
        await this.VariantesRepository.create(createVariantesDto);

      // Aplicamos interpolación
      const { recorridoDetallado, distanciaKm } =
        await generarRecorridoDetallado(puntos as any);

      newVariantes.recorridoInterpolar = recorridoDetallado;

      const Variantesave = await this.VariantesRepository.save(newVariantes);

      // Registro en la bitácora SUCCESS
      const querylogger = { createVariantesDto };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se creó un Variantes con nombre: ${Variantesave.nombre} y Id: ${Variantesave.id}`,
        "CREATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiVariantesResponse = {
        status: "succes",
        message: "Se creo correctamente Variantes",
        id: Number(Variantesave.id),
        nombre: Variantesave.nombre,
        distancia: Number(Variantesave.distanciaKm),
        estatus: Variantesave.estatus,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createVariantesDto };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se creó un Variantes con nombre: ${createVariantesDto.nombre}`,
        "CREATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al crear Variantes",
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

  private async consultarVariantesPaginado(
    cliente: number,
    limit: number,
    offset: number
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas

ORDER BY d.Id DESC

  LIMIT ? OFFSET ?;
    `;
    return this.usuariosZonasRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalVariantesPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas
`;
    return await this.usuariosZonasRepository.query(query, [...ids]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let data;
      let totalResult;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuariosZonasRepository.query(
            `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas

ORDER BY d.Id DESC

  LIMIT ? OFFSET ?;
  `,
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.usuariosZonasRepository.query(
            `
    SELECT COUNT(*) AS total
FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas
  `
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          data = await this.consultarVariantesPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalVariantesPaginados(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarVariantesPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalVariantesPaginados(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          data = await this.consultarVariantesPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalVariantesPaginados(cliente);
          break;

        default:
          // Consulta de datos paginados Usuario
          data = await this.usuariosZonasRepository.query(
            `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

  FROM Variantes d
  INNER JOIN Rutas ru ON d.IdRuta = ru.Id
  INNER JOIN Zonas r ON ru.IdZona = r.Id
  LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
  INNER JOIN Clientes c ON r.IdCliente = c.Id
  INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

  WHERE ur.IdUsuario = 1
    AND ur.Estatus = 1
    AND r.Estatus = 1
    AND ru.Estatus = 1

  ORDER BY d.Id DESC
  LIMIT ? OFFSET ?
  `,
            [idUser, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.usuariosZonasRepository.query(
            `
SELECT COUNT(*) AS total
  INNER JOIN Rutas ru ON d.IdRuta = ru.Id
  INNER JOIN Zonas r ON ru.IdZona = r.Id
  LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
  INNER JOIN Clientes c ON r.IdCliente = c.Id
  INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

  WHERE ur.IdUsuario = ?
    AND ur.Estatus = 1
    AND r.Estatus = 1
    AND ru.Estatus = 1
  `,
            [idUser]
          );
          break;
      }

      const total = Number(totalResult[0]?.total ?? 0);

      const Variantes = data.map((item) => ({
        ...item,
        id: Number(item.id),
        idRuta: Number(item.idRuta),
        idZonasInicio: Number(item.idZonasInicio),
        idZonasFin: item.idZonasFin ? Number(item.idZonasFin) : null,
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      // Transformación de resultados
      const result: ApiResponseCommon = {
        data: Variantes,
        paginated: {
          total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: "Error al obtener paginado Variantes",
        error: error.message,
      });
    }
  }

  private async consultarVariantesListado(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas
  AND d.Estatus = 1

ORDER BY d.Id DESC
    `;
    return this.usuariosZonasRepository.query(query, [...ids]);
  }

  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuariosZonasRepository.query(
            `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Estatus = 1
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas
  AND d.Estatus = 1

ORDER BY d.Id DESC
      `
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          data = await this.consultarVariantesListado(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarVariantesListado(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          data = await this.consultarVariantesListado(cliente);
          break;

        default:
          // Consulta de datos paginados Usuario
          data = await this.usuariosZonasRepository.query(
            `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

  FROM Variantes d
  INNER JOIN Rutas ru ON d.IdRuta = ru.Id
  INNER JOIN Zonas r ON ru.IdZona = r.Id
  LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
  INNER JOIN Clientes c ON r.IdCliente = c.Id
  INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

  WHERE ur.IdUsuario = ?
    AND ur.Estatus = 1
    AND r.Estatus = 1
    AND ru.Estatus = 1
    AND d.Estatus = 1

  ORDER BY d.Id DESC
      `,
            [idUser] // parámetro seguro
          );
          break;
      }

      const Variantes = data.map((item) => ({
        ...item,
        id: Number(item.id),
        idRuta: Number(item.idRuta),
        idZonasInicio: Number(item.idZonasInicio),
        idZonasFin: item.idZonasFin ? Number(item.idZonasFin) : null,
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      // Transformación de resultados
      const result: ApiResponseCommon = {
        data: Variantes,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: "Error al obtener listado Variantes",
        error: error.message,
      });
    }
  }

  private async consultarVariantesOne(cliente: number, id: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas
  AND d.Id = ?

ORDER BY d.Id DESC
    `;
    return this.usuariosZonasRepository.query(query, [...ids, id]);
  }

  async findOne(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuariosZonasRepository.query(
            `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Estatus = 1
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo ZonasUsuariosZonas activas
  AND d.Id = ?

ORDER BY d.Id DESC
      `,
            [id] // parámetro seguro
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          data = await this.consultarVariantesOne(cliente, id);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarVariantesOne(cliente, id);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          data = await this.consultarVariantesOne(cliente, id);
          break;

        default:
          // Consulta de datos paginados Usuario
          data = await this.usuariosZonasRepository.query(
            `
  SELECT 
    -- Datos del Variantes (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariantes,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariantes,
    d.Estatus AS estatusVariantes,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zonas de inicio
    r.Id AS idZonasInicio,
    r.Nombre AS nombreZonasInicio,
    r.Descripcion AS descripcionZonasInicio,
    r.FechaCreacion AS fechaCreacionZonasInicio,
    r.FechaActualizacion AS fechaActualizacionZonasInicio,
    r.Estatus AS estatusZonasInicio,

    -- Zonas de fin
    rf.Id AS idZonasFin,
    rf.Nombre AS nombreZonasFin,
    rf.Descripcion AS descripcionZonasFin,
    rf.FechaCreacion AS fechaCreacionZonasFin,
    rf.FechaActualizacion AS fechaActualizacionZonasFin,
    rf.Estatus AS estatusZonasFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno As apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

  FROM Variantes d
  INNER JOIN Rutas ru ON d.IdRuta = ru.Id
  INNER JOIN Zonas r ON ru.IdZona = r.Id
  LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
  INNER JOIN Clientes c ON r.IdCliente = c.Id
  INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

  WHERE ur.IdUsuario = ?
    AND ur.Estatus = 1
    AND r.Estatus = 1
    AND ru.Estatus = 1
    AND d.Id = ?

  ORDER BY d.Id DESC
      `,
            [idUser, id] // parámetro seguro
          );
          break;
      }

      if (data.length === 0) {
        throw new NotFoundException("Variantes no encontradas");
      }

      const Variantes = data.map((item) => ({
        ...item,
        id: Number(item.id),
        idRuta: Number(item.idRuta),
        idZonasInicio: Number(item.idZonasInicio),
        idZonasFin: item.idZonasFin ? Number(item.idZonasFin) : null,
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      return { data: Variantes };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: "Error al obtener Variantes por ID",
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateVariantesEstatusDto: UpdateVariantesEstatusDto
  ) {
    try {
      let Variantes;
      Variantes = await this.VariantesRepository.findOne({
        where: { id: id },
      });
      if (!Variantes) throw new NotFoundException("Variantes no encontrado");

      //actualizacion de estatus
      const estatus = updateVariantesEstatusDto.estatus;
      await this.VariantesRepository.update(id, { estatus: estatus });

      // Registro en la bitácora SUCCESS
      const querylogger = { updateVariantesEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se actualizo estatus a ${updateVariantesEstatusDto.estatus} de un Variantes con nombre: ${Variantes.nombre}  y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiVariantesResponse = {
        status: "success",
        message: "Se actualizo correctamente estatus del Variantes",
        id: Number(Variantes.id),
        nombre: Variantes.nombre,
        distancia: Number(Variantes.distanciaKm),
        estatus: estatus,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateVariantesEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se actualizo estatus a ${updateVariantesEstatusDto.estatus} de un Variantes con ID: ${id} y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: "Error al actualizar estatus Variantes",
        error: error.message,
      });
    }
  }

  async update(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateVariantesDto: UpdateVariantesDto
  ) {
    try {
      let newVariantes = this.VariantesRepository.create(updateVariantesDto);

      if (
        Array.isArray(updateVariantesDto.recorridoDetallado) &&
        updateVariantesDto.recorridoDetallado.length > 0
      ) {
        const puntos = updateVariantesDto.recorridoDetallado;

        const { recorridoDetallado: nuevoRecorrido, distanciaKm } =
          await generarRecorridoDetallado(puntos as any);

        newVariantes.recorridoInterpolar = nuevoRecorrido;
      }

      await this.VariantesRepository.update(id, newVariantes);

      // Registro en la bitácora SUCCESS
      const querylogger = { updateVariantesDto };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se actualizo un Variantes con nombre: ${newVariantes.nombre} y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiVariantesResponse = {
        status: "succes",
        message: "Se actualizo correctamente Variantes",
        id: id,
        nombre: newVariantes.nombre,
        distancia: Number(newVariantes.distanciaKm),
        estatus: newVariantes.estatus,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateVariantesDto };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se actualizo un Variantes con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar Variantes",
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let Variantes;
      Variantes = await this.VariantesRepository.findOne({
        where: { id: id },
      });
      if (!Variantes) throw new NotFoundException("Variantes no encontrado");

      //eliminado logico
      await this.VariantesRepository.update(id, { estatus: 0 });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se elimino estatus a ${0} de un Variantes con nombre: ${Variantes.nombre} y Id ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiVariantesResponse = {
        status: "succes",
        message: "Se elimino correctamente el Variantes",
        id: Number(Variantes.id),
        nombre: Variantes.nombre,
        distancia: Number(Variantes.distanciaKm),
        estatus: 0,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se elimino a estatus a ${0} de un Variantes con ID: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: "Error al eliminado logico Variantes",
        error: error.message,
      });
    }
  }

  async removeTotal(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let Variantes;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador
          Variantes = await this.VariantesRepository.findOne({
            where: { id: id },
          });
          if (!Variantes)
            throw new NotFoundException("Variantes no encontrado");
          break;

        default:
          throw new BadRequestException(`Acceso denegado`);
          break;
      }

      //eliminado completo
      await this.VariantesRepository.delete({ id: id });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se elimino  un Variantes con nombre: ${Variantes.nombre} y Id ${id}`,
        "DELETE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS
      );

      //API response
      const result: ApiVariantesResponse = {
        status: "succes",
        message: "Se elimino correctamente el Variantes",
        id: Number(Variantes.id),
        nombre: Variantes.nombre,
        distancia: Number(Variantes.distanciaKm),
        estatus: 0,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Variantes",
        `Se elimino Variantes con ID: ${id}`,
        "DELETE",
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: "Error al eliminado total Variantes",
        error: error.message,
      });
    }
  }
}
