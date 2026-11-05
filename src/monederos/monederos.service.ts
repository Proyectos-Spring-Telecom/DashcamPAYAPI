import { nowDb } from 'src/common/clock';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateMonederoDto } from './dto/create-monedero.dto';
import { UpdateMonederoDto } from './dto/update-monedero.dto';
import { UpdateMonederoEstatusDto } from './dto/update-monedero-estatus.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
  EstatusEnum,
} from 'src/common/estatus.enum';
import { Clientes } from 'src/entities/Clientes';
import { UpdateMonederoCatPasajeroDto } from './dto/update-monedero-catpasajero.dto';
import { UpdateMonederoExtravioDto } from './dto/update-monedero-extravio.dto';
import { TransaccionesRecarga } from 'src/entities/TransaccionesRecarga';
import { Pasajeros } from 'src/entities/Pasajeros';
import { QRCodes } from 'src/entities/QRCodes';
import * as QRCode from 'qrcode';
import {
  clientesPermitidos,
  clienteHijosDesdeSp,
  esPublicId,
  generarPublicId,
  tieneIdsTenant,
} from 'src/common/tenant/ownership-resolvers';

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
    private readonly dataSource: DataSource,
  ) {}

  // ========================================
  // 🔹 CREAR UN MONEDERO
  // ========================================
  async createMonedero(
    createMonederoDto: CreateMonederoDto,
    idUser: number,
    clienteActor = 0,
    rol = 1,
  ): Promise<ApiCrudResponse> {
    try {
      if (Number(rol) !== 1) {
        const permitidos = await clientesPermitidos(
          this.dataSource,
          clienteActor,
        );
        if (!permitidos.includes(Number(createMonederoDto.idCliente))) {
          throw new NotFoundException('Cliente no encontrado');
        }
      }

      // H-17: el pasajero debe existir, estar activo, ser del mismo cliente que
      // el monedero y no tener ya otro monedero activo.
      if (createMonederoDto.idPasajero != null) {
        const [pas] = await this.dataSource.query(
          `SELECT p.Id AS id, u.IdCliente AS idCliente
             FROM Pasajeros p
             LEFT JOIN Usuarios u ON u.Id = p.IdUsuario
            WHERE p.Id = ? AND p.Estatus = 1`,
          [Number(createMonederoDto.idPasajero)],
        );
        if (
          !pas ||
          Number(pas.idCliente) !== Number(createMonederoDto.idCliente)
        ) {
          throw new NotFoundException('Pasajero no encontrado');
        }
        const yaTiene = await this.monederoRepository.findOne({
          where: {
            idPasajero: Number(createMonederoDto.idPasajero),
            estatus: EnumEstatusMonederos.ACTIVO,
          },
        });
        if (yaTiene) {
          throw new BadRequestException(
            'El pasajero ya tiene un monedero activo.',
          );
        }
      }

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

      const fechaDesfasada = nowDb();

      const fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())} ${pad(fechaDesfasada.getUTCHours())}:${pad(fechaDesfasada.getUTCMinutes())}:${pad(fechaDesfasada.getUTCSeconds())}`;

      //Añadimos fecha
      createMonederoDto.fechaActivacion = fechaActual;
      createMonederoDto.estatus = EnumEstatusMonederos.ACTIVO;

      //Guardamos el monedero
      const newMonedero = this.monederoRepository.create({
        ...createMonederoDto,
        publicId: generarPublicId(), // H-66: id opaco en el alta
        saldo: 0,
        esVirtual: 0, // Monedero físico creado manualmente
      });
      const monederoSave = await this.monederoRepository.save(newMonedero);

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = {
        id: Number(monederoSave.id),
        numeroSerie: monederoSave.numeroSerie,
        idCliente: monederoSave.idCliente,
      };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se creó un monedero con número de serie: ${monederoSave.numeroSerie}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      // H-17: El monedero nace en saldo 0. NO se registra una
      // TransaccionesRecarga de monto 0 en el alta: no hubo recarga real y
      // ensuciaba el historial de transacciones.

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
      const querylogger = {
        numeroSerie: createMonederoDto.numeroSerie,
        idCliente: createMonederoDto.idCliente,
      };
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
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
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
    m.PublicId AS publicId,
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
    m.PublicId AS publicId,
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
          if (!tieneIdsTenant(ids)) {
            monederos = [];
            totalResult = [{ total: 0 }];
            break;
          }

          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.PublicId AS publicId,
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

      const data = monederos.map((item) =>
        this.ocultarContactoMonedero(
          {
            ...item,
            id: Number(item.id),
            saldo: Number(item.saldo),
            idPasajero: Number(item.idPasajero),
            idCliente: Number(item.idCliente),
            idPasajeroMonedero: Number(item.idPasajeroMonederos),
            idClienteMonedero: Number(item.idClienteMonedero),
            tipoMonedero: item.esVirtual === 1 ? 'virtual' : 'fisico',
            idCard: item.idCard || null,
          },
          rol,
        ),
      );

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
    m.PublicId AS publicId,
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
    m.PublicId AS publicId,
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
          if (!tieneIdsTenant(ids)) {
            monederos = [];
            totalResult = [{ total: 0 }];
            break;
          }

          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.PublicId AS publicId,
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

      const data = monederos.map((item) =>
        this.ocultarContactoMonedero(
          {
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
          },
          rol,
        ),
      );

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
      let monederos;
      const rolNumero = Number(rol);

      switch (rolNumero) {
        case 1:
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.PublicId AS publicId,
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
          const pasajeroByUser = await this.monederoRepository.query(
            `SELECT Id FROM Pasajeros WHERE IdUsuario = ?`,
            [idUser],
          );

          if (!pasajeroByUser || pasajeroByUser.length === 0) {
            monederos = [];
            break;
          }

          const idPasajero = pasajeroByUser[0].Id;

          // Traer TODOS los monederos del pasajero, tenga o no idCliente
          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.PublicId AS publicId,
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
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          if (!tieneIdsTenant(ids)) {
            monederos = [];
            break;
          }

          monederos = await this.monederoRepository.query(
            `
