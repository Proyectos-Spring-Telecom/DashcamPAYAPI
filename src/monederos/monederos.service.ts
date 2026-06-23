import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMonederoDto } from './dto/create-monedero.dto';
import { UpdateMonederoDto } from './dto/update-monedero.dto';
import { UpdateMonederoEstatusDto } from './dto/update-monedero-estatus.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Monederos } from 'src/entities/Monederos';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { PasajerosService } from 'src/pasajeros/pasajeros.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import {
  EnumEstatusMonederos,
  EnumModulos,
  EnumSolicitudPasajero,
  EnumTipoTransaccion,
  EstatusEnum,
} from 'src/common/estatus.enum';
import { Clientes } from 'src/entities/Clientes';
import { UpdateMonederoCatPasajeroDto } from './dto/update-monedero-catpasajero.dto';
import { UpdateMonederoExtravioDto } from './dto/update-monedero-extravio.dto';
import { TransaccionesRecarga } from 'src/entities/TransaccionesRecarga';
import { Pasajeros } from 'src/entities/Pasajeros';
import { QRCodes } from 'src/entities/QRCodes';
import * as QRCode from 'qrcode';

@Injectable()
export class MonederosService {
  constructor(
    @InjectRepository(Monederos)
    private readonly monederoRepository: Repository<Monederos>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(TransaccionesRecarga)
    private readonly transaccionesrecargaRepository: Repository<TransaccionesRecarga>,
    @InjectRepository(Pasajeros)
    private readonly pasajeroRepository: Repository<Pasajeros>,
    @InjectRepository(QRCodes)
    private readonly qrCodesRepository: Repository<QRCodes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly pasajerosService: PasajerosService,
  ) {}

