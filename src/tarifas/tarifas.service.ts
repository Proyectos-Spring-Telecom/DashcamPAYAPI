import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { CreateTarifaDto } from "./dto/create-tarifa.dto";
import { UpdateTarifaDto } from "./dto/update-tarifa.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { Tarifas } from "src/entities/Tarifas";
import { Repository } from "typeorm";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";
import { Variantes } from "src/entities/Variantes";
import { UsuariosZonas } from "src/entities/UsuariosZonas";
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from "src/common/ApiResponse";
import { UpdateTarifasEstatusDto } from "./dto/update-tarifa-estatus.dto";
import { Clientes } from "src/entities/Clientes";

@Injectable()
export class TarifasService {
  constructor(
    @InjectRepository(Tarifas)
    private readonly tarifasRepository: Repository<Tarifas>,
    @InjectRepository(Variantes)
    private readonly VariantesRepository: Repository<Variantes>,
    @InjectRepository(UsuariosZonas)
    private readonly usuariosZonasUsuariosZonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}

  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createTarifaDto: CreateTarifaDto
  ): Promise<ApiCrudResponse> {
    try {
      let Variantes;
      Variantes = await this.VariantesRepository.findOne({
        where: { id: createTarifaDto.idVariante },
      });
      if (!Variantes)
        throw new NotFoundException(`El Variantes no fue encontrado.`);

      const newTarifas = this.tarifasRepository.create(createTarifaDto);
      const tarifaSave = await this.tarifasRepository.save(newTarifas);

      // Registro en la bitácora SUCCESS
      const querylogger = { createTarifaDto };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se creó una tarifa con ID: ${tarifaSave.id}.`,
        "CREATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS
      );

      // API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "La tarifa se creó correctamente.",
        data: {
          id: Number(tarifaSave.id),
          nombre: `Tarifa con ID: ${tarifaSave.id}, tarifa base: ${tarifaSave.tarifaBase}.`,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createTarifaDto };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se creó una tarifa con ID de Variantes: ${createTarifaDto.idVariante}.`,
        "CREATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: "Error al crear la tarifa.",
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

  private async consultarTarifasListado(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND t.Estatus = 1

ORDER BY t.Id DESC
    `;
    return this.usuariosZonasUsuariosZonasRepository.query(query, [...ids]);
  }

  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las ZonasUsuariosZonas
          data = await this.usuariosZonasUsuariosZonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND t.Estatus = 1

ORDER BY t.Id DESC

      `
          );
          break;

        case 2:
          // Usuario Administrador - obtiene todas las ZonasUsuariosZonas
          data = await this.consultarTarifasListado(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarTarifasListado(cliente);
          break;

        case 10:
          // Usuario Administrador - obtiene todas las ZonasUsuariosZonas
          data = await this.consultarTarifasListado(cliente);
          break;

        default:
          // Consulta de datos paginados Usuario Capturista
          data = await this.usuariosZonasUsuariosZonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio (la importante para filtro del usuario)
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariantes = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN ZonasUsuariosZonas r ON ru.IdZona = r.Id
LEFT JOIN ZonasUsuariosZonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND t.Estatus = 1
  AND c.Estatus = 1

ORDER BY t.Id DESC;
      `,
            [idUser] // parámetro seguro
          );
          break;
      }

      const tarifas = data.map((item) => ({
        ...item,
        id: Number(item.id),
        TarifaBase: Number(item.TarifaBase),
        DistanciaBaseKm: Number(item.DistanciaBaseKm),
        CostoAdicional: Number(item.CostoAdicional),
        distanciaKm: Number(item.distanciaKm),
        idVariantes: Number(item.idVariantes),
        idRuta: Number(item.idRuta),
        idZonaInicio: item.idZonaInicio ? Number(item.idZonaInicio) : null,
        idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
        idCliente: Number(item.idCliente),
      }));

      // Transformación de resultados
      const result: ApiResponseCommon = {
        data: tarifas,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Ocurrió un error al intentar obtener el listado de tarifas.",
        error: error.message,
      });
    }
  }

  private async consultarTarifasPaginado(
    cliente: number,
    limit: number,
    offset: number
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1

ORDER BY t.Id DESC

  LIMIT ? OFFSET ?;
    `;
    return this.usuariosZonasUsuariosZonasRepository.query(query, [
      ...ids,
      limit,
      offset,
    ]);
  }

  private async consultarTotalTarifasPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  

    SELECT COUNT(*) AS total
FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
`;
    return await this.usuariosZonasUsuariosZonasRepository.query(query, [
      ...ids,
    ]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number
  ) {
    try {
      const offset = (page - 1) * limit;
      let data;
      let totalResult;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuariosZonasUsuariosZonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1

ORDER BY t.Id DESC
  LIMIT ? OFFSET ?
  `,
            [limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.usuariosZonasUsuariosZonasRepository.query(
            `
    SELECT COUNT(*) AS total
FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  `
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          data = await this.consultarTarifasPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTarifasPaginados(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarTarifasPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTarifasPaginados(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          data = await this.consultarTarifasPaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalTarifasPaginados(cliente);
          break;

        default:
          data = await this.usuariosZonasUsuariosZonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio (la importante para filtro del usuario)
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariantes = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN ZonasUsuariosZonas r ON ru.IdZona = r.Id
LEFT JOIN ZonasUsuariosZonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND t.Estatus = 1

ORDER BY t.Id DESC
  LIMIT ? OFFSET ?
  `,
            [idUser, limit, offset]
          );

          // Query para total (sin paginación)
          totalResult = await this.usuariosZonasUsuariosZonasRepository.query(
            `
SELECT COUNT(*) AS total
FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariantes = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN ZonasUsuariosZonas r ON ru.IdZona = r.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id
WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1         -- Relación usuario-Zona activa
  AND r.Estatus = 1          -- Zona activa
  AND ru.Estatus = 1         -- Ruta activa
  AND d.Estatus = 1          -- Variantes activo
  AND t.Estatus = 1          -- Tarifa activa
  `,
            [idUser]
          );
          break;
      }

      const total = Number(totalResult[0]?.total ?? 0);

      const tarifas = data.map((item) => ({
        ...item,
        id: Number(item.id),
        TarifaBase: Number(item.TarifaBase),
        DistanciaBaseKm: Number(item.DistanciaBaseKm),
        CostoAdicional: Number(item.CostoAdicional),
        distanciaKm: Number(item.distanciaKm),
        idVariantes: Number(item.idVariantes),
        idRuta: Number(item.idRuta),
        idZonaInicio: item.idZonaInicio ? Number(item.idZonaInicio) : null,
        idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
        idCliente: Number(item.idCliente),
      }));

      // Transformación de resultados
      const result: ApiResponseCommon = {
        data: tarifas,
        paginated: {
          total,
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
        message: "Error al obtener las tarifas paginadas.",
        error: error.message,
      });
    }
  }

  private async consultarTarifasOne(id: number, cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND t.Id = ?

ORDER BY t.Id DESC
    `;
    return this.usuariosZonasUsuariosZonasRepository.query(query, [...ids, id]);
  }

  async findOne(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          data = await this.usuariosZonasUsuariosZonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND t.Id = ?

ORDER BY t.Id DESC
  `,
            [id]
          );
          break;

        case 2:
          // 
          data = await this.consultarTarifasOne(id, cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarTarifasOne(id, cliente);
          break;

        case 10:
          // 
          data = await this.consultarTarifasOne(id, cliente);
          break;

        default:
          data = await this.usuariosZonasUsuariosZonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos del Variantes
  d.Id AS idVariantes,
  d.Nombre AS nombreVariantes,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id = ?            -- Filtrado por cliente
  AND c.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND t.Id = ?

ORDER BY t.Id DESC
  `,
            [cliente, id]
          );

          break;
      }

      if (data.length === 0) {
        throw new NotFoundException("No se encontro Tarifa");
      }

      const tarifas = data.map((item) => ({
        ...item,
        id: Number(item.id),
        TarifaBase: Number(item.TarifaBase),
        DistanciaBaseKm: Number(item.DistanciaBaseKm),
        CostoAdicional: Number(item.CostoAdicional),
        distanciaKm: Number(item.distanciaKm),
        idVariantes: Number(item.idVariantes),
        idRuta: Number(item.idRuta),
        idZonaInicio: item.idZonaInicio ? Number(item.idZonaInicio) : null,
        idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
        idCliente: Number(item.idCliente),
      }));

      // Transformación de resultados
      const result: ApiResponseCommon = {
        data: tarifas,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: "Error al obtener una tarifa.",
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    updateTarifasEstatusDto: UpdateTarifasEstatusDto
  ): Promise<ApiCrudResponse> {
    try {
      const tarifa = await this.tarifasRepository.findOne({
        where: { id: id },
      });
      if (!tarifa) throw new NotFoundException(`Error al obtener una tarifa.`);

      //actualizacion de estatus
      const estatus = updateTarifasEstatusDto.estatus;
      await this.tarifasRepository.update(id, { estatus: estatus });

      // Registro en la bitácora SUCCESS
      const querylogger = { updateTarifasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se actualizó el estatus a ${estatus} de la tarifa con ID: ${tarifa.id}.`,
        "UPDATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS
      );

      // API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Tarifa estatus actualizado correctamente",
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `Tarifa con Id: ${id} tarifaBase:${tarifa.tarifaBase}`,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora Error
      const querylogger = { updateTarifasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        "ZonasUsuariosZonas",
        `Se actualizo el estatus: ${updateTarifasEstatusDto.estatus} de una Tarifa con Id: ${id}`,
        "UPDATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar el estatus de la tarifa.",
        error: error.message,
      });
    }
  }

  async update(id: number, idUser: number, updateTarifaDto: UpdateTarifaDto) {
    try {
      const tarifa = await this.tarifasRepository.findOne({
        where: { id: id },
      });
      if (!tarifa) throw new NotFoundException(`Tarifa no encontrada.`);

      //actualizacion de tarifa
      await this.tarifasRepository.update(id, updateTarifaDto);

      // Registro en la bitácora SUCCESS
      const querylogger = { updateTarifaDto };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se actualizó una tarifa con ID: ${tarifa.id}.`,
        "UPDATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS
      );

      // API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Tarifa actualizada correctamente.",
        data: {
          id: id,
          nombre: `Tarifa con ID: ${id}, tarifa base: ${tarifa.tarifaBase}.`,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora Error
      const querylogger = { updateTarifaDto };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se actualizó una tarifa con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Error al actualizar la tarifa.",
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number) {
    try {
      const tarifa = await this.tarifasRepository.findOne({
        where: { id: id },
      });
      if (!tarifa) throw new NotFoundException(`Tarifa no encontrada.`);

      //eliminado logico de estatus
      await this.tarifasRepository.update(id, { estatus: 0 });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se actualizó el estatus a ${0} de la tarifa con ID: ${tarifa.id}.`,
        "UPDATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS
      );

      // API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Tarifa eliminada lógicamente correctamente.",
        data: {
          id: id,
          nombre: `Tarifa con ID: ${id}, tarifa base: ${tarifa.tarifaBase}.`,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora Error
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se actualizó el estatus a ${0} de la tarifa con ID: ${id}.`,
        "UPDATE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Hubo un error al eliminar lógicamente la tarifa.",
        error: error.message,
      });
    }
  }

  async removeTotal(id: number, idUser: number, rol: number) {
    try {
      let tarifa;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador
          tarifa = await this.tarifasRepository.findOne({
            where: { id: id },
          });
          if (!tarifa) throw new NotFoundException(`Tarifa no encontrada.`);
          break;

        default:
          throw new BadRequestException(`Acceso denegado.`);
          break;
      }

      //eliminado permanente
      await this.tarifasRepository.delete({ id: id });

      // Registro en la bitácora SUCCESS
      const querylogger = { query: `DELETE FROM Tarifas WHERE Id = ${id}` };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se eliminó una tarifa con ID: ${id}.`,
        "DELETE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.SUCCESS
      );

      // API response
      const result: ApiCrudResponse = {
        status: "success",
        message: "Tarifa eliminada permanentemente correctamente.",
        data: {
          id: id,
          nombre: `Tarifa con ID: ${id}, tarifa base: ${tarifa.tarifaBase}.`,
        },
      };
      return result;
    } catch (error) {
      // Registro en la bitácora Error
      const querylogger = { query: `DELETE FROM Tarifas WHERE Id = ${id}` };
      await this.bitacoraLogger.logToBitacora(
        "Tarifas",
        `Se eliminó una tarifa con ID: ${id}.`,
        "DELETE",
        querylogger,
        idUser,
        19,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: "Hubo un problema al eliminar la tarifa permanentemente.",
        error: error.message,
      });
    }
  }
}
