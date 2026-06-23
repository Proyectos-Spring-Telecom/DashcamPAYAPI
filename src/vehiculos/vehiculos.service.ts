import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { Repository } from 'typeorm';
import { Vehiculos } from 'src/entities/Vehiculos';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { UpdateVehiculoEstatusDto } from './dto/update-vehiculos-estatus.dto';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Clientes } from 'src/entities/Clientes';
import { EstadoComponente, EstatusEnum } from 'src/common/estatus.enum';

@Injectable()
export class VehiculosService {
  constructor(
    @InjectRepository(Vehiculos)
    private readonly vehiculoRepository: Repository<Vehiculos>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) { }
  async create(createVehiculoDto: CreateVehiculoDto, idUser: number) {
    try {
      const vehiculoExist = await this.vehiculoRepository.findOne({
        where: { placa: createVehiculoDto.placa },
      });
      if (vehiculoExist)
        throw new BadRequestException(
          `El vehículo con placas ${createVehiculoDto.placa} ya se encuentra registrado en el sistema.`,
        );
      const vehiculoData =
        await this.vehiculoRepository.create(createVehiculoDto);
      const vehiculo = await this.vehiculoRepository.save(vehiculoData);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createVehiculoDto };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se creó el vehículo con placas: ${createVehiculoDto.placa}`,
        'CREATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El vehículo ha sido creado exitosamente.',
        data: {
          id: Number(vehiculo.id),
          nombre: `${vehiculo.modelo} ${vehiculo.placa} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createVehiculoDto };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se creó el vehículo con placas: ${createVehiculoDto.placa}`,
        'CREATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Se produjo un error al crear el vehículo.`,
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