  // ========================================
  // 🔹 CREAR UN MONEDERO
  // ========================================
  async createMonedero(
    createMonederoDto: CreateMonederoDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      // Validar que el numeroSerie no esté duplicado
      const monederoPorSerie = await this.monederoRepository.findOne({
        where: { numeroSerie: createMonederoDto.numeroSerie },
      });
      if (monederoPorSerie) {
        throw new BadRequestException(
          `El número de serie "${createMonederoDto.numeroSerie}" ya está registrado. Por favor, use un número de serie diferente.`,
        );
      }

      // Validar que el idCard no esté duplicado (solo si se proporciona)
      if (createMonederoDto.idCard) {
        const monederoPorIdCard = await this.monederoRepository.findOne({
          where: { idCard: createMonederoDto.idCard },
        });
        if (monederoPorIdCard) {
          throw new BadRequestException(
            `El ID de tarjeta "${createMonederoDto.idCard}" ya está registrado. Por favor, use un ID de tarjeta diferente.`,
        );
        }
      }

      //Agregamos la fecha actual
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

      //Añadimos fecha
      createMonederoDto.fechaActivacion = fechaActual;
      createMonederoDto.estatus = EnumEstatusMonederos.ACTIVO;

      //Guardamos el monedero
      const newMonedero = this.monederoRepository.create({
        ...createMonederoDto,
        esVirtual: 0, // Monedero físico creado manualmente
      });
      const monederoSave = await this.monederoRepository.save(newMonedero);

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { createMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se creó un monedero con número de serie: ${monederoSave.numeroSerie}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Creamos la transaccion en la BD
      const newTransaccion = await this.transaccionesrecargaRepository.create({
        idTipoTransaccion: EnumTipoTransaccion.RECARGA,
        monto: createMonederoDto.saldo,
        fechaHoraFinal: fechaActual,
        numeroSerieMonedero: monederoSave.numeroSerie,
        numeroSerieValidador: null,
        idMetodoPago:1
      });
      const transaccionSave =
        await this.transaccionesrecargaRepository.save(newTransaccion);

      // --- Registro en la bitácora --- SUCCESS
      const queryloggerTransacciones = { newTransaccion };
      await this.bitacoraLogger.logToBitacora(
        'Transacciones',
        `Se realizo una transaccion de tipo ${EnumTipoTransaccion.RECARGA}`,
        'CREATE',
        queryloggerTransacciones,
        idUser,
        EnumModulos.TRANSACCIONES,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Monedero creado correctamente.',
        data: {
          id: Number(monederoSave.id),
          nombre: `${monederoSave.numeroSerie} ${monederoSave.saldo} ` || '',
        },
      };
      return result;
    } catch (error) {
      // -------------   ERROR -------------****-*-*
      // --- Registro en la bitácora --- ERROR
      const querylogger = { createMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se creó un monedero con número de serie: ${createMonederoDto.numeroSerie}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Hubo un error al crear el monedero.',
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

  // ========================================
  // 🔹 OBTENER PAGINADO DE MONEDEROS
  // ========================================
  async findAllPagMonederos(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let monederos;
      // Convertir rol a número para el switch
      const rolNumero = Number(rol);
      switch (rolNumero) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente,

    ct.Nombre AS nombreTipoPasajero

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct ON m.IdTipoPasajero = ct.Id

ORDER BY m.Id DESC
LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id



  `,
          );
          break;

        case 9:
          // Consulta de datos paginados Usuario Pasajero
          // Buscar el pasajero por el idUsuario del token JWT
          const pasajeroByUserPag = await this.monederoRepository.query(
            `SELECT Id FROM Pasajeros WHERE IdUsuario = ?`,
            [idUser],
          );
          
          if (!pasajeroByUserPag || pasajeroByUserPag.length === 0) {
            // Si no tiene pasajero asociado, devolver array vacío
            monederos = [];
            totalResult = [{ total: 0 }];
            break;
          }
          
          const idPasajeroPag = pasajeroByUserPag[0].Id;
          
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente,

    ct.Nombre AS nombreTipoPasajero

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct ON m.IdTipoPasajero = ct.Id

WHERE m.IdPasajero = ? AND m.Estatus = 1

ORDER BY m.Id DESC
LIMIT ? OFFSET ?;

            `,
            [idPasajeroPag, limit, offset],
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
LEFT JOIN Clientes c ON m.IdCliente = c.Id

WHERE m.IdPasajero = ? AND m.Estatus = 1
  `,
            [idPasajeroPag],
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente,

    ct.Nombre AS nombreTipoPasajero

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct ON m.IdTipoPasajero = ct.Id

WHERE c.Id IN (${placeholders})

ORDER BY m.Id DESC
LIMIT ? OFFSET ?;

            `,
            [...ids, limit, offset],
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id
WHERE c.Id IN (${placeholders})

  `,
            [...ids],
          );
          break;
      }

      const data = monederos.map((item) => ({
        ...item,
        id: Number(item.id),
        saldo: Number(item.saldo),
        idPasajero: Number(item.idPasajero),
        idCliente: Number(item.idCliente),
        idPasajeroMonedero: Number(item.idPasajeroMonederos),
        idClienteMonedero: Number(item.idClienteMonedero),
        tipoMonedero: item.esVirtual === 1 ? 'virtual' : 'fisico',
        idCard: item.idCard || null,
      }));

      const total = Number(totalResult[0]?.total || 0);

      //APi response
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
      throw new InternalServerErrorException(
        'Hubo un error al obtener el listado de monederos.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER PAGINADO DE MONEDEROS ACTIVOS
  // ========================================
  async findAllPagMonederosActivos(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let monederos;
      // Convertir rol a número para el switch
      const rolNumero = Number(rol);
      switch (rolNumero) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador - Solo activos
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente,

    ct.Nombre AS nombreTipoPasajero

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct ON m.IdTipoPasajero = ct.Id

WHERE m.Estatus = 1

ORDER BY m.Id DESC
LIMIT ? OFFSET ?;
            `,
            [limit, offset],
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE m.Estatus = 1

  `,
          );
          break;

        case 9:
          // Consulta de datos paginados Usuario Pasajero - Solo activos
          // Buscar el pasajero por el idUsuario del token JWT
          const pasajeroByUserAct = await this.monederoRepository.query(
            `SELECT Id FROM Pasajeros WHERE IdUsuario = ?`,
            [idUser],
          );
          
          if (!pasajeroByUserAct || pasajeroByUserAct.length === 0) {
            // Si no tiene pasajero asociado, devolver array vacío
            monederos = [];
            totalResult = [{ total: 0 }];
            break;
          }
          
          const idPasajeroAct = pasajeroByUserAct[0].Id;
          
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente,

    ct.Nombre AS nombreTipoPasajero

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
LEFT JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct ON m.IdTipoPasajero = ct.Id

WHERE m.IdPasajero = ? AND m.Estatus = 1

ORDER BY m.Id DESC
LIMIT ? OFFSET ?;

            `,
            [idPasajeroAct, limit, offset],
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
LEFT JOIN Clientes c ON m.IdCliente = c.Id

WHERE m.IdPasajero = ? AND m.Estatus = 1
  `,
            [idPasajeroAct],
          );
          break;

        default:
          // Consulta de datos paginados resto Usuario - Solo activos
          const { ids, placeholders } = await this.clienteHijos(cliente);
          
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatus,
    m.IdPasajero AS idPasajero,
    m.IdCliente AS idCliente,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajeroMonederos,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idClienteMonederos,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente,

    ct.Nombre AS nombreTipoPasajero

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct ON m.IdTipoPasajero = ct.Id

WHERE c.Id IN (${placeholders}) AND m.Estatus = 1

ORDER BY m.Id DESC
LIMIT ? OFFSET ?;

            `,
            [...ids, limit, offset],
          );

          totalResult = await this.monederoRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id
WHERE c.Id IN (${placeholders}) AND m.Estatus = 1

  `,
            [...ids],
          );
          break;
      }

      const data = monederos.map((item) => ({
        ...item,
        id: Number(item.id),
        saldo: Number(item.saldo),
        idPasajero: Number(item.idPasajero),
        idCliente: Number(item.idCliente),
        idPasajeroMonedero: Number(item.idPasajeroMonederos),
        idClienteMonedero: Number(item.idClienteMonedero),
        tipoMonedero: item.esVirtual === 1 ? 'virtual' : 'fisico',
        idCard: item.idCard || null,
        customerIdNetPay: item.customerId || null,
      }));

      const total = Number(totalResult[0]?.total || 0);

      //APi response
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
      throw new InternalServerErrorException(
        'Hubo un error al obtener el listado de monederos activos.',
      );
    }
  }

  //Obtener todos los monederos paginado //no sirve
  async findAllMonederos(
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const monederos = await this.monederoRepository.find();
      if (monederos.length === 0) {
        throw new NotFoundException('No se encontraron monederos.');
      }
      const [data, total] = await this.monederoRepository.findAndCount({
        relations: [],
        skip: (page - 1) * limit,
        take: limit,
        order: {
          id: 'DESC',
        },
      });

      //Cambiamos los datos numericos a number
      const monederoResult = data.map((item) => ({
        ...item,
        id: Number(item.id),
        saldo: Number(item.saldo),
        idPasajero: Number(item.idPasajero),
        idCliente: Number(item.idCliente),
        tipoMonedero: item.esVirtual === 1 ? 'virtual' : 'fisico',
        idCard: item.idCard || null,
      }));

      const result: ApiResponseCommon = {
        data: monederoResult,
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
      throw new InternalServerErrorException(
        'Hubo un error al obtener los monederos paginados.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER LISTADO DE MONEDEROS
  // ========================================
  async findAllListMonederos(
    idUser: number,
    email: string,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      console.log('[MONEDEROS LIST] Parámetros recibidos:', { idUser, email, cliente, rol, tipoRol: typeof rol });
      
      let monederos;
      // Convertir rol a número para el switch
      const rolNumero = Number(rol);
      console.log('[MONEDEROS LIST] Rol convertido a número:', rolNumero);
      
      switch (rolNumero) {
        case 1:
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatusMonedero,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajero,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idCliente,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE m.Estatus = 1 -- estatus activo
AND c.Estatus = 1

ORDER BY m.Id DESC;

            `,
          );
          break;

        case 9:
          console.log('[MONEDEROS LIST] Entró al case 9 (Pasajero)');
          // Buscar el pasajero por el idUsuario del token JWT
          const pasajeroByUser = await this.monederoRepository.query(
            `SELECT Id FROM Pasajeros WHERE IdUsuario = ?`,
            [idUser],
          );
          
          console.log('[MONEDEROS LIST] Resultado búsqueda pasajero:', pasajeroByUser);
          
          if (!pasajeroByUser || pasajeroByUser.length === 0) {
            // Si no tiene pasajero asociado, devolver array vacío
            console.log('[MONEDEROS LIST] No se encontró pasajero para idUser:', idUser);
            monederos = [];
            break;
          }
          
          const idPasajero = pasajeroByUser[0].Id;
          console.log('[MONEDEROS LIST] idPasajero encontrado:', idPasajero);
          
          // Traer TODOS los monederos del pasajero, tenga o no idCliente
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatusMonedero,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajero,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idCliente,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
LEFT JOIN Clientes c ON m.IdCliente = c.Id

WHERE m.IdPasajero = ? AND m.Estatus = 1

ORDER BY m.Id DESC;

            `,
            [idPasajero],
          );
          
          console.log('[MONEDEROS LIST] Cantidad de monederos encontrados:', monederos.length);
          console.log('[MONEDEROS LIST] Primeros 3 monederos:', monederos.slice(0, 3).map(m => ({ id: m.id, idPasajero: m.idPasajero, numeroSerie: m.numeroSerie })));
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.NumeroSerie AS numeroSerie,
    m.Saldo AS saldo,
    m.FechaActivacion AS fechaActivacion,
    m.FechaCreacion AS fechaCreacion,
    m.FechaActualizacion AS fechaActualizacion,
    m.Estatus AS estatusMonedero,
    m.EsVirtual AS esVirtual,
    m.IdCard AS idCard,

    p.Id AS idPasajero,
    p.Nombre AS pasajeroNombre,
    p.ApellidoPaterno AS pasajeroApellidoPaterno,
    p.ApellidoMaterno AS pasajeroApellidoMaterno,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', p.ApellidoMaterno) AS nombreCompletoPasajero,
    p.CustomerIdNetPay AS customerId,
    u.Telefono AS telefonoUsuario,
    u.UserName AS correoUsuario,

    c.Id AS idCliente,
    c.Nombre AS clienteNombre,
    c.ApellidoPaterno AS clienteApellidoPaterno,
    c.ApellidoMaterno AS clienteApellidoMaterno,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Monederos m
LEFT JOIN Pasajeros p ON m.IdPasajero = p.Id
LEFT JOIN Usuarios u ON p.IdUsuario = u.Id
INNER JOIN Clientes c ON m.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND m.Estatus = 1 -- estatus activo
AND c.Estatus = 1

ORDER BY m.Id DESC;

            `,
            [...ids],
          );
          break;
      }

