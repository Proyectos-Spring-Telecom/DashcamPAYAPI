import {
  clienteHijosDesdeSp,
  clientesPermitidos,
  tieneIdsTenant,
} from 'src/common/tenant/ownership-resolvers';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateLicenciaDto } from './dto/create-licencia.dto';
import { UpdateLicenciaDto } from './dto/update-licencia.dto';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Licencias } from 'src/entities/Licencias';
import { Repository } from 'typeorm';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { EnumModulos } from 'src/common/estatus.enum';
import { Clientes } from 'src/entities/Clientes';
import { S3Service } from 'src/s3/s3.service';

@Injectable()
export class LicenciasService {
  constructor(
    @InjectRepository(Licencias)
    private readonly licenciasRepository: Repository<Licencias>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    private readonly bitacoraLogger: BitacoraLoggerService,
    private readonly s3Service: S3Service,
  ) {}

  // ========================================
  // 🔹 CREAR UNA LICENCIA
  // ========================================
  async create(
    idUser: number,
    createLicenciaDto: CreateLicenciaDto,
    licenciaFile?: Express.Multer.File,
    idCliente = 0,
    rol = 1,
  ) {
    try {
      await this.assertOperadorEnAlcance(
        createLicenciaDto.idOperador,
        idCliente,
        rol,
      );

      const numeroLicencia = await this.licenciasRepository.findOne({
        where: {
          numeroLicencia: createLicenciaDto.numeroLicencia,
        },
      });
      if (numeroLicencia) {
        throw new BadRequestException('Licencia ya ha sido registrado.');
      }

      // Subir archivo de licencia a S3 si se proporciona
      let licenciaUrl: string | null = null;
      if (licenciaFile) {
        const uploadResult = await this.s3Service.uploadFile(
          licenciaFile,
          'Licencias',
          idUser,
          EnumModulos.OPERADORES,
          Number(idCliente) || 0,
        );
        licenciaUrl = uploadResult.url;
      }

      // Crear el registro con los datos del DTO y la URL del archivo
      // El campo 'licencia' del DTO es el archivo, así que usamos 'nombreLicencia' si viene, o la URL del archivo, o un valor por defecto
      const nuevaLicencia = await this.licenciasRepository.create({
        ...createLicenciaDto,
        licencia:
          licenciaUrl ||
          createLicenciaDto.nombreLicencia ||
          `Licencia ${createLicenciaDto.numeroLicencia}`,
      });
      const licenciaSave = await this.licenciasRepository.save(nuevaLicencia);

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { createLicenciaDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se le ha creado la licencia al operador correctamente, número de licencia: ${createLicenciaDto.numeroLicencia}.`,
        'CREATE',
        querylogger,
        Number(idUser),
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.SUCCESS,
      );
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'La licencia ha sido creado correctamente.',
        data: {
          id: Number(licenciaSave.id),
          nombre: `Numero de licencia: ${licenciaSave.numeroLicencia}` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora-----ERROR
      const querylogger = { createLicenciaDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `El operador ha sido creado correctamente con el número de licencia: ${createLicenciaDto.numeroLicencia}.`,
        'CREATE',
        querylogger,
        Number(idUser),
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al crear la licencia.',
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  async findAll(
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let licencias;
      let totalResult;

      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          licencias = await this.licenciasRepository.query(
            `
SELECT
  l.Id AS idLicencia,
  l.Licencia AS licencia,
  l.NumeroLicencia AS numeroLicencia,
  l.FechaExpedicion AS fechaExpedicion,
  l.FechaVencimineto AS fechaVencimiento,

  -- Nombre completo del operador (maneja apellido materno opcional)
  TRIM(
    CONCAT_WS(' ',
      u.Nombre,
      u.ApellidoPaterno,
      NULLIF(u.ApellidoMaterno, '')
    )
  ) AS nombreOperador,

  -- Datos adicionales
  ctl.Nombre AS tipoLicencia,
  ccl.Nombre AS categoriaLicencia

FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id

ORDER BY l.Id ASC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.licenciasRepository.query(
            `
   SELECT COUNT(*) AS total
FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id
  `,
          );
          break;

        case 3:
        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          // Consulta de datos paginados resto Usuario
          licencias = await this.licenciasRepository.query(
            `
SELECT
  l.Id AS idLicencia,
  l.Licencia AS licencia,
  l.NumeroLicencia AS numeroLicencia,
  l.FechaExpedicion AS fechaExpedicion,
  l.FechaVencimineto AS fechaVencimiento,

  -- Nombre completo del operador (maneja apellido materno opcional)
  TRIM(
    CONCAT_WS(' ',
      u.Nombre,
      u.ApellidoPaterno,
      NULLIF(u.ApellidoMaterno, '')
    )
  ) AS nombreOperador,

  -- Datos adicionales
  ctl.Nombre AS tipoLicencia,
  ccl.Nombre AS categoriaLicencia

FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY l.Id ASC
LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.licenciasRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids],
          );
          break;
      }
      const total = Number(totalResult[0]?.total || 0);

      //Forzamos lo id string a number
      const data = licencias.map((item) => ({
        ...item,
        idLicencia: Number(item.idLicencia),
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
        message: `Se produjo un error al obtener la paginación de licencias.`,
      });
    }
  }

  async findAllList(cliente: number, rol: number) {
    try {
      let licencias;

      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          licencias = await this.licenciasRepository.query(
            `
SELECT
  l.Id AS idLicencia,
  l.Licencia AS licencia,
  l.NumeroLicencia AS numeroLicencia,
  l.FechaExpedicion AS fechaExpedicion,
  l.FechaVencimineto AS fechaVencimiento,

  -- Nombre completo del operador (maneja apellido materno opcional)
  TRIM(
    CONCAT_WS(' ',
      u.Nombre,
      u.ApellidoPaterno,
      NULLIF(u.ApellidoMaterno, '')
    )
  ) AS nombreOperador,

  -- Datos adicionales
  ctl.Nombre AS tipoLicencia,
  ccl.Nombre AS categoriaLicencia

FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id

ORDER BY l.Id ASC

        `,
            [],
          );
          break;

        case 3:
        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          // Consulta de datos paginados resto Usuario
          licencias = await this.licenciasRepository.query(
            `
SELECT
  l.Id AS idLicencia,
  l.Licencia AS licencia,
  l.NumeroLicencia AS numeroLicencia,
  l.FechaExpedicion AS fechaExpedicion,
  l.FechaVencimineto AS fechaVencimiento,

  -- Nombre completo del operador (maneja apellido materno opcional)
  TRIM(
    CONCAT_WS(' ',
      u.Nombre,
      u.ApellidoPaterno,
      NULLIF(u.ApellidoMaterno, '')
    )
  ) AS nombreOperador,

  -- Datos adicionales
  ctl.Nombre AS tipoLicencia,
  ccl.Nombre AS categoriaLicencia

FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
ORDER BY l.Id ASC
        `,
            [...ids],
          );
          break;
      }

      //Forzamos lo id string a number
      const data = licencias.map((item) => ({
        ...item,
        idLicencia: Number(item.idLicencia),
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
        message: `Se produjo un error al obtener la paginación de licencias.`,
      });
    }
  }

  async findOne(id: number, cliente: number, rol: number) {
    try {
      let licencias;

      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          licencias = await this.licenciasRepository.query(
            `
SELECT
  l.Id AS idLicencia,
  l.Licencia AS licencia,
  l.NumeroLicencia AS numeroLicencia,
  l.FechaExpedicion AS fechaExpedicion,
  l.FechaVencimineto AS fechaVencimiento,

  -- Nombre completo del operador (maneja apellido materno opcional)
  TRIM(
    CONCAT_WS(' ',
      u.Nombre,
      u.ApellidoPaterno,
      NULLIF(u.ApellidoMaterno, '')
    )
  ) AS nombreOperador,

  -- Datos adicionales
  ctl.Nombre AS tipoLicencia,
  ccl.Nombre AS categoriaLicencia

FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id
WHERE l.Id = ?
ORDER BY l.Id ASC

        `,
            [id],
          );
          break;

        case 3:
        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          // Consulta de datos paginados resto Usuario
          licencias = await this.licenciasRepository.query(
            `
SELECT
  l.Id AS idLicencia,
  l.Licencia AS licencia,
  l.NumeroLicencia AS numeroLicencia,
  l.FechaExpedicion AS fechaExpedicion,
  l.FechaVencimineto AS fechaVencimiento,

  -- Nombre completo del operador (maneja apellido materno opcional)
  TRIM(
    CONCAT_WS(' ',
      u.Nombre,
      u.ApellidoPaterno,
      NULLIF(u.ApellidoMaterno, '')
    )
  ) AS nombreOperador,

  -- Datos adicionales
  ctl.Nombre AS tipoLicencia,
  ccl.Nombre AS categoriaLicencia

FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
INNER JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND l.Id = ?
ORDER BY l.Id ASC
        `,
            [...ids, id],
          );
          break;
      }

      if (licencias.length === 0) {
        throw new NotFoundException('Licencia no encontrada.');
      }

      //Forzamos lo id string a number
      const data = licencias.map((item) => ({
        ...item,
        idLicencia: Number(item.idLicencia),
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
        message: `Se produjo un error al obtener una licencia.`,
      });
    }
  }

  private async assertLicenciaTenant(
    id: number,
    cliente: number,
    rol: number,
  ) {
    if (Number(rol) === 1) return;
    const { ids, placeholders } = await this.clienteHijos(cliente);
    if (!tieneIdsTenant(ids)) {
      throw new NotFoundException('Licencia no fue encontrada.');
    }
    const rows = await this.licenciasRepository.query(
      `
SELECT l.Id
FROM Licencias l
INNER JOIN Operadores o ON l.IdOperador = o.Id
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE l.Id = ? AND u.IdCliente IN (${placeholders})
LIMIT 1
      `,
      [id, ...ids],
    );
    if (!rows?.length) {
      throw new NotFoundException('Licencia no fue encontrada.');
    }
  }

  private async assertOperadorEnAlcance(
    idOperador: number,
    idCliente: number,
    rol: number,
  ) {
    if (Number(rol) === 1) return;
    const row = (
      await this.licenciasRepository.query(
        `SELECT u.IdCliente AS idCliente
           FROM Operadores o
           INNER JOIN Usuarios u ON o.IdUsuario = u.Id
          WHERE o.Id = ?
          LIMIT 1`,
        [idOperador],
      )
    )?.[0];
    if (!row) {
      throw new NotFoundException('Operador no encontrado');
    }
    const ids = await clientesPermitidos(
      this.clienteRepository.manager,
      Number(idCliente),
    );
    if (!tieneIdsTenant(ids) || !ids.includes(Number(row.idCliente))) {
      throw new NotFoundException('Operador no encontrado');
    }
  }

  async update(
    id: number,
    idUser: number,
    updateLicenciaDto: UpdateLicenciaDto,
    cliente = 0,
    rol = 1,
  ) {
    try {
      await this.assertLicenciaTenant(id, cliente, rol);
      if (updateLicenciaDto.idOperador != null) {
        await this.assertOperadorEnAlcance(
          updateLicenciaDto.idOperador,
          cliente,
          rol,
        );
      }
      const licencia = await this.licenciasRepository.findOne({
        where: {
          id: id,
        },
      });
      if (!licencia) {
        throw new NotFoundException('Licencia no fue encontrada.');
      }
      await this.licenciasRepository.update(id, updateLicenciaDto);

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { updateLicenciaDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se le ha actualizado la licencia al operador correctamente, número de licencia: ${updateLicenciaDto.numeroLicencia}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.SUCCESS,
      );
      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'La licencia ha sido actualizada correctamente.',
        data: {
          id: Number(id),
          nombre:
            `Numero de licencia: ${updateLicenciaDto.numeroLicencia}` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora-----ERROR
      const querylogger = { updateLicenciaDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se le ha actualizado la licencia al operador correctamente, número de licencia: ${updateLicenciaDto.numeroLicencia}.`,
        'UPDATE',
        querylogger,
        Number(idUser),
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: 'Error al actualizar la licencia.',
      });
    }
  }

  async remove(id: number, idUser: number, cliente = 0, rol = 1) {
    try {
      await this.assertLicenciaTenant(id, cliente, rol);
      const licencia = await this.licenciasRepository.findOne({
        where: { id: id },
      });
      if (!licencia) {
        throw new NotFoundException(
          `No se encontró el licencia con ID: ${id}.`,
        );
      }

      await this.licenciasRepository.delete(id);

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { licencia };
      await this.bitacoraLogger.logToBitacora(
        'licencia',
        `Se eliminó el licencia con ID: ${id}.`,
        'DELETE',
        querylogger,
        idUser,
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'licencia eliminado correctamente',
        data: {
          id: id,
          nombre: `${licencia.numeroLicencia} ${licencia.idOperador} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'licencia',
        `Se eliminó el licencia con ID: ${id}.`,
        'DELETE',
        querylogger,
        idUser,
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al intentar eliminar la licencia.',
      });
    }
  }
}