  //Obtener los contadores por cliente /*/*Nulos
  async findAllListClientes(id: number, cliente: number) {
    try {
      const vehiculos = await this.vehiculoRepository.find({
        where: {
          idCliente: id,
          estatus: EstatusEnum.ACTIVO,
          estadoActual: EstadoComponente.DISPONIBLE,
        },
      });

      //Forzamos a cambiar el id a number
      const data = vehiculos.map((item) => ({
        ...item,
        id: Number(item.id),
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
        message: `Se produjo un error al obtener el listado de vehículos.`,
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER VEHÍCULOS POR ID DE CLIENTE
  // ========================================
  async findByCliente(
    idCliente: number,
    idUser: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Consulta directa de vehículos por cliente (solo el cliente especificado)
      const vehiculos = await this.vehiculoRepository.query(
        `
SELECT 
  v.Id AS id,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.Ano AS ano,
  v.Placa AS placa,
  v.NumeroEconomico AS numeroEconomico,
  v.TarjetaCirculacion AS tarjetaCirculacion,
  v.PolizaSeguro AS polizaSeguro,
  v.PermisoConcesion AS permisoConcesion,
  v.InspeccionMecanica AS inspeccionMecanica,
  v.Foto AS foto,
  v.PasajerosSentados AS pasajerosSentados,
  v.PasajerosParados AS pasajerosParados,
  v.CantidadPuertas AS cantidadPuertas,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.Estatus AS estatus,
  v.EstadoActual AS estadoActual,
  v.IdCliente AS idCliente,
  v.KM AS km,
  v.IdCombustible AS idCombustible,
  v.CapacidadLitros AS capacidadLitros,
  
  -- Datos del Cliente
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  CONCAT(c.Nombre, ' ', IFNULL(c.ApellidoPaterno, ''), ' ', IFNULL(c.ApellidoMaterno, '')) AS nombreCompletoCliente

FROM Vehiculos v
INNER JOIN Clientes c ON v.IdCliente = c.Id

WHERE 
  v.IdCliente = ?
  AND v.Estatus = 1
  AND v.EstadoActual = 1
  AND c.Estatus = 1

ORDER BY v.Id DESC
        `,
        [idCliente],
      );

      // Forzamos a cambiar el id a number
      const data = vehiculos.map((item) => ({
        ...item,
        id: Number(item.id),
        ano: Number(item.ano),
        pasajerosSentados: item.pasajerosSentados ? Number(item.pasajerosSentados) : null,
        pasajerosParados: item.pasajerosParados ? Number(item.pasajerosParados) : null,
        cantidadPuertas: item.cantidadPuertas ? Number(item.cantidadPuertas) : null,
        idCliente: Number(item.idCliente),
        km: item.km ? Number(item.km) : null,
        idCombustible: item.idCombustible ? Number(item.idCombustible) : null,
        capacidadLitros: item.capacidadLitros ? Number(item.capacidadLitros) : null,
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
        message: 'Error al obtener vehículos por cliente',
        error: error.message,
      });
    }
  }

  async findAll(
    page: number,
    limit: number,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let vehiculos;
      let totalResult;

      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          vehiculos = await this.vehiculoRepository.query(
            `
SELECT
  -- Datos del Vehículo
  v.Id AS id,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.Ano AS ano,
  v.Placa AS placa,
  v.NumeroEconomico AS numeroEconomico,
  v.TarjetaCirculacion AS tarjetaCirculacion,
  v.PolizaSeguro AS polizaSeguro,
  v.PermisoConcesion AS permisoConcesion,
  v.InspeccionMecanica AS inspeccionMecanica,
  v.Foto AS foto,
  v.PasajerosSentados AS pasajerosSentados,
  v.PasajerosParados AS pasajerosParados,
  v.CantidadPuertas AS cantidadPuertas,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.EstadoActual AS estadoActual,
  v.Estatus AS estatus,
  v.KM AS km,
  ctc.Nombre AS nombre,
  v.CapacidadLitros AS CapacidadLitros,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternocliente,
  c.ApellidoMaterno AS apellidoMaternocliente,
  c.Estatus AS estatusCliente

FROM Vehiculos v
INNER JOIN Clientes c ON v.IdCliente = c.Id
LEFT JOIN CatTipoCombustible ctc ON v.IdCombustible = ctc.Id
ORDER BY v.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.vehiculoRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Vehiculos v
  INNER JOIN Clientes c ON v.IdCliente = c.Id
  `,
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          // Consulta de datos paginados resto Usuario
          vehiculos = await this.vehiculoRepository.query(
            `
SELECT
  -- Datos del Vehículo
  v.Id AS id,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.Ano AS ano,
  v.Placa AS placa,
  v.NumeroEconomico AS numeroEconomico,
  v.TarjetaCirculacion AS tarjetaCirculacion,
  v.PolizaSeguro AS polizaSeguro,
  v.PermisoConcesion AS permisoConcesion,
  v.InspeccionMecanica AS inspeccionMecanica,
  v.Foto AS foto,
  v.PasajerosSentados AS pasajerosSentados,
  v.PasajerosParados AS pasajerosParados,
  v.CantidadPuertas AS cantidadPuertas,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.EstadoActual AS estadoActual,
  v.Estatus AS estatus,
  v.KM AS km,
  ctc.Nombre AS nombre,
  v.CapacidadLitros AS CapacidadLitros,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternocliente,
  c.ApellidoMaterno AS apellidoMaternocliente,
  c.Estatus AS estatusCliente

FROM Vehiculos v
INNER JOIN Clientes c ON v.IdCliente = c.Id
LEFT JOIN CatTipoCombustible ctc ON v.IdCombustible = ctc.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY v.Id DESC
LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.vehiculoRepository.query(
            `
  SELECT COUNT(*) AS total
  FROM Vehiculos v
  INNER JOIN Clientes c ON v.IdCliente = c.Id
	WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids],
          );
          break;
      }
      const total = Number(totalResult[0]?.total || 0);
      const data = vehiculos.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
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
        message: `Se produjo un error al obtener la paginación de vehículos.`,
        error: error.message,
      });
    }
  }

  async findAllList(cliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      let vehiculos;

      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          vehiculos = await this.vehiculoRepository.query(
            `
SELECT
  -- Datos del Vehículo
  v.Id AS id,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.Ano AS ano,
  v.Placa AS placa,
  v.NumeroEconomico AS numeroEconomico,
  v.TarjetaCirculacion AS tarjetaCirculacion,
  v.PolizaSeguro AS polizaSeguro,
  v.PermisoConcesion AS permisoConcesion,
  v.InspeccionMecanica AS inspeccionMecanica,
  v.Foto AS foto,
  v.PasajerosSentados AS pasajerosSentados,
  v.PasajerosParados AS pasajerosParados,
  v.CantidadPuertas AS cantidadPuertas,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.EstadoActual AS estadoActual,
  v.Estatus AS estatus,
  v.KM AS km,
  ctc.Nombre AS nombre,
  v.CapacidadLitros AS CapacidadLitros,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternocliente,
  c.ApellidoMaterno AS apellidoMaternocliente,
  c.Estatus AS estatusCliente

FROM Vehiculos v
INNER JOIN Clientes c ON v.IdCliente = c.Id
LEFT JOIN CatTipoCombustible ctc ON v.IdCombustible = ctc.Id
WHERE v.Estatus = 1
AND v.EstadoActual = 1
AND c.Estatus = 1
ORDER BY v.Id DESC;
        `,
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          // Consulta de datos listado resto Usuario
          vehiculos = await this.vehiculoRepository.query(
            `
SELECT
  -- Datos del Vehículo
  v.Id AS id,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.Ano AS ano,
  v.Placa AS placa,
  v.NumeroEconomico AS numeroEconomico,
  v.TarjetaCirculacion AS tarjetaCirculacion,
  v.PolizaSeguro AS polizaSeguro,
  v.PermisoConcesion AS permisoConcesion,
  v.InspeccionMecanica AS inspeccionMecanica,
  v.Foto AS foto,
  v.PasajerosSentados AS pasajerosSentados,
  v.PasajerosParados AS pasajerosParados,
  v.CantidadPuertas AS cantidadPuertas,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.EstadoActual AS estadoActual,
  v.Estatus AS estatus,
  v.KM AS km,
  ctc.Nombre AS nombre,
  v.CapacidadLitros AS CapacidadLitros,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternocliente,
  c.ApellidoMaterno AS apellidoMaternocliente,
  c.Estatus AS estatusCliente

FROM Vehiculos v
INNER JOIN Clientes c ON v.IdCliente = c.Id
LEFT JOIN CatTipoCombustible ctc ON v.IdCombustible = ctc.Id
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND v.Estatus = 1
AND v.EstadoActual = 1
AND c.Estatus = 1
ORDER BY v.Id DESC;
        `,
            [...ids],
          );
          break;
      }

      if (vehiculos.length === 0)
        throw new NotFoundException('No se encontraron vehículos.');

      const data = vehiculos.map((item) => ({
        ...item,
        id: Number(item.id),
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
        message:
          'Ocurrió un error al intentar obtener un listado de vehiculos.',
        error: error.message,
      });
    }
  }

  async findOne(id: number, cliente: number, rol: number) {
    try {
      let vehiculos;

      switch (rol) {
        case 1:
          vehiculos = await this.vehiculoRepository.query(
            `
SELECT
  -- Datos del Vehículo
  v.Id AS id,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.Ano AS ano,
  v.Placa AS placa,
  v.NumeroEconomico AS numeroEconomico,
  v.TarjetaCirculacion AS tarjetaCirculacion,
  v.PolizaSeguro AS polizaSeguro,
  v.PermisoConcesion AS permisoConcesion,
  v.InspeccionMecanica AS inspeccionMecanica,
  v.Foto AS foto,
  v.PasajerosSentados AS pasajerosSentados,
  v.PasajerosParados AS pasajerosParados,
  v.CantidadPuertas AS cantidadPuertas,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.EstadoActual AS estadoActual,
  v.Estatus AS estatus,
  v.KM AS km,
  v.IdCombustible AS idCombustible,
  ctc.Nombre AS nombre,
  v.CapacidadLitros AS CapacidadLitros,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternocliente,
  c.ApellidoMaterno AS apellidoMaternocliente,
  c.Estatus AS estatusCliente

FROM Vehiculos v
INNER JOIN Clientes c ON v.IdCliente = c.Id
LEFT JOIN CatTipoCombustible ctc ON v.IdCombustible = ctc.Id
WHERE v.Id = ?
ORDER BY v.Id DESC;
        `,
            [id],
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          vehiculos = await this.vehiculoRepository.query(
            `
SELECT
  -- Datos del Vehículo
  v.Id AS id,
  v.Marca AS marca,
  v.Modelo AS modelo,
  v.Ano AS ano,
  v.Placa AS placa,
  v.NumeroEconomico AS numeroEconomico,
  v.TarjetaCirculacion AS tarjetaCirculacion,
  v.PolizaSeguro AS polizaSeguro,
  v.PermisoConcesion AS permisoConcesion,
  v.InspeccionMecanica AS inspeccionMecanica,
  v.Foto AS foto,
  v.PasajerosSentados AS pasajerosSentados,
  v.PasajerosParados AS pasajerosParados,
  v.CantidadPuertas AS cantidadPuertas,
  v.FechaCreacion AS fechaCreacion,
  v.FechaActualizacion AS fechaActualizacion,
  v.EstadoActual AS estadoActual,
  v.Estatus AS estatus,
  v.KM AS km,
  v.IdCombustible AS idCombustible,
  ctc.Nombre AS nombre,
  v.CapacidadLitros AS CapacidadLitros,

  -- Datos del Cliente
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternocliente,
  c.ApellidoMaterno AS apellidoMaternocliente,
  c.Estatus AS estatusCliente

FROM Vehiculos v
INNER JOIN Clientes c ON v.IdCliente = c.Id
LEFT JOIN CatTipoCombustible ctc ON v.IdCombustible = ctc.Id
WHERE v.Id = ?
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY v.Id DESC;
        `,
            [id, ...ids],
          );
          break;
      }

      if (vehiculos.length == 0)
        throw new NotFoundException('Vehículo no encontrado.');

      const data = vehiculos.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
        idCombustible: item.idCombustible ? Number(item.idCombustible) : null,
        cantidadPuertas: item.cantidadPuertas ? Number(item.cantidadPuertas) : null,
      }));

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener el vehículo.',
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    updateVehiculoEstausDto: UpdateVehiculoEstatusDto,
  ) {
    try {
      const vehiculo = await this.vehiculoRepository.findOne({
        where: { id: id },
      });
      if (!vehiculo) throw new NotFoundException('Vehículo no encontrado.');
      const estatus = updateVehiculoEstausDto.estatus;
      if (estatus === 0) {
        const vehiculoInstalacion = await this.instalacionesRepository.findOne({
          where: { idVehiculo: vehiculo.id, estatus: 1 },
        });
        if (vehiculoInstalacion)
          throw new BadRequestException(
            'No es posible completar la operación: Vehiculo se encuentra asignado a una instalación.',
          );
        await this.vehiculoRepository.update(id, { estadoActual: estatus });
      } else {
        await this.vehiculoRepository.update(id, { estadoActual: estatus });
      }

      await this.vehiculoRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateVehiculoEstausDto };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se actualizó el estatus del vehículo con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus del vehículo actualizado correctamente.',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${vehiculo.modelo} ${vehiculo.placa} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateVehiculoEstausDto };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se actualizó el estatus del vehículo con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el estatus del vehículo.',
        error: error.message,
      });
    }
  }

  async update(
    id: number,
    idUser: number,
    updateVehiculoDto: UpdateVehiculoDto,
  ) {
    try {
      const vehiculo = await this.vehiculoRepository.findOne({
        where: { id: id },
      });
      if (!vehiculo) throw new NotFoundException('Vehiculo no encontrado');
      const vehiculoData = await this.vehiculoRepository.update(
        id,
        updateVehiculoDto,
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateVehiculoDto };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se actualizó el vehículo con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Vehículo actualizado correctamente.',
        data: {
          id: id,
          nombre:
            `${vehiculo.modelo || updateVehiculoDto.modelo} ${vehiculo.placa || updateVehiculoDto.placa} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      console.log(error)
      const querylogger = { updateVehiculoDto };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se actualizó el vehículo con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar el vehículo.',
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number) {
    try {
      const vehiculo = await this.vehiculoRepository.findOne({
        where: { id: id },
      });
      if (!vehiculo) throw new NotFoundException('Vehículo no encontrado.');
      const vehiculoInstalacion = await this.instalacionesRepository.findOne({
        where: { idVehiculo: vehiculo.id, estatus: 1 },
      });
      if (vehiculoInstalacion)
        throw new BadRequestException(
          'No es posible completar la operación: Vehiculo se encuentra asignado a una instalación.',
        );

      await this.vehiculoRepository.update(id, {
        estatus: 0,
        estadoActual: EstadoComponente.INACTIVO,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se eliminó el vehículo con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Vehiculo eliminado correctamente',
        data: {
          id: id,
          nombre: `${vehiculo.modelo} ${vehiculo.placa} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Vehiculos',
        `Se eliminó el vehículo con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        10,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al eliminar el vehículo.',
        error: error.message,
      });
    }
  }
}