      const data = monederos.map((item) => ({
        ...item,
        id: Number(item.id),
        saldo: Number(item.saldo),
        idPasajero: Number(item.idPasajero),
        idCliente: Number(item.idCliente),
        tipoMonedero: item.esVirtual === 1 ? 'virtual' : 'fisico',
        idCard: item.idCard || null,
      }));

      //Api response
      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Hubo un error al obtener el listado de monederos.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER UN MONEDERO POR ID
  // ========================================
  async findOneMonedero(id: number) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
        relations: ['idPasajero2', 'idPasajero2.idUsuario2'],
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`,
        );
      }

      //Cambiamos los datos numericos a number
      const monederoResult = {
        ...monedero,
        id: Number(monedero.id),
        saldo: Number(monedero.saldo),
        idPasajero: Number(monedero.idPasajero),
        idCliente: Number(monedero.idCliente),
        tipoMonedero: monedero.esVirtual === 1 ? 'virtual' : 'fisico',
        customerId: monedero.idPasajero2?.customerIdNetPay || null,
        telefonoUsuario: monedero.idPasajero2?.idUsuario2?.telefono || null,
        correoUsuario: monedero.idPasajero2?.idUsuario2?.userName || null,
        idCard: monedero.idCard || null,
      };
      return { data: monederoResult };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Hubo un error al obtener el monedero.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENER MONEDERO POR NUMERO DE SERIE O IDCARD
  // ========================================
  async findOneMonederoBySerie(NumeroSerie: string) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: [
          { numeroSerie: NumeroSerie },
          { idCard: NumeroSerie },
        ],
        relations: ['idPasajero2', 'idPasajero2.idUsuario2'],
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con número de serie o ID de tarjeta: ${NumeroSerie} no fue encontrado.`,
        );
      }
      //Cambiamos los datos numericos a number
      const monederoResult = {
        ...monedero,
        id: Number(monedero.id),
        saldo: Number(monedero.saldo),
        idPasajero: Number(monedero.idPasajero),
        idCliente: Number(monedero.idCliente),
        tipoMonedero: monedero.esVirtual === 1 ? 'virtual' : 'fisico',
        customerId: monedero.idPasajero2?.customerIdNetPay || null,
        telefonoUsuario: monedero.idPasajero2?.idUsuario2?.telefono || null,
        correoUsuario: monedero.idPasajero2?.idUsuario2?.userName || null,
        idCard: monedero.idCard || null,
      };
      return { data: monederoResult };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Hubo un error al obtener el monedero por número de serie o ID de tarjeta.',
      );
    }
  }

  // ========================================
  // 🔹 CAMBIAR ESTATUS DEL MONEDERO
  // ========================================
  async updateMonederoEstatus(
    id: number,
    idUser: number,
    updateMonederoEstatusDto: UpdateMonederoEstatusDto,
  ) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`,
        );
      }

      //Actualizamos estatus
      const { estatus } = updateMonederoEstatusDto;
      await this.monederoRepository.update(id, { estatus: estatus });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { updateMonederoEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el estatus del monedero con ID: ${id} a ${estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El estatus del monedero se actualizó correctamente.',
        estatus: { estatus: estatus },
        data: {
          id: Number(monedero.id),
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || '',
        },
      };

      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { updateMonederoEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el estatus del monedero con ID: ${id} a ${updateMonederoEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error.message;
      }
      throw new InternalServerErrorException(
        'Hubo un error al actualizar el estatus del monedero.',
      );
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR TIPO DE PASJERO EN EL MONEDERO
  // ========================================
  async updateMonederoTipoPasajero(
    id: number,
    idUser: number,
    updateMonederoCatPasajeroDto: UpdateMonederoCatPasajeroDto,
  ) {
    try {
      //Buscamos y validamos que exista el monedero
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con número de ID: ${id} no fue encontrado.`,
        );
      }

      //extraemos la variable a actualizar
      const { idTipoPasajero } = updateMonederoCatPasajeroDto;

      //Actualizamos los datos
      await this.monederoRepository.update(id, {
        idTipoPasajero: idTipoPasajero,
      });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { updateMonederoCatPasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el tipo de pasajero del monedero con ID: ${id} a ${updateMonederoCatPasajeroDto.idTipoPasajero}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Si el monedero esta asociado a un pasajero se debe actualizar su estado de solicitud
      if (monedero.idPasajero) {
        //Actualizamos el estado de la solicitud
        const idPasajero = Number(monedero.idPasajero);
        const bodyPasajero = {
          estadoSolicitud: EnumSolicitudPasajero.APROBADO,
        };
        await this.pasajerosService.updatePasajero(
          idPasajero,
          idUser,
          bodyPasajero,
        );
      }

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: `Se actualizó el tipo de pasajero del monedero con ID: ${id} correctamente.`,
        data: {
          id: Number(monedero.id),
          nombre: `${monedero.numeroSerie} ` || '',
        },
      };

      return result;
    } catch (error) {
      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { updateMonederoCatPasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el tipo de pasajero del monedero con ID: ${id} a ${updateMonederoCatPasajeroDto.idTipoPasajero}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Hubo un error al actualizar el tipo de pasajero del monedero.',
      );
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR SALDO DEL MONEDERO
  // ========================================
  async updateMonederoSaldo(
    numeroSerie: string,
    idUser: number,
    saldo: number,
  ) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { numeroSerie: numeroSerie },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con número de serie: ${numeroSerie} no fue encontrado.`,
        );
      }
      const id = Number(monedero.id);

      //Actualizamos saldo
      await this.monederoRepository.update(id, { saldo: saldo });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { numeroSerie: numeroSerie, saldo: saldo };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el saldo del monedero con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El saldo del monedero se actualizó correctamente.',
        data: {
          id: id,
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || '',
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { numeroSerie: numeroSerie, saldo: saldo };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el saldo del monedero con número de serie: ${numeroSerie}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al crear ruta',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR MONEDERO
  // ========================================
  async updateMonedero(
    id: number,
    idUser: number,
    updateMonederoDto: UpdateMonederoDto,
  ) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`,
        );
      }

      // Validar que el numeroSerie no esté duplicado (solo si se está actualizando)
      if (updateMonederoDto.numeroSerie !== undefined && updateMonederoDto.numeroSerie !== monedero.numeroSerie) {
        const monederoPorSerie = await this.monederoRepository.findOne({
          where: { numeroSerie: updateMonederoDto.numeroSerie },
        });
        if (monederoPorSerie && monederoPorSerie.id !== id) {
          throw new BadRequestException(
            `El número de serie "${updateMonederoDto.numeroSerie}" ya está registrado en otro monedero. Por favor, use un número de serie diferente.`,
          );
        }
      }

      // Validar que el idCard no esté duplicado (solo si se está actualizando y se proporciona)
      if (updateMonederoDto.idCard !== undefined && updateMonederoDto.idCard !== null) {
        // Solo validar si el idCard es diferente al actual o si el monedero actual no tiene idCard
        if (updateMonederoDto.idCard !== monedero.idCard) {
          const monederoPorIdCard = await this.monederoRepository.findOne({
            where: { idCard: updateMonederoDto.idCard },
          });
          if (monederoPorIdCard && monederoPorIdCard.id !== id) {
            throw new BadRequestException(
              `El ID de tarjeta "${updateMonederoDto.idCard}" ya está registrado en otro monedero. Por favor, use un ID de tarjeta diferente.`,
            );
          }
        }
      }

      // Validar que si se intenta asignar un idPasajero, el monedero no esté ya asignado a otro pasajero
      if (updateMonederoDto.idPasajero !== undefined) {
        // Si el monedero ya tiene un idPasajero y es diferente al que se intenta asignar
        if (monedero.idPasajero && monedero.idPasajero !== updateMonederoDto.idPasajero) {
          const pasajeroAsociado = await this.pasajeroRepository.findOne({
            where: { id: monedero.idPasajero },
          });
          
          if (pasajeroAsociado) {
            throw new BadRequestException(
              `El monedero con número de serie ${monedero.numeroSerie} ya está asignado al pasajero ${pasajeroAsociado.nombre} ${pasajeroAsociado.apellidoPaterno} (ID: ${pasajeroAsociado.id}).`,
            );
          } else {
            throw new BadRequestException(
              `El monedero con número de serie ${monedero.numeroSerie} está asociado a un pasajero que no existe en el sistema.`,
            );
          }
        }

        // Validar que el pasajero no tenga ya otro monedero activo
        const monederoExistente = await this.monederoRepository.findOne({
          where: {
            idPasajero: updateMonederoDto.idPasajero,
            estatus: EstatusEnum.ACTIVO,
          },
        });

        if (monederoExistente && monederoExistente.id !== id) {
          const pasajero = await this.pasajeroRepository.findOne({
            where: { id: updateMonederoDto.idPasajero },
          });
          
          if (pasajero) {
            throw new BadRequestException(
              `El pasajero ${pasajero.nombre} ${pasajero.apellidoPaterno} (ID: ${pasajero.id}) ya tiene un monedero activo asignado (Número de serie: ${monederoExistente.numeroSerie}, ID: ${monederoExistente.id}). Un pasajero no puede tener dos monederos activos.`,
            );
          } else {
            throw new BadRequestException(
              `El pasajero con ID ${updateMonederoDto.idPasajero} no existe en el sistema.`,
            );
          }
        }
      }

      //Actualizamos monedero
      const monederoData =
        await this.monederoRepository.create(updateMonederoDto);
      await this.monederoRepository.update(id, monederoData);

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { updateMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el monedero con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Monedero actualizado correctamente.',
        data: {
          id: id,
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || '',
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { updateMonederoDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el monedero con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar monedero',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ELIMINADO LOGICO DE MONEDERO
  // ========================================
  async removeMonedero(id: number, idUser: number) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`,
        );
      }

      //Eliminamos de manera logica
      await this.monederoRepository.update(id, {
        estatus: EstatusEnum.INACTIVO,
      });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se eliminó el monedero con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Monedero eliminado correctamente.',
        data: {
          id: id,
          nombre: `${monedero.numeroSerie} ${monedero.saldo} ` || '',
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se eliminó el monedero con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Hubo un error al eliminar el monedero.',
      );
    }
  }

  async reportarExtravio(
    idUser: number,
    updateMonederoExtravioDto: UpdateMonederoExtravioDto,
  ) {
    try {
      const { correo, numeroSerie } = updateMonederoExtravioDto;
      //Buscamos el pasajero por correo y validamos que exista
      const pasajero =
        await this.pasajerosService.findOnePasajeroCorreo(correo);
      if (!pasajero) {
        throw new NotFoundException(
          `El pasajero con correo: ${correo} no fue encontrado.`,
        );
      }

      //Buscamos monedero asociado al pasajero
      const monedero = await this.monederoRepository.findOne({
        where: { idPasajero: pasajero.id, estatus: EstatusEnum.ACTIVO },
      });
      if (!monedero) {
        throw new NotFoundException(
          `No se encontro un monedero asociado al pasajero con ID: ${pasajero.id}`,
        );
      }

      //Buscamos el nuevo monedero
      const nuevoMonedero = await this.monederoRepository.findOne({
        where: { numeroSerie: numeroSerie },
      });
      if (!nuevoMonedero) {
        throw new NotFoundException(
          `No se encontro un monedero asociado al pasajero con ID: ${pasajero.id}`,
        );
      }
      //Agregamos la fecha actual
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const ahora = new Date();
      const desfaseMs = -6 * 60 * 60 * 1000; // -6 horas en milisegundos
      const fechaDesfasada = new Date(ahora.getTime() + desfaseMs);

      const fechaActual = `${fechaDesfasada.getFullYear()}-${pad(fechaDesfasada.getMonth() + 1)}-${pad(fechaDesfasada.getDate())} ${pad(fechaDesfasada.getHours())}:${pad(fechaDesfasada.getMinutes())}:${pad(fechaDesfasada.getSeconds())}`;

      //Actualizamos los datos del monedero extraviado al nuevo monedero
      nuevoMonedero.saldo = monedero.saldo;
      nuevoMonedero.fechaActivacion = fechaDesfasada;
      nuevoMonedero.idPasajero = monedero.idPasajero;
      nuevoMonedero.idCliente = monedero.idCliente;
      nuevoMonedero.idTipoPasajero = monedero.idTipoPasajero;
      nuevoMonedero.estatus = EnumEstatusMonederos.ACTIVO;

      await this.monederoRepository.update(nuevoMonedero.id, nuevoMonedero);

      await this.monederoRepository.update(monedero.id, {
        estatus: EnumEstatusMonederos.INACTIVO,
        idPasajero: null,
        saldo: 0,
      });

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { nuevoMonedero };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se realizo baja del monedero con numero de serie: ${monedero.numeroSerie} y se añadio el nuevo monedero con numero de serie: ${nuevoMonedero.numeroSerie}.`,
        'DELETE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Monedero recuperado de manera correcta correctamente.',
        data: {
          id: Number(nuevoMonedero.id),
          nombre: `${nuevoMonedero.numeroSerie} ${nuevoMonedero.saldo} ` || '',
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { updateMonederoExtravioDto };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se realizo baja del monedero y se registro el nuevo con numero de serie: ${updateMonederoExtravioDto.numeroSerie}.`,
        'DELETE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Hubo un error al intentar generar el reportar el extravio del monedero.',
      );
    }
  }

  // ========================================
  // 🔹 GENERAR QR CON SALDO DEL MONEDERO
  // ========================================
  async generarQRConSaldo(idUsuario: number, numeroPasajes: number) {
    try {
      // Buscar el pasajero asociado al usuario
      const pasajero = await this.pasajeroRepository.findOne({
        where: { idUsuario: idUsuario },
      });

      if (!pasajero) {
        throw new NotFoundException(
          `No se encontró un pasajero asociado al usuario con ID: ${idUsuario}.`,
        );
      }

      // Buscar el monedero activo del pasajero
      const monedero = await this.monederoRepository.findOne({
        where: {
          idPasajero: pasajero.id,
          estatus: EstatusEnum.ACTIVO,
        },
      });

      if (!monedero) {
        throw new NotFoundException(
          `No se encontró un monedero activo para el pasajero con ID: ${pasajero.id}.`,
        );
      }

      // Obtener el saldo del monedero
      const saldo = Number(monedero.saldo);

      // Verificar si ya existe un QR con estatus 1 para este pasajero
      const qrExistente = await this.qrCodesRepository.findOne({
        where: {
          idPasajero: pasajero.id,
          estatus: EstatusEnum.ACTIVO,
        },
        order: {
          fhRegistro: 'DESC',
        },
      });

      // Si existe un QR activo, extraer el saldo del JSON embebido en el QR
      if (qrExistente) {
        try {
          // El QR base64 contiene una imagen, pero el JSON original está embebido
          // Necesitamos extraer el JSON del QR para comparar el saldo
          // El QR fue generado con: JSON.stringify({ saldo, numeroSerie, idMonedero, idPasajero })
          
          // Generar el JSON esperado con el saldo actual y numeroPasajes
          const qrDataEsperado = JSON.stringify({
            saldo: saldo,
            numeroSerie: monedero.numeroSerie,
            idMonedero: monedero.id,
            idPasajero: pasajero.id,
            numeroPasajes: numeroPasajes,
          });

          // Generar un QR temporal con el saldo actual para comparar
          const qrTemporal = await QRCode.toDataURL(qrDataEsperado, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 300,
          });

          // Si el QR existente es igual al nuevo (mismo saldo), devolverlo
          // Nota: Esta comparación no es perfecta porque los QRs pueden variar ligeramente
          // Una mejor solución sería guardar el saldo en la BD, pero por ahora usamos esta aproximación
          // Si los QRs son muy similares (primeros 500 caracteres), asumimos que el saldo no cambió
          const qrExistenteInicio = qrExistente.qrCodeBase64.substring(0, 500);
          const qrTemporalInicio = qrTemporal.substring(0, 500);

          // Verificar también si el numeroPasajes coincide con el QR existente
          // Si el numeroPasajes cambió, necesitamos generar un nuevo QR
          const numeroPasajesCoincide = qrExistente.numeroPasajes === numeroPasajes;
          
          // Si son muy similares y el numeroPasajes coincide, devolver el QR existente
          if (qrExistenteInicio === qrTemporalInicio && numeroPasajesCoincide) {
            return {
              status: 'success',
              message: 'QR existente devuelto correctamente.',
              data: {
                qrCode: qrExistente.qrCodeBase64,
                saldo: saldo,
                numeroSerie: monedero.numeroSerie,
                idQR: qrExistente.id,
                numeroPasajes: numeroPasajes,
              },
            };
          }

          // Si son diferentes, el saldo cambió, desactivar el QR anterior
          await this.qrCodesRepository.update(qrExistente.id, {
            estatus: EstatusEnum.INACTIVO,
          });
        } catch (comparisonError) {
          // Si hay error al comparar, desactivar el anterior y generar uno nuevo
          try {
            await this.qrCodesRepository.update(qrExistente.id, {
              estatus: EstatusEnum.INACTIVO,
            });
          } catch (updateError) {
          }
        }
      }

      // Si no existe o tiene estatus diferente de 1, generar uno nuevo
      // Crear el contenido del QR como JSON para que la app pueda leerlo y usarlo
      const qrData = JSON.stringify({
        saldo: saldo,
        numeroSerie: monedero.numeroSerie,
        idMonedero: monedero.id,
        idPasajero: pasajero.id,
        numeroPasajes: numeroPasajes,
      });

      // Generar el QR en base64
      const qrCodeBase64 = await QRCode.toDataURL(qrData, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 300,
      });

      // Guardar el QR en la base de datos
      const nuevoQR = await this.qrCodesRepository.create({
        idPasajero: pasajero.id,
        qrCodeBase64: qrCodeBase64,
        fhRegistro: new Date(),
        estatus: EstatusEnum.ACTIVO,
        numeroPasajes: numeroPasajes,
      });
      await this.qrCodesRepository.save(nuevoQR);

      // Retornar el QR en base64
      return {
        status: 'success',
        message: 'QR generado correctamente.',
        data: {
          qrCode: qrCodeBase64,
          saldo: saldo,
          numeroSerie: monedero.numeroSerie,
          idQR: nuevoQR.id,
          numeroPasajes: numeroPasajes,
        },
      };
    } catch (error) {
      // Log del error para debugging
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Proporcionar más información sobre el error
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      throw new InternalServerErrorException(
        `Hubo un error al generar el código QR del monedero: ${errorMessage}`,
      );
    }
  }
}
