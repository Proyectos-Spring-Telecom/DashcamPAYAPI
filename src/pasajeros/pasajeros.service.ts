import { nowDb } from 'src/common/clock';
import {
  clienteHijosDesdeSp,
  esPublicId,
  generarPublicId,
  tieneIdsTenant,
} from 'src/common/tenant/ownership-resolvers';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreatePasajeroDto } from './dto/create-pasajero.dto';
import { UpdatePasajeroDto } from './dto/update-pasajero.dto';
import { UpdatePasajeroEstatusDto } from './dto/update-pasajeros-estatus.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Pasajeros } from 'src/entities/Pasajeros';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { Clientes } from 'src/entities/Clientes';
import { CreatePasajeroAfiliacionDto } from './dto/create-pasajero-afiliacion.dto';
import * as bcrypt from 'bcrypt';
import { Usuarios } from 'src/entities/Usuarios';
import { RefreshSessions } from 'src/entities/RefreshSessions';
import { UsuariosPermisos } from 'src/entities/UsuariosPermisos';
import {
  EnumModulos,
  EnumSolicitudPasajero,
  EstatusEnum,
} from 'src/common/estatus.enum';
import { Monederos } from 'src/entities/Monederos';
import { UpdatePasajeroEstadoSolicitudDto } from './dto/update-pasajeros-estado-solicitud.dto';
import { UpdatePasajeroCustomerIdDto } from './dto/update-pasajero-customer-id.dto';
import { S3Service } from 'src/s3/s3.service';
import { NetpayService } from 'src/netpay/netpay.service';
import { randomBytes } from 'crypto';

@Injectable()
export class PasajerosService {
  constructor(
    @InjectRepository(Pasajeros)
    private readonly pasajeroRepository: Repository<Pasajeros>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(UsuariosPermisos)
    private permisosRepository: Repository<UsuariosPermisos>,
    @InjectRepository(Monederos)
    private monederosRepository: Repository<Monederos>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly s3Service: S3Service,
    private readonly netpayService: NetpayService,
  ) {}

  // ========================================
  // 🔹 FUNCIÓN PRIVADA PARA GENERAR NÚMERO DE SERIE ÚNICO
  // ========================================
  private async generarNumeroSerieUnico(): Promise<string> {
    let numeroSerie: string;
    let existe: boolean;
    let intentos = 0;
    const maxIntentos = 100;

    do {
      // H-65: formato MON-<timestamp>-<aleatorio>. El sufijo aleatorio ahora usa
      // 8 bytes de crypto.randomBytes (64 bits, 16 hex) en vez de un entero de
      // ~13 bits, para evitar colisiones/adivinación. Columna Monederos.NumeroSerie
      // VARCHAR(100): "MON-" + 13 dígitos timestamp + "-" + 16 hex = ~34 chars, dentro del límite.
      const timestamp = Date.now().toString(); // timestamp completo (ms)
      const numeroAleatorio = randomBytes(8).toString('hex'); // 64 bits
      numeroSerie = `MON-${timestamp}-${numeroAleatorio}`;

      // Verificar si ya existe
      const monederoExistente = await this.monederosRepository.findOne({
        where: { numeroSerie },
      });
      existe = !!monederoExistente;
      intentos++;

      if (intentos >= maxIntentos) {
        throw new InternalServerErrorException(
          'No se pudo generar un número de serie único después de múltiples intentos.',
        );
      }
    } while (existe);

    return numeroSerie;
  }

