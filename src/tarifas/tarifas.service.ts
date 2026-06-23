import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateTarifaDto } from './dto/create-tarifa.dto';
import { UpdateTarifaDto } from './dto/update-tarifa.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Tarifas } from 'src/entities/Tarifas';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { Variantes } from 'src/entities/Variantes';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { UpdateTarifasEstatusDto } from './dto/update-tarifa-estatus.dto';
import { Clientes } from 'src/entities/Clientes';
import { EnumModulos } from 'src/common/estatus.enum';

@Injectable()
export class TarifasService {
  constructor(
    @InjectRepository(Tarifas)
    private readonly tarifasRepository: Repository<Tarifas>,
    @InjectRepository(Variantes)
    private readonly variantesRepository: Repository<Variantes>,
    @InjectRepository(UsuariosZonas)
    private readonly usuarioszonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  // ========================================
  // 🔹 CREAR UN TARIFA
  // ========================================
  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createTarifaDto: CreateTarifaDto,
  ): Promise<ApiCrudResponse> {
    try {
      const variante = await this.variantesRepository.findOne({
        where: { id: createTarifaDto.idVariante },
      });
      if (!variante)
        throw new NotFoundException(`La variante no fue encontrada.`);

      // Mapear idTipoTarifa del DTO a tipoTarifa de la entidad
      const { idTipoTarifa, ...restDto } = createTarifaDto;
      const newTarifas = this.tarifasRepository.create({
        ...restDto,
        tipoTarifa: idTipoTarifa,
      });
      const tarifaSave = await this.tarifasRepository.save(newTarifas);

      // Verificar si existe una variante de regreso (donde idVarianteIda = idVariante del payload)
      const varianteRegreso = await this.variantesRepository.findOne({
        where: { idVarianteIda: createTarifaDto.idVariante },
      });

      let tarifaRegresoSave: Tarifas | null = null;
      if (varianteRegreso) {
        // Crear también la tarifa para la variante de regreso
        const newTarifaRegreso = this.tarifasRepository.create({
          ...restDto,
          tipoTarifa: idTipoTarifa,
          idVariante: varianteRegreso.id,
        });
        tarifaRegresoSave = await this.tarifasRepository.save(newTarifaRegreso);
      }

      // Registro en la bitácora SUCCESS
      const querylogger: any = {
        createTarifaDto,
        varianteRegreso: varianteRegreso
          ? { id: varianteRegreso.id, nombre: varianteRegreso.nombre }
          : null,
      };
      const mensajeBitacora = tarifaRegresoSave
        ? `Se creó una tarifa con ID: ${tarifaSave.id} y su tarifa de regreso con ID: ${tarifaRegresoSave.id}.`
        : `Se creó una tarifa con ID: ${tarifaSave.id}.`;

      await this.bitacoraLogger.logToBitacora(
        'Tarifas',
        mensajeBitacora,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const resultData: any = {
        id: Number(tarifaSave.id),
        nombre: `Tarifa con ID: ${tarifaSave.id}, tarifa base: ${tarifaSave.tarifaBase}.`,
      };

      if (tarifaRegresoSave) {
        resultData.idTarifaRegreso = Number(tarifaRegresoSave.id);
        resultData.nombreTarifaRegreso = `Tarifa con ID: ${tarifaRegresoSave.id}, tarifa base: ${tarifaRegresoSave.tarifaBase}.`;
      }

      const result: ApiCrudResponse = {
        status: 'success',
        message: tarifaRegresoSave
          ? 'La tarifa y su tarifa de regreso se crearon correctamente.'
          : 'La tarifa se creó correctamente.',
        data: resultData,
      };
      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createTarifaDto };
      await this.bitacoraLogger.logToBitacora(
        'Tarifas',
        `Se creó una tarifa con ID de variante: ${createTarifaDto.idVariante}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al crear la tarifa.',
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
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
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
    return this.usuarioszonasRepository.query(query, [...ids]);
  }

  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          // Usuario SuperAdministrador - obtiene todas las zonas
          data = await this.usuarioszonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
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

      `,
          );
          break;

        case 2:
          // Usuario Administrador - obtiene todas las zonas
          data = await this.consultarTarifasListado(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarTarifasListado(cliente);
          break;

        case 10:
          // Usuario Administrador - obtiene todas las zonas
          data = await this.consultarTarifasListado(cliente);
          break;

        default:
          // Consulta de datos paginados Usuario Capturista
          data = await this.usuarioszonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio (la importante para filtro del usuario)
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
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
  AND t.Estatus = 1
  AND c.Estatus = 1

ORDER BY t.Id DESC;
      `,
            [idUser], // parámetro seguro
          );
          break;
      }

      const tarifas = data.map((item) => ({
        ...item,
        id: Number(item.id),
        TarifaBase: Number(item.TarifaBase),
        DistanciaBaseKm: Number(item.DistanciaBaseKm),
        CostoAdicional: Number(item.CostoAdicional),
        CostoPorEstacion: item.CostoPorEstacion
          ? Number(item.CostoPorEstacion)
          : null,
        CantidadEstacionesBase: item.CantidadEstacionesBase
          ? Number(item.CantidadEstacionesBase)
          : null,
        distanciaKm: Number(item.distanciaKm),
        idVariante: Number(item.idVariante),
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
        message: 'Ocurrió un error al intentar obtener el listado de tarifas.',
        error: error.message,
      });
    }
  }

  private async consultarTarifasPaginado(
    cliente: number,
    limit: number,
    offset: number,
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
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
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
    return this.usuarioszonasRepository.query(query, [...ids, limit, offset]);
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
    return await this.usuarioszonasRepository.query(query, [...ids]);
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
      let data;
      let totalResult;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuarioszonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
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
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioszonasRepository.query(
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
  `,
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
          data = await this.usuarioszonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio (la importante para filtro del usuario)
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
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
  AND t.Estatus = 1

ORDER BY t.Id DESC
  LIMIT ? OFFSET ?
  `,
            [idUser, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioszonasRepository.query(
            `
SELECT COUNT(*) AS total
FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id
WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1         -- Relación usuario-región activa
  AND r.Estatus = 1          -- Región activa
  AND ru.Estatus = 1         -- Ruta activa
  AND d.Estatus = 1          -- Variante activa
  AND t.Estatus = 1          -- Tarifa activa
  `,
            [idUser],
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
        CostoPorEstacion: item.CostoPorEstacion
          ? Number(item.CostoPorEstacion)
          : null,
        CantidadEstacionesBase: item.CantidadEstacionesBase
          ? Number(item.CantidadEstacionesBase)
          : null,
        distanciaKm: Number(item.distanciaKm),
        idVariante: Number(item.idVariante),
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
        message: 'Error al obtener las tarifas paginadas.',
        error: error.message,
      });
    }
  }

  private async consultarTotalTarifasOne(id: number, cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  

SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
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
  AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND t.Id = ?

ORDER BY t.Id DESC
`;
    return await this.usuarioszonasRepository.query(query, [...ids, id]);
  }

  async findOne(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          data = await this.usuarioszonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
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
            [id],
          );
          break;

        case 2:
          // Usuario Administrador - obtiene todas las zonas
          data = await this.consultarTotalTarifasOne(id, cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarTotalTarifasOne(id, cliente);
          break;

        case 10:
          // Usuario Administrador - obtiene todas las zonas
          data = await this.consultarTotalTarifasOne(id, cliente);
          break;

        default:
          data = await this.usuarioszonasRepository.query(
            `
SELECT 
  -- Datos de la tarifa
  t.Id AS id,
  t.TarifaBase,
  t.DistanciaBaseKm,
  t.IncrementoCadaMetros,
  t.CostoAdicional,
  t.CostoPorEstacion,
  t.CantidadEstacionesBase,
  t.TipoTarifa,
  t.FechaCreacion AS fechaCreacionTarifa,
  t.FechaActualizacion AS fechaActualizacionTarifa,
  t.Estatus AS estatusTarifa,

  -- Datos de la variante
  d.Id AS idVariante,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.DistanciaKm AS distanciaKm,

  -- Datos de la ruta
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio,
  ru.NombreFin,

  -- Región de inicio (la importante para filtro del usuario)
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,

  -- Región de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,

  -- Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Tarifas t
INNER JOIN Variantes d ON t.IdVariante = d.Id
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
  AND t.Id = ?

ORDER BY t.Id DESC
  `,
            [idUser, id],
          );

          break;
      }

      if (data.length === 0) {
        throw new NotFoundException('No se encontro Tarifa');
      }

      const tarifas = data.map((item) => ({
        ...item,
        id: Number(item.id),
        TarifaBase: Number(item.TarifaBase),
        DistanciaBaseKm: Number(item.DistanciaBaseKm),
        CostoAdicional: Number(item.CostoAdicional),
        CostoPorEstacion: item.CostoPorEstacion
          ? Number(item.CostoPorEstacion)
          : null,
        CantidadEstacionesBase: item.CantidadEstacionesBase
          ? Number(item.CantidadEstacionesBase)
          : null,
        distanciaKm: Number(item.distanciaKm),
        idVariante: Number(item.idVariante),
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
        message: 'Error al obtener una tarifa.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER TARIFA POR ID VARIANTE
  // ========================================
  async findByVariante(
    idVariante: number,
    idUser: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Validar que la variante existe
      const variante = await this.variantesRepository.findOne({
        where: { id: idVariante },
      });

      if (!variante) {
        throw new NotFoundException(
          `La variante con ID ${idVariante} no fue encontrada.`,
        );
      }

      // Buscar la tarifa por idVariante
      const tarifa = await this.tarifasRepository.findOne({
        where: { idVariante: idVariante, estatus: 1 },
        relations: ['idVariante2'],
      });

      if (!tarifa) {
        throw new NotFoundException(
          `No se encontró una tarifa activa para la variante con ID ${idVariante}.`,
        );
      }

      // Formatear la respuesta
      const data = {
        id: Number(tarifa.id),
        tarifaBase: Number(tarifa.tarifaBase),
        distanciaBaseKm: tarifa.distanciaBaseKm
          ? Number(tarifa.distanciaBaseKm)
          : null,
        incrementoCadaMetros: tarifa.incrementoCadaMetros
          ? Number(tarifa.incrementoCadaMetros)
          : null,
        costoAdicional: tarifa.costoAdicional
          ? Number(tarifa.costoAdicional)
          : null,
        costoPorEstacion: tarifa.costoPorEstacion
          ? Number(tarifa.costoPorEstacion)
          : null,
        cantidadEstacionesBase: tarifa.cantidadEstacionesBase
          ? Number(tarifa.cantidadEstacionesBase)
          : null,
        tipoTarifa: Number(tarifa.tipoTarifa),
        fechaCreacion: tarifa.fechaCreacion,
        fechaActualizacion: tarifa.fechaActualizacion,
        estatus: Number(tarifa.estatus),
        idVariante: Number(tarifa.idVariante),
        nombreVariante: tarifa.idVariante2?.nombre || null,
      };

      // Registro en la bitácora SUCCESS
      await this.bitacoraLogger.logToBitacora(
        'Tarifas',
        `Se consultó la tarifa para la variante con ID: ${idVariante}.`,
        'READ',
        { idVariante },
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.SUCCESS,
      );

      const result: ApiResponseCommon = {
        data: [data],
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      await this.bitacoraLogger.logToBitacora(
        'Tarifas',
        `Error al consultar tarifa para la variante con ID: ${idVariante}.`,
        'READ',
        { idVariante },
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al obtener la tarifa por variante.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR ESTATUS DE LA TARIFA
  // ========================================
  async updateEstatus(
    id: number,
    idUser: number,
    updateTarifasEstatusDto: UpdateTarifasEstatusDto,
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
        'Tarifas',
        `Se actualizó el estatus a ${estatus} de la tarifa con ID: ${tarifa.id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tarifa estatus actualizado correctamente',
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
        'Zonas',
        `Se actualizo el estatus: ${updateTarifasEstatusDto.estatus} de una Tarifa con Id: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el estatus de la tarifa.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR TARIFA
  // ========================================
  async update(id: number, idUser: number, updateTarifaDto: UpdateTarifaDto) {
    try {
      const tarifa = await this.tarifasRepository.findOne({
        where: { id: id },
      });
      if (!tarifa) throw new NotFoundException(`Tarifa no encontrada.`);

      // Mapear idTipoTarifa del DTO a tipoTarifa de la entidad si viene en el DTO
      const updateData: any = { ...updateTarifaDto };
      if (updateData.idTipoTarifa !== undefined) {
        updateData.tipoTarifa = updateData.idTipoTarifa;
        delete updateData.idTipoTarifa;
      }

      //actualizacion de tarifa
      await this.tarifasRepository.update(id, updateData);

      // Registro en la bitácora SUCCESS
      const querylogger = { updateTarifaDto };
      await this.bitacoraLogger.logToBitacora(
        'Tarifas',
        `Se actualizó una tarifa con ID: ${tarifa.id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tarifa actualizada correctamente.',
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
        'Tarifas',
        `Se actualizó una tarifa con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar la tarifa.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ELIMINADO LOGICO
  // ========================================
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
        'Tarifas',
        `Se actualizó el estatus a ${0} de la tarifa con ID: ${tarifa.id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tarifa eliminada lógicamente correctamente.',
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
        'Tarifas',
        `Se actualizó el estatus a ${0} de la tarifa con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Hubo un error al eliminar lógicamente la tarifa.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ELIMINADO PERMANENTES
  // ========================================
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
        'Tarifas',
        `Se eliminó una tarifa con ID: ${id}.`,
        'DELETE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.SUCCESS,
      );

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Tarifa eliminada permanentemente correctamente.',
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
        'Tarifas',
        `Se eliminó una tarifa con ID: ${id}.`,
        'DELETE',
        querylogger,
        idUser,
        EnumModulos.TARIFAS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Hubo un problema al eliminar la tarifa permanentemente.',
        error: error.message,
      });
    }
  }
}