SELECT 
    m.Id AS id,
    m.PublicId AS publicId,
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

      const data = monederos.map((item) =>
        this.ocultarContactoMonedero(
          {
            ...item,
            id: Number(item.id),
            saldo: Number(item.saldo),
            idPasajero: Number(item.idPasajero),
            idCliente: Number(item.idCliente),
            tipoMonedero: item.esVirtual === 1 ? 'virtual' : 'fisico',
            idCard: item.idCard || null,
          },
          rol,
        ),
      );

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

  /** Caja y el pasajero dueño ven contacto. El operador no. */
  private ocultarContactoMonedero<T extends Record<string, unknown>>(
    item: T,
    rol: number,
  ): T {
    if ([1, 2, 9, 11].includes(Number(rol))) return item;
    return {
      ...item,
      correoUsuario: null,
      telefonoUsuario: null,
      customerId: null,
      customerIdNetPay: null,
      idCard: null,
    };
  }

  // ========================================
  // 🔹 OBTENER UN MONEDERO POR ID
  // ========================================
  /**
   * H-66: resuelve el identificador recibido (numérico o PublicId/ULID) al Id
   * numérico. Valida el formato también para SA (que no pasa por el guard).
   */
  private async resolveIdMonedero(id: number | string): Promise<number> {
    if (esPublicId(id)) {
      const row = await this.monederoRepository.findOne({
        where: { publicId: String(id) },
      });
      if (!row) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`,
        );
      }
      return Number(row.id);
    }
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new NotFoundException(
        `El monedero con ID: ${id} no fue encontrado.`,
      );
    }
    return n;
  }

  async findOneMonedero(
    id: number | string,
    cliente = 0,
    rol = 1,
    userId?: number,
  ) {
    try {
      // H-66: acepta id numérico o PublicId (ULID); se resuelve a Id numérico.
      const idNum = await this.resolveIdMonedero(id);
      const monedero = await this.monederoRepository.findOne({
        where: { id: idNum },
        relations: ['idPasajero2', 'idPasajero2.idUsuario2'],
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`,
        );
      }

      if (Number(rol) !== 1) {
        const permitidos = await clientesPermitidos(this.dataSource, cliente);
        if (!permitidos.includes(Number(monedero.idCliente))) {
          throw new NotFoundException(
            `El monedero con ID: ${id} no fue encontrado.`,
          );
        }
      }

      const rolNum = Number(rol);
      const esCaja = rolNum === 1 || rolNum === 2 || rolNum === 11;
      const esDueno =
        rolNum === 9 &&
        userId != null &&
        Number(monedero.idPasajero2?.idUsuario) === Number(userId);
      const verContacto = esCaja || esDueno;
      const { idPasajero2: _pasajero, ...resto } = monedero;
      const monederoResult = {
        ...resto,
        id: Number(monedero.id),
        saldo: Number(monedero.saldo),
        idPasajero: Number(monedero.idPasajero),
        idCliente: Number(monedero.idCliente),
        tipoMonedero: monedero.esVirtual === 1 ? 'virtual' : 'fisico',
        customerId: verContacto
          ? monedero.idPasajero2?.customerIdNetPay || null
          : null,
        telefonoUsuario: verContacto
          ? monedero.idPasajero2?.idUsuario2?.telefono || null
          : null,
        correoUsuario: verContacto
          ? monedero.idPasajero2?.idUsuario2?.userName || null
          : null,
        idCard: verContacto ? monedero.idCard || null : null,
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
  async findOneMonederoBySerie(
    NumeroSerie: string,
    clienteToken?: number,
    rol?: number,
    userId?: number,
  ) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: [{ numeroSerie: NumeroSerie }, { idCard: NumeroSerie }],
        relations: ['idPasajero2', 'idPasajero2.idUsuario2'],
      });
      if (!monedero) {
        throw new NotFoundException('El monedero no fue encontrado.');
      }
      if (Number(rol) !== 1 && clienteToken != null) {
        const hijos = await this.clienteHijos(Number(clienteToken));
        const ids: number[] = Array.isArray((hijos as any).ids)
          ? (hijos as any).ids
          : [];
        if (
          Number(monedero.idCliente) !== Number(clienteToken) &&
          !ids.includes(Number(monedero.idCliente))
        ) {
          throw new NotFoundException('El monedero no fue encontrado.');
        }
      }
      const rolNum = Number(rol);
      const esCaja = rolNum === 1 || rolNum === 2 || rolNum === 11;
      const esDueno =
        rolNum === 9 &&
        userId != null &&
        Number(monedero.idPasajero2?.idUsuario) === Number(userId);
      const verContacto = esCaja || esDueno;
      const { idPasajero2: _pasajero, ...resto } = monedero;
      const monederoResult = {
        ...resto,
        id: Number(monedero.id),
        saldo: Number(monedero.saldo),
        idPasajero: Number(monedero.idPasajero),
        idCliente: Number(monedero.idCliente),
        tipoMonedero: monedero.esVirtual === 1 ? 'virtual' : 'fisico',
        customerId: verContacto
          ? monedero.idPasajero2?.customerIdNetPay || null
          : null,
        telefonoUsuario: verContacto
          ? monedero.idPasajero2?.idUsuario2?.telefono || null
          : null,
        correoUsuario: verContacto
          ? monedero.idPasajero2?.idUsuario2?.userName || null
          : null,
        idCard: verContacto ? monedero.idCard || null : null,
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
    cliente = 0,
    rol = 1,
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

      if (Number(rol) !== 1) {
        const permitidos = await clientesPermitidos(this.dataSource, cliente);
        if (!permitidos.includes(Number(monedero.idCliente))) {
          throw new NotFoundException(
            `El monedero con ID: ${id} no fue encontrado.`,
          );
        }
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
        throw error;
      }
      throw new InternalServerErrorException(
        'Hubo un error al actualizar el estatus del monedero.',
      );
    }
  }

  private async assertMonederoTenant(
    monedero: { idCliente?: number | null },
    id: number,
    cliente: number,
    rol: number,
  ) {
    if (Number(rol) === 1) return;
    const permitidos = await clientesPermitidos(this.dataSource, cliente);
    if (!permitidos.includes(Number(monedero.idCliente))) {
      throw new NotFoundException(
        `El monedero con ID: ${id} no fue encontrado.`,
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
    cliente = 0,
    rol = 1,
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
      await this.assertMonederoTenant(monedero, id, cliente, rol);

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
          cliente,
          rol,
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

      await this.monederoRepository.query(
        'UPDATE Monederos SET Saldo = Saldo + ? WHERE Id = ? AND Estatus = 1',
        [Number(saldo), id],
      );

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
      });
    }
  }

  // ========================================
  // 🔹 LOCK PESIMISTA DE FILA (serializa el saldo entre instancias)
  // ========================================
  /**
   * Toma un lock `pessimistic_write` (SELECT ... FOR UPDATE) sobre la fila del
   * monedero usando el MISMO EntityManager de la transacción del llamador.
   *
   * H-08/H-09/V2-06: el `KeyedMutex` del servicio de transacciones solo serializa
   * dentro de un proceso; este lock de BD es el que serializa el cobro/recarga
   * ENTRE instancias. Debe llamarse DENTRO de la transacción y ANTES de leer o
   * mutar el saldo. El UPDATE condicional (`Saldo >= :monto`) sigue como defensa.
   *
   * Se usa queryBuilder sin joins para emitir un `FOR UPDATE` limpio solo sobre
   * la tabla Monederos (evita bloquear filas de tablas relacionadas).
   *
   * @returns la fila bloqueada, o null si el monedero no existe.
   */
  async bloquearMonederoParaActualizar(
    numeroSerie: string,
    manager: EntityManager,
  ): Promise<Monederos | null> {
    return manager
      .createQueryBuilder(Monederos, 'm')
      .setLock('pessimistic_write')
      .where('m.NumeroSerie = :numeroSerie', { numeroSerie })
      .getOne();
  }

  // ========================================
  // 🔹 DESCUENTO ATÓMICO DE SALDO (previene doble-cobro por concurrencia)
  // ========================================
  /**
   * Descuenta `monto` del saldo del monedero de forma atómica.
   *
   * Ejecuta en una sola sentencia:
   *   UPDATE Monederos SET Saldo = Saldo - :monto
   *   WHERE NumeroSerie = :serie AND Estatus = 1 AND Saldo >= :monto
   *
   * El motor toma un lock exclusivo sobre la fila durante el UPDATE, por lo que
   * dos cobros concurrentes NO pueden sobregirar el saldo: el segundo evalúa la
   * condición `Saldo >= :monto` sobre el saldo ya descontado y, si no alcanza,
   * no descuenta (affected = 0). Esto reemplaza el patrón inseguro de
   * leer-calcular-escribir (last-write-wins) que causaba el doble-cargo.
   *
   * @returns true si se descontó (había saldo suficiente); false si no alcanzó
   *          el saldo o el monedero no existe / está inactivo.
   */
  async descontarSaldoAtomico(
    numeroSerie: string,
    monto: number,
    idUser: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (monto < 0) {
      throw new BadRequestException(
        'El monto a descontar no puede ser negativo.',
      );
    }

    const qb = (manager ?? this.monederoRepository.manager)
      .createQueryBuilder()
      .update(Monederos)
      .set({ saldo: () => 'Saldo - :monto' })
      .where('NumeroSerie = :numeroSerie', { numeroSerie })
      .andWhere('Estatus = :estatus', {
        estatus: EnumEstatusMonederos.ACTIVO,
      })
      .andWhere('Saldo >= :monto')
      .setParameter('monto', monto);

    const result = await qb.execute();

    const descontado = (result.affected ?? 0) > 0;

    // Bitácora fuera de la transacción del cobro: se escribe tras el COMMIT (R2).
    const querylogger = { numeroSerie, monto };
    this.bitacoraLogger.registrar(
      [
        'Monederos',
        descontado
          ? `Descuento atómico de $${Number(monto).toFixed(2)} al monedero ${numeroSerie}.`
          : `Descuento atómico RECHAZADO (saldo insuficiente) de $${Number(monto).toFixed(2)} al monedero ${numeroSerie}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        descontado ? EstatusEnumBitcora.SUCCESS : EstatusEnumBitcora.ERROR,
        descontado ? undefined : 'Saldo insuficiente',
      ],
      manager,
    );

    return descontado;
  }

  /**
   * Suma `monto` al saldo de forma atómica (misma fila/lock que el descuento).
   * @returns true si el monedero activo existía y se incrementó.
   */
  async incrementarSaldoAtomico(
    numeroSerie: string,
    monto: number,
    idUser: number,
    manager?: EntityManager,
  ): Promise<boolean> {
    if (monto < 0) {
      throw new BadRequestException(
        'El monto a recargar no puede ser negativo.',
      );
    }

    const qb = (manager ?? this.monederoRepository.manager)
      .createQueryBuilder()
      .update(Monederos)
      .set({ saldo: () => 'Saldo + :monto' })
      .where('NumeroSerie = :numeroSerie', { numeroSerie })
      .andWhere('Estatus = :estatus', {
        estatus: EnumEstatusMonederos.ACTIVO,
      })
      .setParameter('monto', monto);

    const result = await qb.execute();
    const incrementado = (result.affected ?? 0) > 0;

    const querylogger = { numeroSerie, monto };
    this.bitacoraLogger.registrar(
      [
        'Monederos',
        incrementado
          ? `Incremento atómico de $${Number(monto).toFixed(2)} al monedero ${numeroSerie}.`
          : `Incremento atómico RECHAZADO (monedero inactivo o inexistente) de $${Number(monto).toFixed(2)} al monedero ${numeroSerie}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        incrementado ? EstatusEnumBitcora.SUCCESS : EstatusEnumBitcora.ERROR,
        incrementado ? undefined : 'Monedero no disponible',
      ],
      manager,
    );

    return incrementado;
  }

  // ========================================
  // 🔹 ACTUALIZAR MONEDERO
  // ========================================
  async updateMonedero(
    id: number,
    idUser: number,
    updateMonederoDto: UpdateMonederoDto,
    cliente = 0,
    rol = 1,
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
      await this.assertMonederoTenant(monedero, id, cliente, rol);

      // Validar que el numeroSerie no esté duplicado (solo si se está actualizando)
      if (
        updateMonederoDto.numeroSerie !== undefined &&
        updateMonederoDto.numeroSerie !== monedero.numeroSerie
      ) {
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
      if (
        updateMonederoDto.idCard !== undefined &&
        updateMonederoDto.idCard !== null
      ) {
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
        if (
          monedero.idPasajero &&
          monedero.idPasajero !== updateMonederoDto.idPasajero
        ) {
          const pasajeroAsociado = await this.pasajeroRepository.findOne({
            where: { id: monedero.idPasajero },
          });

          if (pasajeroAsociado) {
            throw new BadRequestException(
              'El monedero ya está asignado a otro pasajero.',
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
              'El pasajero ya tiene un monedero activo.',
            );
          } else {
            throw new BadRequestException(
              `El pasajero con ID ${updateMonederoDto.idPasajero} no existe en el sistema.`,
            );
          }
        }
      }

      // N-07: idCliente ya no está en el DTO. Si el body lo manda,
      // el ValidationPipe lo rechaza antes de llegar aquí.

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
      });
    }
  }

  // ========================================
  // 🔹 ELIMINADO LOGICO DE MONEDERO
  // ========================================
  async removeMonedero(id: number, idUser: number, cliente = 0, rol = 1) {
    try {
      const monedero = await this.monederoRepository.findOne({
        where: { id: id },
      });
      if (!monedero) {
        throw new NotFoundException(
          `El monedero con ID: ${id} no fue encontrado.`,
        );
      }
      await this.assertMonederoTenant(monedero, id, cliente, rol);

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
    clienteActor = 0,
    rolActor = 0,
    emailActor = '',
  ) {
    try {
      const { correo, numeroSerie } = updateMonederoExtravioDto;
      const correoNorm = String(correo || '')
        .trim()
        .toLowerCase();
      const emailJwt = String(emailActor || '')
        .trim()
        .toLowerCase();

      if (rolActor === 9) {
        if (!emailJwt || correoNorm !== emailJwt) {
          throw new ForbiddenException('No autorizado.');
        }
      }

      const pasajero =
        await this.pasajerosService.findOnePasajeroCorreo(correo);
      if (!pasajero) {
        throw new NotFoundException('El monedero no fue encontrado.');
      }

      const monedero = await this.monederoRepository.findOne({
        where: { idPasajero: pasajero.id, estatus: EstatusEnum.ACTIVO },
      });
      if (!monedero) {
        throw new NotFoundException('El monedero no fue encontrado.');
      }

      const nuevoMonedero = await this.monederoRepository.findOne({
        where: { numeroSerie: numeroSerie },
      });
      if (!nuevoMonedero) {
        throw new NotFoundException('El monedero no fue encontrado.');
      }

      if (Number(monedero.id) === Number(nuevoMonedero.id)) {
        throw new BadRequestException(
          'El monedero destino debe ser distinto al actual.',
        );
      }

      if (nuevoMonedero.idPasajero != null) {
        throw new BadRequestException(
          'El monedero destino no está disponible.',
        );
      }

      if (Number(rolActor) !== 1) {
        const permitidos = await clientesPermitidos(
          this.dataSource,
          clienteActor,
        );
        const origenOk = permitidos.includes(Number(monedero.idCliente));
        const destinoOk = permitidos.includes(Number(nuevoMonedero.idCliente));
        if (!origenOk || !destinoOk) {
          throw new NotFoundException('El monedero no fue encontrado.');
        }
      }

      const fechaDesfasada = nowDb();
      const saldoTraspaso = Number(monedero.saldo || 0);
      const idOrigen = Number(monedero.id);
      const idDestino = Number(nuevoMonedero.id);

      await this.dataSource.transaction(async (manager) => {
        const ids = [idOrigen, idDestino].sort((a, b) => a - b);
        await manager.query(
          'SELECT Id FROM Monederos WHERE Id IN (?, ?) FOR UPDATE',
          ids,
        );

        const repo = manager.getRepository(Monederos);
        const origen = await repo.findOne({ where: { id: idOrigen } });
        const destino = await repo.findOne({ where: { id: idDestino } });

        if (
          !origen ||
          Number(origen.estatus) !== EnumEstatusMonederos.ACTIVO ||
          Number(origen.idPasajero) !== Number(pasajero.id)
        ) {
          throw new NotFoundException('El monedero no fue encontrado.');
        }
        // N-03: el destino debe estar sin asignar y vacío; antes se le sumaba
        // el saldo, así que un monedero con saldo "se recargaba" con el traspaso.
        if (
          !destino ||
          destino.idPasajero != null ||
          Number(destino.saldo || 0) !== 0
        ) {
          throw new BadRequestException(
            'El monedero destino no está disponible.',
          );
        }

        const saldoLocked = Number(origen.saldo || 0);
        await repo.update(idDestino, {
          saldo: saldoLocked,
          fechaActivacion: fechaDesfasada,
          idPasajero: origen.idPasajero,
          idCliente: origen.idCliente,
          idTipoPasajero: origen.idTipoPasajero,
          estatus: EnumEstatusMonederos.ACTIVO,
        });
        const baja = await repo.update(idOrigen, {
          estatus: EnumEstatusMonederos.INACTIVO,
          idPasajero: null,
          saldo: 0,
        });
        if ((baja.affected ?? 0) === 0) {
          throw new BadRequestException(
            'No se pudo completar el traspaso del monedero.',
          );
        }
      });

      const querylogger = {
        idOrigen,
        idDestino,
        numeroSerieDestino: nuevoMonedero.numeroSerie,
      };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Extravío: baja ${monedero.numeroSerie} y alta ${nuevoMonedero.numeroSerie}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Monedero recuperado de manera correcta correctamente.',
        data: {
          id: idDestino,
          nombre: `${nuevoMonedero.numeroSerie} ${saldoTraspaso} ` || '',
        },
      };
      return result;
    } catch (error) {
      const querylogger = {
        numeroSerie: updateMonederoExtravioDto.numeroSerie,
      };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Error al reportar extravío del monedero ${updateMonederoExtravioDto.numeroSerie}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.ERROR,
        error?.message,
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
          const numeroPasajesCoincide =
            qrExistente.numeroPasajes === numeroPasajes;

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
        } catch (_comparisonError) {
          // Si hay error al comparar, desactivar el anterior y generar uno nuevo
          try {
            await this.qrCodesRepository.update(qrExistente.id, {
              estatus: EstatusEnum.INACTIVO,
            });
          } catch (_updateError) {
            // Ignorar fallo al desactivar QR anterior
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

      throw new InternalServerErrorException(
        'Hubo un error al generar el código QR del monedero.',
      );
    }
  }
}
