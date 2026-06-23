import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMantenimientoKilometrajeDto } from './dto/create-mantenimiento-kilometraje.dto';
import { UpdateMantenimientoKilometrajeDto } from './dto/update-mantenimiento-kilometraje.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { MantenimientoKilometraje } from 'src/entities/MantenimientoKilometraje';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';
import { Posiciones } from 'src/entities/Posiciones';
import { Repository, In } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';

@Injectable()
export class MantenimientoKilometrajeService {
  private readonly EARTH_RADIUS = 6371; // Radio de la Tierra en kilómetros

  constructor(
    @InjectRepository(MantenimientoKilometraje)
    private readonly mantenimientoKilometrajeRepository: Repository<MantenimientoKilometraje>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(Posiciones)
    private readonly posicionesRepository: Repository<Posiciones>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

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
      return { ids: [], placeholders: '' }; // No hay clientes que consultar
    }

    // Construir el query dinámico con los IDs
    const placeholders = ids.map(() => '?').join(', ');
    return { ids, placeholders };
  }

  async create(
    createMantenimientoKilometrajeDto: CreateMantenimientoKilometrajeDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const create = await this.mantenimientoKilometrajeRepository.create(
        createMantenimientoKilometrajeDto,
      );
      const saved = await this.mantenimientoKilometrajeRepository.save(create);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createMantenimientoKilometrajeDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Se creó un registro de mantenimiento por kilometraje con ID: ${saved.id}`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      const idMantenimiento = saved.id;
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento por kilometraje creado correctamente',
        data: {
          id: Number(idMantenimiento),
          nombre: `Mantenimiento KM #${idMantenimiento}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createMantenimientoKilometrajeDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Error al crear mantenimiento por kilometraje`,
        'CREATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al crear el mantenimiento por kilometraje.',
      );
    }
  }

  async findAll(page: number, limit: number, idCliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      let data: any[];
      let totalResult: any[];
      const offset = (page - 1) * limit;

      switch (rol) {
        case 1:
        case 2:
          // Consulta de datos paginados Usuario SuperAdministrador/Administrador
          data = await this.mantenimientoKilometrajeRepository.query(
            `
SELECT
  mk.Id AS id,
  mk.IdInstalacion AS idInstalacion,
  mk.KMinicial AS kmInicial,
  mk.KMDeseado AS kmDeseado,
  mk.Periodo AS periodo,
  mk.Anio AS anio,
  mk.FHRegistro AS fhRegistro,
  mk.Estatus AS estatus,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  d.Id AS instalacionDispositivoId,
  d.NumeroSerie AS instalacionDispositivoNumeroSerie,
  d.Marca AS instalacionDispositivoMarca,
  d.Modelo AS instalacionDispositivoModelo,
  cont.Id AS instalacionContadorId,
  cont.NumeroSerie AS instalacionContadorNumeroSerie,
  cont.Marca AS instalacionContadorMarca,
  cont.Modelo AS instalacionContadorModelo,
  veh.Id AS instalacionVehiculoId,
  veh.Marca AS instalacionVehiculoMarca,
  veh.Modelo AS instalacionVehiculoModelo,
  c.Id AS idClienteData,
  c.Nombre AS nombreClienteData,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente
FROM MantenimientoKilometraje mk
INNER JOIN Instalaciones i ON mk.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN Contadores cont ON i.IdContador = cont.Id AND i.IdCliente = cont.IdCliente
ORDER BY mk.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.mantenimientoKilometrajeRepository.query(
            `
SELECT COUNT(*) AS total
FROM MantenimientoKilometraje mk
INNER JOIN Instalaciones i ON mk.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
            `,
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(idCliente);
          if (ids.length === 0) {
            return {
              data: [],
              paginated: {
                total: 0,
                page,
                lastPage: 0,
              },
            };
          }

          // Consulta de datos paginados resto Usuario
          data = await this.mantenimientoKilometrajeRepository.query(
            `
SELECT
  mk.Id AS id,
  mk.IdInstalacion AS idInstalacion,
  mk.KMinicial AS kmInicial,
  mk.KMDeseado AS kmDeseado,
  mk.Periodo AS periodo,
  mk.Anio AS anio,
  mk.FHRegistro AS fhRegistro,
  mk.Estatus AS estatus,
  veh.Placa AS placaVehiculo,
  veh.Foto AS imagenVehiculo,
  d.Id AS instalacionDispositivoId,
  d.NumeroSerie AS instalacionDispositivoNumeroSerie,
  d.Marca AS instalacionDispositivoMarca,
  d.Modelo AS instalacionDispositivoModelo,
  cont.Id AS instalacionContadorId,
  cont.NumeroSerie AS instalacionContadorNumeroSerie,
  cont.Marca AS instalacionContadorMarca,
  cont.Modelo AS instalacionContadorModelo,
  veh.Id AS instalacionVehiculoId,
  veh.Marca AS instalacionVehiculoMarca,
  veh.Modelo AS instalacionVehiculoModelo
FROM MantenimientoKilometraje mk
INNER JOIN Instalaciones i ON mk.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
LEFT JOIN Vehiculos veh ON i.IdVehiculo = veh.Id AND i.IdCliente = veh.IdCliente
LEFT JOIN Validadores d ON i.IdValidador = d.Id AND i.IdCliente = d.IdCliente
LEFT JOIN Contadores cont ON i.IdContador = cont.Id AND i.IdCliente = cont.IdCliente
WHERE c.Id IN (${placeholders})
ORDER BY mk.FHRegistro DESC
LIMIT ? OFFSET ?;
            `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.mantenimientoKilometrajeRepository.query(
            `
SELECT COUNT(*) AS total
FROM MantenimientoKilometraje mk
INNER JOIN Instalaciones i ON mk.IdInstalacion = i.Id
INNER JOIN Clientes c ON i.IdCliente = c.Id
WHERE c.Id IN (${placeholders})
            `,
            [...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // Transformar los datos
      const mantenimientosTransformados = data.map((item: any) => ({
        id: Number(item.id),
        idInstalacion: item.idInstalacion ? Number(item.idInstalacion) : null,
        kmInicial: item.kmInicial != null ? Number(item.kmInicial) : null,
        kmDeseado: item.kmDeseado != null ? Number(item.kmDeseado) : null,
        periodo: item.periodo,
        anio: item.anio,
        fhRegistro: item.fhRegistro,
        estatus: item.estatus,
        placaVehiculo: item.placaVehiculo || null,
        imagenVehiculo: item.imagenVehiculo || null,
        instalacion: item.idInstalacion ? { id: Number(item.idInstalacion) } : null,
        instalacionDispositivo: item.instalacionDispositivoId ? {
          id: Number(item.instalacionDispositivoId),
          numeroSerie: item.instalacionDispositivoNumeroSerie,
          marca: item.instalacionDispositivoMarca,
          modelo: item.instalacionDispositivoModelo,
        } : null,
        instalacionValidador: item.instalacion?.validadores ? {
          id: Number(item.instalacion.validadores.id),
          numeroSerie: item.instalacion.validadores.numeroSerie,
          marca: item.instalacion.validadores.marca,
          modelo: item.instalacion.validadores.modelo,
        } : null,
        instalacionContadores: item.instalacion?.instalacionContadores && item.instalacion.instalacionContadores.length > 0
          ? item.instalacion.instalacionContadores
              .filter(ic => ic.contador && ic.estatus === 1)
              .map(ic => ({
                id: Number(ic.contador.id),
                numeroSerie: ic.contador.numeroSerie,
                marca: ic.contador.marca,
                modelo: ic.contador.modelo,
              }))
          : [],
        // Mantener compatibilidad con código antiguo (primer contador)
        instalacionContador: item.instalacion?.instalacionContadores && item.instalacion.instalacionContadores.length > 0 && item.instalacion.instalacionContadores[0]?.contador ? {
          id: Number(item.instalacion.instalacionContadores[0].contador.id),
          numeroSerie: item.instalacion.instalacionContadores[0].contador.numeroSerie,
          marca: item.instalacion.instalacionContadores[0].contador.marca,
          modelo: item.instalacion.instalacionContadores[0].contador.modelo,
        } : null,
        instalacionVehiculo: item.instalacion?.vehiculos ? {
          id: Number(item.instalacion.vehiculos.id),
          marca: item.instalacion.vehiculos.marca,
          modelo: item.instalacion.vehiculos.modelo,
        } : null,
        instalacionCliente: item.instalacion?.idCliente2 ? {
          id: Number(item.instalacion.idCliente2.id),
          nombre: item.instalacion.idCliente2.nombre,
          apellidoPaterno: item.instalacion.idCliente2.apellidoPaterno,
          apellidoMaterno: item.instalacion.idCliente2.apellidoMaterno,
          estatus: item.instalacion.idCliente2.estatus,
        } : null,
        ...(rol === 1 || rol === 2) && item.idClienteData ? {
          instalacionCliente: {
            id: Number(item.idClienteData),
            nombre: item.nombreClienteData,
            apellidoPaterno: item.apellidoPaternoCliente,
            apellidoMaterno: item.apellidoMaternoCliente,
            estatus: item.estatusCliente,
          },
        } : {},
      }));

      const result: ApiResponseCommon = {
        data: mantenimientosTransformados,
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
      throw new BadRequestException(
        error.message || 'Error al obtener los mantenimientos por kilometraje',
      );
    }
  }

  async findOne(id: number, idCliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      const mantenimiento = await this.mantenimientoKilometrajeRepository.findOne({
        where: { id: id },
        relations: ['instalacion', 'instalacion.validadores', 'instalacion.instalacionContadores', 'instalacion.instalacionContadores.contador', 'instalacion.vehiculos', 'instalacion.idCliente2'],
      });
      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento por kilometraje no encontrado');
      }

      const item = mantenimiento;

      const result: ApiResponseCommon = {
        data: [
          {
            id: Number(item.id),
            idInstalacion: item.idInstalacion ? Number(item.idInstalacion) : null,
            kmInicial: item.kmInicial != null ? Number(item.kmInicial) : null,
            kmDeseado: item.kmDeseado != null ? Number(item.kmDeseado) : null,
            periodo: item.periodo,
            anio: item.anio,
            fhRegistro: item.fhRegistro,
            estatus: mantenimiento.estatus,
            placaVehiculo: mantenimiento.instalacion?.vehiculos?.placa || null,
            imagenVehiculo: mantenimiento.instalacion?.vehiculos?.foto || null,
            instalacion: item.idInstalacion ? { id: Number(item.idInstalacion) } : null,
        
            instalacionValidador: mantenimiento.instalacion?.validadores ? {
              id: Number(mantenimiento.instalacion.validadores.id),
              numeroSerie: mantenimiento.instalacion.validadores.numeroSerie,
              marca: mantenimiento.instalacion.validadores.marca,
              modelo: mantenimiento.instalacion.validadores.modelo,
            } : null,
            instalacionContadores: mantenimiento.instalacion?.instalacionContadores && mantenimiento.instalacion.instalacionContadores.length > 0
              ? mantenimiento.instalacion.instalacionContadores
                  .filter(ic => ic.contador && ic.estatus === 1)
                  .map(ic => ({
                    id: Number(ic.contador.id),
                    numeroSerie: ic.contador.numeroSerie,
                    marca: ic.contador.marca,
                    modelo: ic.contador.modelo,
                  }))
              : [],
            // Mantener compatibilidad con código antiguo (primer contador)
            instalacionContador: mantenimiento.instalacion?.instalacionContadores && mantenimiento.instalacion.instalacionContadores.length > 0 && mantenimiento.instalacion.instalacionContadores[0]?.contador ? {
              id: Number(mantenimiento.instalacion.instalacionContadores[0].contador.id),
              numeroSerie: mantenimiento.instalacion.instalacionContadores[0].contador.numeroSerie,
              marca: mantenimiento.instalacion.instalacionContadores[0].contador.marca,
              modelo: mantenimiento.instalacion.instalacionContadores[0].contador.modelo,
            } : null,
            instalacionVehiculo: mantenimiento.instalacion?.vehiculos ? {
              id: Number(mantenimiento.instalacion.vehiculos.id),
              marca: mantenimiento.instalacion.vehiculos.marca,
              modelo: mantenimiento.instalacion.vehiculos.modelo,
            } : null,
            instalacionCliente: mantenimiento.instalacion?.idCliente2 ? {
              id: Number(mantenimiento.instalacion.idCliente2.id),
              nombre: mantenimiento.instalacion.idCliente2.nombre,
              apellidoPaterno: mantenimiento.instalacion.idCliente2.apellidoPaterno,
              apellidoMaterno: mantenimiento.instalacion.idCliente2.apellidoMaterno,
              estatus: mantenimiento.instalacion.idCliente2.estatus,
            } : null,
            ...(rol === 1 || rol === 2) && mantenimiento.instalacion?.idCliente2 ? {
              instalacionCliente: {
                id: Number(mantenimiento.instalacion.idCliente2.id),
                nombre: mantenimiento.instalacion.idCliente2.nombre,
                apellidoPaterno: mantenimiento.instalacion.idCliente2.apellidoPaterno,
                apellidoMaterno: mantenimiento.instalacion.idCliente2.apellidoMaterno,
                estatus: mantenimiento.instalacion.idCliente2.estatus,
              },
            } : {},
          },
        ],
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error interno al buscar el mantenimiento por kilometraje',
      );
    }
  }

  async update(
    id: number,
    updateMantenimientoKilometrajeDto: UpdateMantenimientoKilometrajeDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoKilometrajeRepository.findOne({
        where: { id: id },
      });
      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento por kilometraje no encontrado');
      }

      await this.mantenimientoKilometrajeRepository.update(
        id,
        updateMantenimientoKilometrajeDto,
      );
      const mantenimientoResult = await this.mantenimientoKilometrajeRepository.findOne({
        where: { id: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateMantenimientoKilometrajeDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Se actualizó el mantenimiento por kilometraje con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento por kilometraje actualizado correctamente',
        data: {
          id: id,
          nombre: `Mantenimiento KM #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateMantenimientoKilometrajeDto };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Error al actualizar mantenimiento por kilometraje con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al actualizar el mantenimiento por kilometraje.',
      );
    }
  }

  async desactivar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoKilometrajeRepository.findOne({
        where: { id: id },
      });

      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento por kilometraje no encontrado');
      }

      await this.mantenimientoKilometrajeRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Se desactivó el mantenimiento por kilometraje con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento por kilometraje desactivado correctamente',
        estatus: { estatus: 0 },
        data: {
          id: id,
          nombre: `Mantenimiento KM #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Error al desactivar mantenimiento por kilometraje con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al desactivar el mantenimiento por kilometraje.',
        error: error.message,
      });
    }
  }

  async activar(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const mantenimiento = await this.mantenimientoKilometrajeRepository.findOne({
        where: { id: id },
      });

      if (!mantenimiento) {
        throw new NotFoundException('Mantenimiento por kilometraje no encontrado');
      }

      if (mantenimiento.estatus === 1) {
        throw new BadRequestException('El mantenimiento por kilometraje ya está activo');
      }

      await this.mantenimientoKilometrajeRepository.update(id, { estatus: 1 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Se activó el mantenimiento por kilometraje con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Mantenimiento por kilometraje activado correctamente',
        estatus: { estatus: 1 },
        data: {
          id: id,
          nombre: `Mantenimiento KM #${id}`,
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 1 };
      await this.bitacoraLogger.logToBitacora(
        'MantenimientoKilometraje',
        `Error al activar mantenimiento por kilometraje con ID: ${id}`,
        'UPDATE',
        querylogger,
        Number(idUser),
        5,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al activar el mantenimiento por kilometraje.',
        error: error.message,
      });
    }
  }

  /**
   * Calcula la distancia entre dos puntos geográficos usando la fórmula de Haversine
   * @param lat1 Latitud del primer punto
   * @param lng1 Longitud del primer punto
   * @param lat2 Latitud del segundo punto
   * @param lng2 Longitud del segundo punto
   * @returns Distancia en kilómetros
   */
  private async getDistanciaEntreDosPuntos(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): Promise<number> {
    const lat = ((lat2 - lat1) * Math.PI) / 180;
    const lon = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(lat / 2) * Math.sin(lat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(lon / 2) *
        Math.sin(lon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = this.EARTH_RADIUS * c;
    return distance;
  }

  /**
   * Obtiene el reporte de kilometraje por días para una instalación
   * @param idInstalacion ID de la instalación
   * @returns Lista de semanas/días con el kilometraje acumulado
   */
  async obtenerReporteKilometrajeDias(
    idInstalacion: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Obtener los registros de mantenimiento por kilometraje de la instalación
      const lista = await this.mantenimientoKilometrajeRepository.query(
        `
        SELECT
          mk.Anio AS anio,
          mk.IdInstalacion AS idInstalacion,
          mk.KMDeseado AS kmDeseado,
          mk.KMinicial AS kmInicial,
          mk.Periodo AS periodo,
          v.Foto AS imagen
        FROM MantenimientoKilometraje mk
        INNER JOIN Instalaciones i ON mk.IdInstalacion = i.Id
        LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
        WHERE mk.IdInstalacion = ?
        ORDER BY mk.Periodo ASC
        `,
        [idInstalacion],
      );

      const listaSemanas: any[] = [];
      let totaldistancia = 0;

      for (const item of lista) {
        // Obtener las posiciones de la instalación para el mes y año especificados
        const listaPosiciones = await this.posicionesRepository.query(
          `
          SELECT
            d.NumeroSerie AS numeroSerie,
            i.Id AS id,
            i.Id AS idInstalacion,
            v.Placa AS placas,
            v.NumeroEconomico AS economico,
            p.FechaHora AS fechaHora,
            p.Latitud AS lat,
            p.Longitud AS lng,
            p.Velocidad AS velocidad,
            p.Estado AS estado
          FROM Posiciones p
          INNER JOIN Validadores d ON p.NumeroSerieValidador = d.NumeroSerie
          INNER JOIN Instalaciones i ON d.Id = i.idValidador AND d.IdCliente = i.IdCliente
          LEFT JOIN Vehiculos v ON i.IdVehiculo = v.Id AND i.IdCliente = v.IdCliente
          WHERE i.Id = ?
            AND MONTH(p.FechaHora) = ?
            AND YEAR(p.FechaHora) = ?
            AND i.Estatus = 1
          ORDER BY p.FechaHora ASC
          `,
          [item.idInstalacion, item.periodo, item.anio],
        );

        let latini = 0;
        let lngini = 0;
        let latfin = 0;
        let lngfin = 0;
        let i = 0;

        // Calcular la distancia entre cada posición
        for (const item2 of listaPosiciones) {
          if (i === 0) {
            latini = Number(item2.lat);
            lngini = Number(item2.lng);
          }
          latfin = Number(item2.lat);
          lngfin = Number(item2.lng);

          const distancia = await this.getDistanciaEntreDosPuntos(
            latini,
            lngini,
            latfin,
            lngfin,
          );

          item2.distancia = distancia;
          totaldistancia = totaldistancia + distancia;
          latini = latfin;
          lngini = lngfin;
          i++;
        }

        // Obtener el número de días del mes
        const dias = new Date(item.anio, item.periodo, 0).getDate();
        let acumuladoTotal = 0.0;

        // Calcular el kilometraje por día
        for (let dia = 1; dia <= dias; dia++) {
          const sem: any = {
            kilometraje: 0,
            acumulado: 0,
            periodo: item.periodo,
            fechaAlta: null,
          };

          // Filtrar posiciones del día actual
          const posicionesDelDia = listaPosiciones.filter((pos: any) => {
            const fecha = new Date(pos.fechaHora);
            return fecha.getDate() === dia;
          });

          // Sumar las distancias del día
          sem.kilometraje = posicionesDelDia.reduce(
            (sum: number, pos: any) => sum + (pos.distancia || 0),
            0,
          );

          // Truncar a 2 decimales
          sem.kilometraje = Math.trunc(sem.kilometraje * 100) / 100;

          // Calcular acumulado
          if (dia === 1) {
            sem.acumulado = sem.kilometraje + Number(item.kmInicial);
            acumuladoTotal = sem.acumulado;
          } else {
            sem.acumulado = acumuladoTotal + sem.kilometraje;
            acumuladoTotal = sem.acumulado;
          }

          // Obtener la fecha del día
          const primeraPosicionDelDia = posicionesDelDia[0];
          if (primeraPosicionDelDia) {
            const fecha = new Date(primeraPosicionDelDia.fechaHora);
            sem.fechaAlta = fecha.toISOString().split('T')[0]; // Formato yyyy-MM-dd
          }

          listaSemanas.push(sem);
        }
      }

      const result: ApiResponseCommon = {
        data: listaSemanas,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener el reporte de kilometraje por días.',
        error: error.message,
      });
    }
  }
}
