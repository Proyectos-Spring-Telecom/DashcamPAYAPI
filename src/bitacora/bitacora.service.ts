import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateBitacoraDto } from './dto/create-bitacora.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Bitacora } from 'src/entities/Bitacora';
import { Repository } from 'typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@Injectable()
export class BitacoraLoggerService {
  constructor(
    @InjectRepository(Bitacora)
    private readonly bitacoraRepository: Repository<Bitacora>,
  ) {}
  createBitacora(createBitacoraDto: CreateBitacoraDto) {
    return 'This action adds a new bitacora';
  }

  async findAllListBitacora() {
    try {
      const bitacora = await this.bitacoraRepository.query(
        `
SELECT
  -- Bitácora
  b.Id AS id,
  b.Modulo AS modulo,
  b.Descripcion AS descripcion,
  b.Accion AS accion,
  b.Query AS query,
  b.FechaCreacion AS fechaCreacion,
  b.Estatus AS estatus,
  b.Error AS error,

  -- Usuario
  u.Id AS idUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.UserName AS UserNameUsuario,
  u.Estatus AS estatusUsuario,

  -- Módulo
  m.Id AS idModulo,
  m.Nombre AS nombreModulo,
  m.Descripcion AS descripcionModulo

FROM Bitacora b
INNER JOIN Usuarios u ON b.IdUsuario = u.Id
INNER JOIN Modulos m ON b.IdModulo = m.Id



ORDER BY b.FechaCreacion DESC;
            `,
      );

      const data = bitacora.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idModulo: Number(item.idModulo),
      }));

      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Ocurrió un error al obtener las bitácoras listado.');
    }
  }

  async findAll(page: number, limit: number) {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      const bitacora = await this.bitacoraRepository.query(
        `
SELECT
  -- Bitácora
  b.Id AS id,
  b.Modulo AS modulo,
  b.Descripcion AS descripcion,
  b.Accion AS accion,
  b.Query AS query,
  b.FechaCreacion AS fechaCreacion,
  b.Estatus AS estatus,
  b.Error AS error,

  -- Usuario
  u.Id AS idUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.UserName AS UserNameUsuario,
  u.Estatus AS estatusUsuario,

  -- Módulo
  m.Id AS idModulo,
  m.Nombre AS nombreModulo,
  m.Descripcion AS descripcionModulo

FROM Bitacora b
INNER JOIN Usuarios u ON b.IdUsuario = u.Id
INNER JOIN Modulos m ON b.IdModulo = m.Id



ORDER BY b.FechaCreacion DESC
LIMIT ? OFFSET ?;
            `,
            [limit, offset],
      );

      // Query para total (sin paginación)
          totalResult = await this.bitacoraRepository.query(
            `
  SELECT COUNT(*) AS total
 FROM Bitacora b
INNER JOIN Usuarios u ON b.IdUsuario = u.Id
INNER JOIN Modulos m ON b.IdModulo = m.Id
  `,
          );

      const total = Number(totalResult[0]?.total ?? 0);

      const data = bitacora.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idModulo: Number(item.idModulo),
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
      throw new InternalServerErrorException('Ocurrió un error al obtener las bitácoras paginada.');
    }
  }

  async findOne(id: number) {
    try {
      const bitacora = await this.bitacoraRepository.query(
        `
SELECT
  -- Bitácora
  b.Id AS id,
  b.Modulo AS modulo,
  b.Descripcion AS descripcion,
  b.Accion AS accion,
  b.Query AS query,
  b.FechaCreacion AS fechaCreacion,
  b.Estatus AS estatus,
  b.Error AS error,

  -- Usuario
  u.Id AS idUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.UserName AS UserNameUsuario,
  u.Estatus AS estatusUsuario,

  -- Módulo
  m.Id AS idModulo,
  m.Nombre AS nombreModulo,
  m.Descripcion AS descripcionModulo

FROM Bitacora b
INNER JOIN Usuarios u ON b.IdUsuario = u.Id
INNER JOIN Modulos m ON b.IdModulo = m.Id

WHERE b.Id = ?

ORDER BY b.FechaCreacion DESC;
            `,
            [id]
      );

      if (bitacora.length === 0) {
        throw new NotFoundException(`Bitácora con ID: ${id} no encontrada.`);
      }

      const data = bitacora.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idModulo: Number(item.idModulo),
      }));
      
      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Ocurrió un error al obtener las bitácoras paginada.',
      });
    }
  }

  async logToBitacora(
    modulo: string,
    descripcion: string,
    accion: string,
    query: object,
    idUsuario: number,
    idModulo: number,
    estatus?: string,
    error?: string,
  ) {
    function pad(n: number) {
      return n < 10 ? '0' + n : n;
    }
    const ahora = new Date();
    const FechaActual = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}`;

    const registro = this.bitacoraRepository.create({
      modulo: modulo,
      descripcion: descripcion,
      accion: accion,
      query: { raw: query },
      estatus: estatus ?? null,
      error: error ?? null,
      idUsuario: idUsuario,
      idModulo: idModulo,
    });
    console.log(FechaActual);
    await this.bitacoraRepository.save(registro);
    console.log('Registro guardado correctamente en la bitácora: ', registro);
  }
}