  // ========================================
  // 🔹  CREAMOS EL PASAJERO DE MANERA INTERNA
  // ========================================
  async createPasajeros(
    createPasajeroDto: CreatePasajeroDto,
    idUser: number,
    cliente: number,
    documentacionFile?: Express.Multer.File,
    rol = 1,
  ): Promise<ApiCrudResponse> {
    try {
      // Subir imagen/documento a S3 si se proporciona
      let documentacionUrl: string | null = null;
      if (documentacionFile) {
        const uploadResult = await this.s3Service.uploadFile(
          documentacionFile,
          'Pasajeros',
          idUser,
          EnumModulos.PASAJEROS,
          Number(cliente) || 0,
        );
        documentacionUrl = uploadResult.url;
      }
      const pasajero = await this.pasajeroRepository.findOne({
        where: {
          correo: createPasajeroDto.correo,
        },
      });
      if (pasajero) {
        throw new BadRequestException(
          `El pasajero con el correo electrónico ${createPasajeroDto.correo} ya está registrado en el sistema.`,
        );
      }
      const existUsuario = await this.usuariosRepository.findOne({
        //Buscamos si existe usuario
        where: { userName: createPasajeroDto.correo },
      });
      if (existUsuario) {
        throw new BadRequestException(
          `El usuario con el correo electrónico ${createPasajeroDto.correo} ya está registrado en el sistema.`,
        );
      }

      let monederos: Monederos | null = null;
      let numeroSerieMonedero: string;

      // Si no se proporciona numeroSerieMonedero, generar uno aleatorio único
      if (!createPasajeroDto.numeroSerieMonedero) {
        // Generar número de serie aleatorio único
        numeroSerieMonedero = await this.generarNumeroSerieUnico();

        // Crear nuevo monedero con el número de serie generado
        const fechaDesfasada = nowDb();

        const nuevoMonedero = this.monederosRepository.create({
          publicId: generarPublicId(), // H-66: id opaco en el alta
          numeroSerie: numeroSerieMonedero,
          saldo: 0,
          fechaActivacion: fechaDesfasada,
          estatus: EstatusEnum.INACTIVO, // Se activará cuando se asigne al pasajero
          idCliente: cliente,
          idTipoPasajero: createPasajeroDto.idTipoPasajero || 1, // Valor por defecto si no se proporciona
          esVirtual: 1, // Monedero virtual creado automáticamente
        });

        monederos = await this.monederosRepository.save(nuevoMonedero);

        // Registro en la bitácora SUCCESS
        await this.bitacoraLogger.logToBitacora(
          'Monederos',
          `Se creó un monedero automático con número de serie: ${numeroSerieMonedero}.`,
          'CREATE',
          { numeroSerie: numeroSerieMonedero, idCliente: cliente },
          idUser,
          EnumModulos.MONEDEROS,
          EstatusEnumBitcora.SUCCESS,
        );
      } else {
        // Si se proporciona, buscar el monedero existente
        numeroSerieMonedero = createPasajeroDto.numeroSerieMonedero;
        monederos = await this.monederosRepository.findOne({
          where: {
            numeroSerie: numeroSerieMonedero,
          },
        });

        if (!monederos) {
          throw new BadRequestException(
            `No se encontró el monedero con número de serie ${numeroSerieMonedero}.`,
          );
        }

        if (Number(rol) !== 1) {
          const { ids } = await this.clienteHijos(cliente);
          if (
            !tieneIdsTenant(ids) ||
            !ids.includes(Number(monederos.idCliente))
          ) {
            throw new NotFoundException(
              `No se encontró el monedero con número de serie ${numeroSerieMonedero}.`,
            );
          }
        }

        // Validar que el monedero no esté asignado a otro pasajero
        if (monederos.idPasajero) {
          // Verificar que el pasajero asociado realmente existe
          const pasajeroAsociado = await this.pasajeroRepository.findOne({
            where: { id: monederos.idPasajero },
          });

          if (pasajeroAsociado) {
            throw new BadRequestException(
              'El monedero ya está asignado a otro pasajero.',
            );
          } else {
            throw new BadRequestException(
              `El monedero con número de serie ${numeroSerieMonedero} está asociado a un pasajero que no existe en el sistema.`,
            );
          }
        }
      }

      const hashedPassword = await bcrypt.hash(
        createPasajeroDto.passwordHash,
        10,
      ); //encriptamos la contraseña
      createPasajeroDto.passwordHash = hashedPassword;

      //Creamos el usuario
      const newUser = await this.usuariosRepository.create({
        userName: createPasajeroDto.correo,
        passwordHash: createPasajeroDto.passwordHash,
        emailConfirmado: EstatusEnum.ACTIVO,
        nombre: createPasajeroDto.nombre,
        apellidoPaterno: createPasajeroDto.apellidoPaterno,
        apellidoMaterno: createPasajeroDto.apellidoMaterno,
        telefono: createPasajeroDto.telefono,
        fotoPerfil:
          documentacionUrl ||
          'https://dashcamsys.s3.us-east-2.amazonaws.com/imagenes/2c369ac0-c489-4384-8d35-3ba482f7ccaa.jpeg',
        estatus: EstatusEnum.ACTIVO,
        idRol: 9,
        idCliente: cliente,
      });
      const userSave = await this.usuariosRepository.save(newUser); //creamos el usuario

      //Le añadimos los permisos correspondientes
      const permisosIds = [122];
      if (permisosIds.length > 0) {
        const usuariosPermisos = permisosIds.map((permisoId) =>
          this.permisosRepository.create({
            idUsuario: userSave.id,
            idPermiso: permisoId,
          }),
        );

        //guardamos los permisos
        await this.permisosRepository.save(usuariosPermisos);
      }

      //Creamos el body para crear el pasajero
      const newPasajero = await this.pasajeroRepository.create({
        publicId: generarPublicId(), // H-66: id opaco en el alta
        nombre: createPasajeroDto.nombre,
        apellidoPaterno: createPasajeroDto.apellidoPaterno,
        apellidoMaterno: createPasajeroDto.apellidoMaterno,
        fechaNacimiento: createPasajeroDto.fechaNacimiento,
        telefono: createPasajeroDto.telefono,
        correo: createPasajeroDto.correo,
        estatus: EstatusEnum.ACTIVO,
        estadoSolicitud: createPasajeroDto.estadoSolicitud,
        documentacion: documentacionUrl || null,
        curp: createPasajeroDto.curp,
        idUsuario: userSave.id,
      });
      const pasajeroSave = await this.pasajeroRepository.save(newPasajero);

      if (createPasajeroDto.correo) {
        try {
          // Combinar apellidos para lastName
          const lastName = createPasajeroDto.apellidoMaterno
            ? `${createPasajeroDto.apellidoPaterno} ${createPasajeroDto.apellidoMaterno}`
            : createPasajeroDto.apellidoPaterno;

          // H-65: identifier para NetPay con 8 bytes de crypto.randomBytes
          // (64 bits, 16 hex) en vez de un entero de 10 dígitos (~33 bits).
          const randomIdentifier = randomBytes(8).toString('hex');

          const customerResponse = await this.netpayService.createCustomer({
            firstName: createPasajeroDto.nombre,
            lastName: lastName,
            email: createPasajeroDto.correo,
            phone: createPasajeroDto.telefono || undefined,
            identifier: randomIdentifier,
          });

          // Si se creó exitosamente, actualizar el pasajero con el customerId
          // El customerId viene en el campo 'id' de la respuesta de NetPay
          const customerId =
            customerResponse?.id || customerResponse?.customerId;

          if (customerId) {
            const updateData = {
              customerIdNetPay: customerId,
              idUsuario: userSave.id, // Asegurar que idUsuario esté actualizado
            };

            const updateResult = await this.pasajeroRepository.update(
              pasajeroSave.id,
              updateData,
            );

            pasajeroSave.customerIdNetPay = customerId;
            pasajeroSave.idUsuario = userSave.id;

            // Registro en la bitácora SUCCESS
            await this.bitacoraLogger.logToBitacora(
              'Pasajeros',
              `Se creó el customer en NetPay para el pasajero con ID: ${pasajeroSave.id}, customerId: ${customerId}, idUsuario: ${userSave.id}`,
              'CREATE',
              {
                pasajeroId: pasajeroSave.id,
                customerId,
                idUsuario: userSave.id,
                updateResult,
              },
              idUser,
              EnumModulos.PASAJEROS,
              EstatusEnumBitcora.SUCCESS,
            );
          } else {
            await this.bitacoraLogger.logToBitacora(
              'Pasajeros',
              `Se creó el customer en NetPay pero no se obtuvo el customerId.`,
              'CREATE',
              { pasajeroId: pasajeroSave.id },
              idUser,
              EnumModulos.PASAJEROS,
              EstatusEnumBitcora.ERROR,
              'No se obtuvo customerId de la respuesta de NetPay',
            );
          }
        } catch (netpayError) {
          // Si falla la creación en NetPay, no fallar la creación del pasajero
          // Solo registrar el error en la bitácora
          await this.bitacoraLogger.logToBitacora(
            'Pasajeros',
            `Error al crear customer en NetPay para el pasajero con ID: ${pasajeroSave.id}. El pasajero fue creado correctamente.`,
            'CREATE',
            { pasajeroId: pasajeroSave.id, error: netpayError.message },
            idUser,
            EnumModulos.PASAJEROS,
            EstatusEnumBitcora.ERROR,
            netpayError.message,
          );
          // No lanzar el error, continuar con el flujo normal
        }
      }

      //afiliamos el monedero al pasajero y cambiamos estatus activo
      function pad(n: number) {
        return n < 10 ? '0' + n : n;
      }

      const fechaDesfasada = nowDb();

      const _fechaActual = `${fechaDesfasada.getUTCFullYear()}-${pad(fechaDesfasada.getUTCMonth() + 1)}-${pad(fechaDesfasada.getUTCDate())} ${pad(fechaDesfasada.getUTCHours())}:${pad(fechaDesfasada.getUTCMinutes())}:${pad(fechaDesfasada.getUTCSeconds())}`;

      // Validar que monederos existe
      if (!monederos) {
        throw new InternalServerErrorException(
          'Error: El monedero no fue creado o encontrado correctamente.',
        );
      }

      // Validar que el pasajero no tenga ya otro monedero activo
      const monederoExistente = await this.monederosRepository.findOne({
        where: {
          idPasajero: pasajeroSave.id,
          estatus: EstatusEnum.ACTIVO,
        },
      });

      if (monederoExistente && monederoExistente.id !== monederos.id) {
        throw new BadRequestException(
          'El pasajero ya tiene un monedero activo.',
        );
      }

      await this.monederosRepository.update(monederos.id, {
        fechaActivacion: fechaDesfasada,
        estatus: EstatusEnum.ACTIVO,
        idPasajero: pasajeroSave.id,
        idTipoPasajero:
          createPasajeroDto.idTipoPasajero || monederos.idTipoPasajero,
      });

      // --- Registro en la bitácora --- SUCCESS
      const queryloggerUpdate = {
        idPasajero: pasajeroSave.id,
        fechaActivacion: fechaDesfasada,
        estatus: EstatusEnum.ACTIVO,
      };
      await this.bitacoraLogger.logToBitacora(
        'Monederos',
        `Se actualizó el monedero con ID: ${monederos.id}.`,
        'UPDATE',
        queryloggerUpdate,
        idUser,
        EnumModulos.MONEDEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //-----Registro en la bitacora----- SUCCESS
      const { passwordHash: _pwdPasajero, ...pasajeroSinHash } =
        createPasajeroDto;
      const querylogger = { ...pasajeroSinHash };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Se ha creado un pasajero con el nombre: ${createPasajeroDto.nombre}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El pasajero ha sido creado correctamente.',
        data: {
          id: Number(pasajeroSave.id),
          nombre:
            `${pasajeroSave.nombre} ${pasajeroSave.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const { passwordHash: _pwdPasajeroErr, ...pasajeroSinHashErr } =
        createPasajeroDto;
      const querylogger = { ...pasajeroSinHashErr };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Se ha creado un pasajero con el nombre: ${createPasajeroDto.nombre}.`,
        'CREATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de creación del pasajero.',
      );
    }
  }

  // ========================================
  // 🔹 CREAMOS EL PASAJERO DE MANERA AFILIACION EXTERNA
  // ========================================
  async createPasajerosAfiliacion(
    createPasajeroAfiliacionDto: CreatePasajeroAfiliacionDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const pasajero = await this.pasajeroRepository.findOne({
        where: {
          correo: createPasajeroAfiliacionDto.correo,
        },
      });
      if (pasajero) {
        throw new BadRequestException(
          `El pasajero con el correo electrónico ${createPasajeroAfiliacionDto.correo} ya se encuentra registrado.`,
        );
      }
      const newPasajero = await this.pasajeroRepository.create({
        ...createPasajeroAfiliacionDto,
        publicId: generarPublicId(), // H-66: id opaco en el alta
        idUsuario: idUser, // ✅ Agregar el idUsuario
      });
      const pasajeroSave = await this.pasajeroRepository.save(newPasajero);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { createPasajeroAfiliacionDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Se ha creado un pasajero con el nombre: ${createPasajeroAfiliacionDto.nombre}.`,
        'CREATE',
        querylogger,
        idUser,
        21,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El pasajero ha sido creado correctamente.',
        data: {
          id: Number(pasajeroSave.id),
          nombre:
            `${pasajeroSave.nombre} ${pasajeroSave.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { createPasajeroAfiliacionDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Se ha creado un pasajero con el nombre: ${createPasajeroAfiliacionDto.nombre}.`,
        'CREATE',
        querylogger,
        idUser,
        21,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de creación del pasajero.',
      );
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  // ========================================
  // 🔹 OBTENEMOS EL PAGINADO DE PASAJEROS
  // ========================================
  async findAllPasajeros(
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      let pasajeros;
      let totalResult;
      const offset = (page - 1) * limit;
      switch (rol) {
        case 1:
          pasajeros = await this.pasajeroRepository.query(
            `
SELECT DISTINCT
    p.Id AS id,
    p.PublicId AS publicId,
    p.Nombre AS nombre,
    p.ApellidoPaterno AS apellidoPaterno,
    p.ApellidoMaterno AS apellidoMaterno,
    p.FechaNacimiento AS fechaNacimiento,
    p.Telefono AS telefono,
    p.Correo AS correo,
    p.FechaCreacion AS fechaCreacion,
    p.FechaActualizacion AS fechaActualizacion,
    p.Estatus AS estatus,
    p.EstadoSolicitud AS estadoSolicitud,
    p.Documentacion AS documentacion,
    p.Curp AS curp,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Nombre AS nombreCliente,
    m.Id AS idMonedero,
    m.NumeroSerie AS numeroSerie,
    ct.Id AS idTipoPasajero,
    ct.Nombre AS nombreCatPasajero,
    ctd.Nombre AS nombreTipoDescuento

FROM Pasajeros p
INNER JOIN Monederos m 
    ON p.Id = m.IdPasajero
INNER JOIN Clientes c 
    ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct
    ON m.IdTipoPasajero = ct.Id
LEFT JOIN CatTipoDescuento ctd
	ON ct.IdCatTipoDescuento = ctd.Id

ORDER BY p.Id DESC
  LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.pasajeroRepository.query(
            `
   SELECT COUNT(*) AS total
FROM Pasajeros p
INNER JOIN Monederos m 
    ON p.Id = m.IdPasajero
INNER JOIN Clientes c 
    ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct
    ON m.IdTipoPasajero = ct.Id
		
  `,
          );
          break;

        case 3:
        default:
          //Resto de usuarios
          const { ids, placeholders } = await this.clienteHijos(cliente);
          pasajeros = await this.pasajeroRepository.query(
            `
SELECT DISTINCT
    p.Id AS id,
    p.PublicId AS publicId,
    p.Nombre AS nombre,
    p.ApellidoPaterno AS apellidoPaterno,
    p.ApellidoMaterno AS apellidoMaterno,
    p.FechaNacimiento AS fechaNacimiento,
    p.Telefono AS telefono,
    p.Correo AS correo,
    p.FechaCreacion AS fechaCreacion,
    p.FechaActualizacion AS fechaActualizacion,
    p.Estatus AS estatus,
    p.EstadoSolicitud AS estadoSolicitud,
    p.Documentacion AS documentacion,
    p.Curp AS curp,
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Nombre AS nombreCliente,
    m.Id AS idMonedero,
    m.NumeroSerie AS numeroSerie,
    ct.Id AS idTipoPasajero,
    ct.Nombre AS nombreCatPasajero,
    ctd.Nombre AS nombreTipoDescuento

FROM Pasajeros p
INNER JOIN Monederos m 
    ON p.Id = m.IdPasajero
INNER JOIN Clientes c 
    ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct
    ON m.IdTipoPasajero = ct.Id
LEFT JOIN CatTipoDescuento ctd
	ON ct.IdCatTipoDescuento = ctd.Id

    
WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY p.Id DESC
  LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.pasajeroRepository.query(
            `
   SELECT COUNT(*) AS total
FROM Pasajeros p
INNER JOIN Monederos m 
    ON p.Id = m.IdPasajero
INNER JOIN Clientes c 
    ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct
    ON m.IdTipoPasajero = ct.Id
LEFT JOIN CatTipoDescuento ctd
	ON ct.IdCatTipoDescuento = ctd.Id
	WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = pasajeros.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
        idMonedero: Number(item.idMonedero),
        idTipoPasajero: Number(item.idTipoPasajero),
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
      throw new InternalServerErrorException(
        'Se produjo un error al intentar obtener el paginado de pasajeros.',
      );
    }
  }
  // ========================================
  // 🔹 OBTENEMOS EL LISTADO DE PASAJEROS
  // ========================================
  async findAllListPasajeros(
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let pasajeros;
      switch (rol) {
        case 1:
          //Resto de usuarios
          pasajeros = await this.pasajeroRepository.query(
            `
SELECT 
    p.Id AS id,
    p.PublicId AS publicId,
    p.Nombre AS nombre,
    p.ApellidoPaterno AS apellidoPaterno,
    p.ApellidoMaterno AS apellidoMaterno,
    p.FechaNacimiento AS fechaNacimiento,
    p.Telefono AS telefono,
    p.Correo AS correo,
    p.FechaCreacion AS fechaCreacion,
    p.FechaActualizacion AS fechaActualizacion,
    p.Estatus AS estatus,
    p.EstadoSolicitud AS estadoSolicitud,
    p.Documentacion AS documentacion,
    p.Curp AS curp,
    m.Id AS idMonedero,
    m.NumeroSerie AS numeroSerie,
    ct.Id AS idTipoPasajero,
    ct.Nombre AS nombreCatPasajero,
    ctd.Nombre AS nombreTipoDescuento

FROM Pasajeros p
INNER JOIN Monederos m 
    ON p.Id = m.IdPasajero
INNER JOIN Clientes c 
    ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct
    ON m.IdTipoPasajero = ct.Id
LEFT JOIN CatTipoDescuento ctd
	ON ct.IdCatTipoDescuento = ctd.Id
WHERE m.Id IS NOT NULL
ORDER BY p.Id DESC;

        `,
          );
          break;

        case 3:
        default:
          //Resto de usuarios
          const { ids, placeholders } = await this.clienteHijos(cliente);
          pasajeros = await this.pasajeroRepository.query(
            `
SELECT 
    p.Id AS id,
    p.PublicId AS publicId,
    p.Nombre AS nombre,
    p.ApellidoPaterno AS apellidoPaterno,
    p.ApellidoMaterno AS apellidoMaterno,
    p.FechaNacimiento AS fechaNacimiento,
    p.Telefono AS telefono,
    p.Correo AS correo,
    p.FechaCreacion AS fechaCreacion,
    p.FechaActualizacion AS fechaActualizacion,
    p.Estatus AS estatus,
    p.EstadoSolicitud AS estadoSolicitud,
    p.Documentacion AS documentacion,
    p.Curp AS curp,
    m.Id AS idMonedero,
    m.NumeroSerie AS numeroSerie,
    ct.Id AS idTipoPasajero,
    ct.Nombre AS nombreCatPasajero,
    ctd.Nombre AS nombreTipoDescuento
    
FROM Pasajeros p
INNER JOIN Monederos m 
    ON p.Id = m.IdPasajero
INNER JOIN Clientes c 
    ON m.IdCliente = c.Id
LEFT JOIN CatTiposPasajeros ct
    ON m.IdTipoPasajero = ct.Id
LEFT JOIN CatTipoDescuento ctd
	ON ct.IdCatTipoDescuento = ctd.Id
WHERE m.Id IS NOT NULL
AND c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY p.Id DESC;
        `,
            [...ids],
          );
          break;
      }

      // 🔥 Forzamos ids a number y agregamos nombreCompleto
      const data = pasajeros.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
        idMonedero: Number(item.idMonedero),
        idTipoPasajero: Number(item.idTipoPasajero),
      }));
      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Se produjo un error al intentar obtener el listado de pasajeros.',
      );
    }
  }
  // ========================================
  // 🔹 OBTENEMOS PASAJEROS POR ID
  // ========================================
  /**
   * H-66: resuelve el identificador recibido (numérico o PublicId/ULID) al Id
   * numérico. Valida el formato también para SA (que no pasa por el guard).
   */
  private async resolveIdPasajero(id: number | string): Promise<number> {
    if (esPublicId(id)) {
      const row = await this.pasajeroRepository.findOne({
        where: { publicId: String(id) },
      });
      if (!row) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }
      return Number(row.id);
    }
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new NotFoundException(`No se encontró un pasajero con ID: ${id}.`);
    }
    return n;
  }

  async findOnePasajero(id: number | string, cliente = 0, rol = 1) {
    try {
      // H-66: acepta id numérico o PublicId (ULID); se resuelve a Id numérico.
      const idNum = await this.resolveIdPasajero(id);
      // Ambos caminos devuelven la entidad (camelCase): antes el de tenant
      // hacía SELECT p.* y el formulario de edición recibía PascalCase vacío.
      let idsTenant: number[] | null = null;
      if (Number(rol) !== 1) {
        const { ids } = await this.clienteHijos(cliente);
        if (!tieneIdsTenant(ids)) {
          throw new NotFoundException(
            `No se encontró un pasajero con ID: ${id}.`,
          );
        }
        idsTenant = ids;
      }

      const pasajeroExistente = await this.pasajeroRepository.findOne({
        where: { id: idNum },
      });
      if (!pasajeroExistente) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }

      const monederos = await this.monederosRepository.find({
        where: {
          idPasajero: idNum,
          ...(idsTenant ? { idCliente: In(idsTenant) } : {}),
        },
        order: { id: 'ASC' },
        take: 1,
      });
      if (idsTenant && !monederos.length) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }
      const monedero = monederos[0];
      return {
        data: {
          ...pasajeroExistente,
          numeroSerieMonedero: monedero?.numeroSerie ?? null,
          idTipoPasajero: monedero?.idTipoPasajero ?? null,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Se produjo un error al intentar obtener los datos del pasajero.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENEMOS EL PASAJERO POR CORREO
  // ========================================
  async findOnePasajeroCorreo(correo: string) {
    try {
      const pasajeroExistente = await this.pasajeroRepository.findOne({
        where: { correo: correo },
      });
      if (!pasajeroExistente) {
        throw new NotFoundException('Recurso no encontrado');
      }
      return pasajeroExistente;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Se produjo un error al intentar obtener los datos del pasajero.',
      );
    }
  }

  // ========================================
  // 🔹 OBTENEMOS EL MAIN PARA PERFIL PASAJERO
  // ========================================
  async obtenerMainPasajero(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    anio?: number,
  ) {
    try {
      const pasajero = await this.pasajeroRepository.query(
        `
SELECT 
    p.Id AS idPasajero,
    u.Id AS idUsuario,
    u.UserName AS CorreoUsuario,
    CONCAT(p.Nombre, ' ', p.ApellidoPaterno, ' ', IFNULL(p.ApellidoMaterno, '')) AS NombreCompleto,
    p.CustomerIdNetPay AS customerIdNetPay,
    GROUP_CONCAT(DISTINCT m.NumeroSerie ORDER BY m.NumeroSerie SEPARATOR ', ') AS Monederos,
    SUM(m.Saldo) AS SaldoTotal,
    GROUP_CONCAT(DISTINCT ctp.Nombre ORDER BY ctp.Nombre SEPARATOR ', ') AS NombreTipoPasajero,

    -- Última recarga (monto)
    (
        SELECT tr.Monto
        FROM TransaccionesRecarga tr
        INNER JOIN Monederos m2 ON tr.NumeroSerieMonedero = m2.NumeroSerie
        WHERE m2.IdPasajero = p.Id
          AND m2.Estatus = 1
        ORDER BY tr.FechaHoraFinal DESC
        LIMIT 1
    ) AS UltimaRecarga,

    -- Fecha de la última recarga
    (
        SELECT tr.FechaHoraFinal
        FROM TransaccionesRecarga tr
        INNER JOIN Monederos m2 ON tr.NumeroSerieMonedero = m2.NumeroSerie
        WHERE m2.IdPasajero = p.Id
          AND m2.Estatus = 1
        ORDER BY tr.FechaHoraFinal DESC
        LIMIT 1
    ) AS FechaUltimaRecarga,

    -- Total de débitos del último mes
    (
        SELECT COALESCE(SUM(td.Monto), 0)
        FROM (
            SELECT td.Monto, td.FHRegistro, m3.IdPasajero, m3.Estatus
            FROM TransaccionesDebito td
            INNER JOIN Monederos m3 ON td.NumeroSerieMonedero = m3.NumeroSerie
            WHERE m3.IdPasajero = p.Id
              AND m3.Estatus = 1
              AND DATE(td.FHRegistro) >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
            
            UNION ALL
            
            SELECT htd.Monto, htd.FHRegistro, m3b.IdPasajero, m3b.Estatus
            FROM HistoricoTransaccionesDebito htd
            INNER JOIN Monederos m3b ON htd.NumeroSerieMonedero = m3b.NumeroSerie
            WHERE m3b.IdPasajero = p.Id
              AND m3b.Estatus = 1
              AND DATE(htd.FHRegistro) >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
        ) AS td
    ) AS TotalDebitosUltimoMes,

    -- Último débito (monto)
    (
        SELECT td2.Monto
        FROM TransaccionesDebito td2
        INNER JOIN Monederos m4 ON td2.NumeroSerieMonedero = m4.NumeroSerie
        WHERE m4.IdPasajero = p.Id
          AND m4.Estatus = 1
        ORDER BY td2.FechaHoraFinal DESC
        LIMIT 1
    ) AS UltimoDebito,

    -- Fecha del último débito
    (
        SELECT td3.FechaHoraFinal
        FROM TransaccionesDebito td3
        INNER JOIN Monederos m5 ON td3.NumeroSerieMonedero = m5.NumeroSerie
        WHERE m5.IdPasajero = p.Id
          AND m5.Estatus = 1
        ORDER BY td3.FechaHoraFinal DESC
        LIMIT 1
    ) AS FechaUltimoDebito

FROM Pasajeros p
INNER JOIN Usuarios u ON u.UserName = p.Correo
LEFT JOIN Monederos m ON p.Id = m.IdPasajero
LEFT JOIN CatTiposPasajeros ctp ON m.IdTipoPasajero = ctp.Id
WHERE u.Id = ?
  AND m.Estatus = 1
GROUP BY p.Id, u.Id, u.UserName, p.Nombre, p.ApellidoPaterno, p.ApellidoMaterno;
        `,
        [id],
      );

      if (!pasajero || pasajero.length === 0) {
        throw new NotFoundException('No se encontró información del pasajero.');
      }

      const item = pasajero[0];
      const idPasajero = Number(item.idPasajero);

      // Usar el año proporcionado o el año actual por defecto
      const anioFiltro = anio || new Date().getFullYear();

      // Consulta para obtener gastos (HistoricoTransaccionesDebito) agrupados por mes del año especificado
      const gastosPorMes = await this.pasajeroRepository.query(
        `
        SELECT 
          MONTH(htd.FHRegistro) AS mes,
          YEAR(htd.FHRegistro) AS anio,
          COALESCE(SUM(htd.Monto), 0) AS totalGastado
        FROM HistoricoTransaccionesDebito htd
        INNER JOIN Monederos m ON htd.NumeroSerieMonedero = m.NumeroSerie
        WHERE m.IdPasajero = ?
          AND m.Estatus = 1
          AND YEAR(htd.FHRegistro) = ?
        GROUP BY MONTH(htd.FHRegistro), YEAR(htd.FHRegistro)
        ORDER BY anio, mes
        `,
        [idPasajero, anioFiltro],
      );

      // Consulta para obtener recargas (HistoricoTransaccionesRecarga) agrupadas por mes del año especificado
      const recargasPorMes = await this.pasajeroRepository.query(
        `
        SELECT 
          MONTH(htr.FHRegistro) AS mes,
          YEAR(htr.FHRegistro) AS anio,
          COALESCE(SUM(htr.Monto), 0) AS totalRecargado
        FROM HistoricoTransaccionesRecarga htr
        INNER JOIN Monederos m ON htr.NumeroSerieMonedero = m.NumeroSerie
        WHERE m.IdPasajero = ?
          AND m.Estatus = 1
          AND YEAR(htr.FHRegistro) = ?
        GROUP BY MONTH(htr.FHRegistro), YEAR(htr.FHRegistro)
        ORDER BY anio, mes
        `,
        [idPasajero, anioFiltro],
      );

      // Inicializar todos los meses del año con 0
      const anioActual = anioFiltro;
      const gastosYRecargasMap = new Map();
      const gastosSoloMap = new Map();

      for (let mes = 1; mes <= 12; mes++) {
        gastosYRecargasMap.set(mes, {
          mes,
          anio: anioActual,
          totalGastado: 0,
          totalRecargado: 0,
        });
        gastosSoloMap.set(mes, { mes, anio: anioActual, total: 0 });
      }

      // Procesar gastos
      gastosPorMes.forEach((item) => {
        const mes = Number(item.mes);
        const total = Number(item.totalGastado) || 0;
        if (gastosYRecargasMap.has(mes)) {
          gastosYRecargasMap.get(mes).totalGastado = Number(total.toFixed(2));
        }
        if (gastosSoloMap.has(mes)) {
          gastosSoloMap.set(mes, {
            mes,
            anio: Number(item.anio),
            total: Number(total.toFixed(2)),
          });
        }
      });

      // Procesar recargas
      recargasPorMes.forEach((item) => {
        const mes = Number(item.mes);
        const total = Number(item.totalRecargado) || 0;
        if (gastosYRecargasMap.has(mes)) {
          gastosYRecargasMap.get(mes).totalRecargado = Number(total.toFixed(2));
        }
      });

      // Convertir maps a arrays y formatear
      const gastosYRecargasPorMes = Array.from(gastosYRecargasMap.values());

      const gastosPorMesCompleto = Array.from(gastosSoloMap.values());

      // Conteo de QRCodes del día de hoy
      const conteoQRCodesHoy = await this.pasajeroRepository.query(
        `
        SELECT COUNT(*) AS totalQRCodesHoy
        FROM QRCodes qr
        WHERE qr.IdPasajero = ?
          AND qr.Estatus = 0
          AND DATE(qr.FHRegistro) = CURDATE()
        `,
        [idPasajero],
      );

      const totalQRCodesHoy =
        conteoQRCodesHoy && conteoQRCodesHoy.length > 0
          ? Number(conteoQRCodesHoy[0].totalQRCodesHoy)
          : 0;

      const data = {
        ...item,
        idPasajero: idPasajero,
        idUsuario: Number(item.idUsuario),
        gastosYRecargasPorMes: gastosYRecargasPorMes,
        gastosPorMes: gastosPorMesCompleto,
        totalQRCodesHoy: totalQRCodesHoy,
      };

      return {
        data: data,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de obtener main del pasajero.',
      );
    }
  }

  private async assertPasajeroEnTenant(
    id: number,
    cliente: number,
    rol: number,
  ) {
    if (Number(rol) === 1) return;
    const { ids, placeholders } = await this.clienteHijos(cliente);
    if (!tieneIdsTenant(ids)) {
      throw new NotFoundException(`No se encontró un pasajero con ID: ${id}.`);
    }
    const rows = await this.pasajeroRepository.query(
      `
SELECT p.Id
FROM Pasajeros p
INNER JOIN Monederos m ON m.IdPasajero = p.Id
WHERE p.Id = ? AND m.IdCliente IN (${placeholders})
LIMIT 1
      `,
      [id, ...ids],
    );
    if (!rows?.length) {
      throw new NotFoundException(`No se encontró un pasajero con ID: ${id}.`);
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR ESTATUS DEL PASAJERO
  // ========================================
  async updatePasajeroEstatus(
    id: number,
    updatePasajeroEstatusDto: UpdatePasajeroEstatusDto,
    idUser: number,
    cliente = 0,
    rol = 1,
  ) {
    try {
      await this.assertPasajeroEnTenant(id, cliente, rol);
      const pasajero = await this.pasajeroRepository.findOne({
        where: { id: id },
      });
      if (!pasajero) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }
      const { estatus } = updatePasajeroEstatusDto;
      // Desactivar al pasajero desactiva también su usuario y corta sus
      // sesiones; los cobros se rechazan en el débito (Pasajeros.Estatus).
      // Los monederos no se tocan: Estatus 0 en Monederos significa "sin asignar".
      await this.pasajeroRepository.manager.transaction(async (manager) => {
        await manager.update(Pasajeros, id, { estatus });
        if (pasajero.idUsuario) {
          const idUsuario = Number(pasajero.idUsuario);
          await manager.update(Usuarios, idUsuario, { estatus });
          await manager.increment(
            Usuarios,
            { id: idUsuario },
            'tokenVersion',
            1,
          );
          await manager.update(
            RefreshSessions,
            { idUsuario, revokedAt: IsNull() },
            { revokedAt: new Date() },
          );
        }
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updatePasajeroEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajero',
        `El estatus del pasajero con ID: ${id} ha sido actualizado a: ${updatePasajeroEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: `El estatus del pasajero con ID: ${id} ha sido actualizado a: ${updatePasajeroEstatusDto.estatus}.`,
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `${pasajero.nombre} ${pasajero.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updatePasajeroEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajero',
        `El estatus del pasajero con ID: ${id} ha sido actualizado a: ${updatePasajeroEstatusDto.estatus}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de cambio de estatus del pasajero.',
      );
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR TIPO DE PASJERO EN EL MONEDERO
  // ========================================
  async updatePasajeroEstadoSolicitud(
    id: number,
    updatePasajeroEstadoSolicitudDto: UpdatePasajeroEstadoSolicitudDto,
    idUser: number,
    cliente = 0,
    rol = 1,
  ) {
    try {
      await this.assertPasajeroEnTenant(id, cliente, rol);
      const pasajero = await this.pasajeroRepository.findOne({
        where: { id: id },
      });
      if (!pasajero) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }
      const { estadoSolicitud, idTipoPasajero } =
        updatePasajeroEstadoSolicitudDto;

      //En caso de ser aprovado el pasajero se solicitada el tipo de pasajero asociado a su monedero
      //buscamos y validamos el monedero
      if (estadoSolicitud == EnumSolicitudPasajero.APROBADO) {
        const monedero = await this.monederosRepository.findOne({
          where: { idPasajero: pasajero.id, estatus: EstatusEnum.ACTIVO },
        });
        if (!monedero) {
          throw new NotFoundException(
            `El monedero asociado al pasajero ${pasajero.nombre} no fue encontrado.`,
          );
        }
        await this.monederosRepository.update(monedero.id, {
          idTipoPasajero: idTipoPasajero,
        });

        // --- Registro en la bitácora --- SUCCESS
        const querylogger = { updatePasajeroEstadoSolicitudDto };
        await this.bitacoraLogger.logToBitacora(
          'Monederos',
          `Se actualizó el tipo de pasajero del monedero con ID: ${pasajero.id} a ${updatePasajeroEstadoSolicitudDto.idTipoPasajero}.`,
          'UPDATE',
          querylogger,
          idUser,
          EnumModulos.MONEDEROS,
          EstatusEnumBitcora.SUCCESS,
        );
      }
      await this.pasajeroRepository.update(id, { estadoSolicitud });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updatePasajeroEstadoSolicitudDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajero',
        `El estadoSolicitud del pasajero con ID: ${id} ha sido actualizado a: ${updatePasajeroEstadoSolicitudDto.estadoSolicitud}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: `El estado solicitud del pasajero con ID: ${id} ha sido actualizado a: ${updatePasajeroEstadoSolicitudDto.estadoSolicitud}.`,
        estatus: { estatus: Number(estadoSolicitud) },
        data: {
          id: id,
          nombre: `${pasajero.nombre} ${pasajero.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updatePasajeroEstadoSolicitudDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajero',
        `El estadoSolicitud del pasajero con ID: ${id} ha sido actualizado a: ${updatePasajeroEstadoSolicitudDto.estadoSolicitud}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de cambio de estado solicitud del pasajero.',
      );
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR PASAJERO SU INFORMACION
  // ========================================
  async updatePasajero(
    id: number,
    idUser: number,
    updatePasajeroDto: UpdatePasajeroDto,
    cliente = 0,
    rol = 1,
  ): Promise<ApiCrudResponse> {
    try {
      await this.assertPasajeroEnTenant(id, cliente, rol);
      const pasajero = await this.pasajeroRepository.findOne({
        where: { id: id },
      });
      if (!pasajero) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }
      await this.pasajeroRepository.update(id, updatePasajeroDto);
      const pasajeroSave = await this.pasajeroRepository.findOne({
        where: { id: id },
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updatePasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Los datos del pasajero con ID: ${id} han sido actualizados correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: `Los datos del pasajero con ID: ${id} han sido actualizados correctamente.`,
        data: {
          id: id,
          nombre:
            `${pasajeroSave?.nombre} ${pasajeroSave?.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updatePasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Los datos del pasajero con ID: ${id} han sido actualizados correctamente.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Se produjo un error al intentar actualizar los datos del pasajero.',
      );
    }
  }
  // ========================================
  // 🔹 ELIMINADO LOGICO DEL PASAJERO
  // ========================================
  async removePasajero(id: number, idUser: number, cliente = 0, rol = 1) {
    try {
      await this.assertPasajeroEnTenant(id, cliente, rol);
      const pasajero = await this.pasajeroRepository.findOne({
        where: { id: id },
      });
      if (!pasajero) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }
      await this.pasajeroRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Se ha eliminado el pasajero ${pasajero.nombre} con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El pasajero ha sido eliminado correctamente.',
        data: {
          id: Number(pasajero.id),
          nombre: `${pasajero.nombre} ${pasajero.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Pasajeros',
        `Se elimino pasajero con id: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de eliminación del pasajero.',
      );
    }
  }

  /**
   * Actualiza el CustomerIdNetPay de un pasajero
   * @param id ID del pasajero
   * @param updatePasajeroCustomerIdDto DTO con el CustomerIdNetPay
   * @param idUser ID del usuario que realiza la actualización
   * @returns Respuesta de la actualización
   */
  async updatePasajeroCustomerId(
    id: number,
    updatePasajeroCustomerIdDto: UpdatePasajeroCustomerIdDto,
    idUser: number,
    cliente = 0,
    rol = 1,
  ): Promise<ApiCrudResponse> {
    try {
      await this.assertPasajeroEnTenant(id, cliente, rol);
      const pasajero = await this.pasajeroRepository.findOne({
        where: { id: id },
      });
      if (!pasajero) {
        throw new NotFoundException(
          `No se encontró un pasajero con ID: ${id}.`,
        );
      }

      const { customerIdNetPay } = updatePasajeroCustomerIdDto;
      if (customerIdNetPay) {
        const otroPasajero = await this.pasajeroRepository.findOne({
          where: { customerIdNetPay },
        });
        if (otroPasajero && Number(otroPasajero.id) !== Number(id)) {
          throw new BadRequestException('CustomerIdNetPay ya asignado');
        }
      }
      await this.pasajeroRepository.update(id, { customerIdNetPay });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id, customerIdNetPay };
      await this.bitacoraLogger.logToBitacora(
        'Pasajero',
        `Se ha actualizado el CustomerIdNetPay del pasajero con ID: ${id} a: ${customerIdNetPay}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: `El CustomerIdNetPay del pasajero con ID: ${id} ha sido actualizado correctamente.`,
        data: {
          id: id,
          nombre: `${pasajero.nombre} ${pasajero.apellidoPaterno} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id, updatePasajeroCustomerIdDto };
      await this.bitacoraLogger.logToBitacora(
        'Pasajero',
        `Error al actualizar el CustomerIdNetPay del pasajero con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.PASAJEROS,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ha ocurrido un error durante el proceso de actualización del CustomerIdNetPay del pasajero.',
      );
    }
  }
}
