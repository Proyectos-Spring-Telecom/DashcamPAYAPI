import { clienteHijosDesdeSp, tieneIdsTenant } from 'src/common/tenant/ownership-resolvers';
import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateBitacoraDto } from './dto/create-bitacora.dto';
import {
  bitacoraCanonical,
  bitacoraCanonicalEncadenado,
  coerceBitacoraQuery,
  hashesIguales,
  hmacBitacora,
} from './bitacora-hmac';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Bitacora } from 'src/entities/Bitacora';
import { DataSource, Repository } from 'typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { Clientes } from 'src/entities/Clientes';

@Injectable()
export class BitacoraLoggerService {
  constructor(
    @InjectRepository(Bitacora)
    private readonly bitacoraRepository: Repository<Bitacora>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}
  createBitacora(_createBitacoraDto: CreateBitacoraDto) {
    return 'This action adds a new bitacora';
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  async findAllListBitacora(cliente: number, rol: number) {
    try {
      let bitacora;
      switch (rol) {
        case 1:
          // Consulta de datos listado Usuario SuperAdministrador
          bitacora = await this.bitacoraRepository.query(
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
          break;

        case 3:
        default:
          // Consulta de datos listado resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          bitacora = await this.bitacoraRepository.query(
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
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY b.FechaCreacion DESC;
            `,
            [...ids],
          );
          break;
      }

      const data = bitacora.map((item) => this.presentBitacora(item));

      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Ocurrió un error al obtener las bitácoras listado.',
      );
    }
  }

  async findAll(cliente: number, rol: number, page: number, limit: number) {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let bitacora;

      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          bitacora = await this.bitacoraRepository.query(
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
          break;

        case 3:
        default:
          // Consulta de datos paginados resto Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          bitacora = await this.bitacoraRepository.query(
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

WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY b.FechaCreacion DESC
LIMIT ? OFFSET ?;
            `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.bitacoraRepository.query(
            `
  SELECT COUNT(*) AS total
 FROM Bitacora b
INNER JOIN Usuarios u ON b.IdUsuario = u.Id
INNER JOIN Modulos m ON b.IdModulo = m.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total ?? 0);

      const data = bitacora.map((item) => this.presentBitacora(item));
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
        'Ocurrió un error al obtener las bitácoras paginada.',
      );
    }
  }

  async findOne(id: number, cliente = 0, rol = 1) {
    try {
      let whereSql = 'WHERE b.Id = ?';
      let params: Array<number> = [id];
      if (Number(rol) !== 1) {
        const { ids, placeholders } = await this.clienteHijos(cliente);
        if (!tieneIdsTenant(ids)) {
          throw new NotFoundException('Bitácora no encontrada');
        }
        whereSql += ` AND u.IdCliente IN (${placeholders})`;
        params = [id, ...ids];
      }

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

${whereSql}

ORDER BY b.FechaCreacion DESC;
            `,
        params,
      );

      if (bitacora.length === 0) {
        throw new NotFoundException(`Bitácora con ID: ${id} no encontrada.`);
      }

      const data = bitacora.map((item) => this.presentBitacora(item));

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
    const fechaCreacion = new Date();
    const querySanitizado = this.sanitizeQuery(query);

    const descripcionSafe = this.truncate(descripcion, 250);
    const moduloSafe = this.truncate(modulo, 100);
    const accionSafe = this.truncate(accion, 45);
    const errorSafe = this.safeBitacoraError(error);

    const campos = {
      modulo: moduloSafe,
      descripcion: descripcionSafe,
      accion: accionSafe,
      query: querySanitizado,
      estatus: estatus ?? null,
      error: errorSafe ?? null,
      idUsuario,
      idModulo,
      fechaCreacion,
    };
    const secret = process.env.BITACORA_HMAC_SECRET as string;

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const lock: Array<{ ok?: number | string | null }> = await runner.query(
        `SELECT GET_LOCK('dashcam_bitacora_chain', 10) AS ok`,
      );
      if (Number(lock?.[0]?.ok) !== 1) {
        throw new InternalServerErrorException(
          'No se pudo registrar la bitácora.',
        );
      }
      const previa: Array<{ Hash?: string | null }> = await runner.query(
        'SELECT Hash FROM Bitacora ORDER BY Id DESC LIMIT 1',
      );
      const hashAnterior = previa[0]?.Hash ?? null;
      const hash = hmacBitacora(
        bitacoraCanonicalEncadenado(campos, hashAnterior),
        secret,
      );
      const registro = runner.manager.getRepository(Bitacora).create({
        ...campos,
        hash,
        hashAnterior,
      });
      await runner.manager.getRepository(Bitacora).save(registro);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException(
        'No se pudo registrar la bitácora.',
      );
    } finally {
      try {
        await runner.query(`SELECT RELEASE_LOCK('dashcam_bitacora_chain')`);
      } catch {
        // Si la conexión ya se cerró, el candado se suelta con ella.
      }
      await runner.release();
    }
  }

  private presentBitacora(item: Record<string, unknown>) {
    return {
      ...item,
      id: Number(item.id),
      idUsuario: Number(item.idUsuario),
      idModulo: Number(item.idModulo),
      error: this.safeBitacoraError(
        item.error == null ? undefined : String(item.error),
      ) ?? null,
      query: this.redactStoredQuery(item.query),
    };
  }

  private redactStoredQuery(query: unknown): unknown {
    if (query == null || query === '') return query ?? null;
    let parsed: unknown = query;
    if (typeof query === 'string') {
      try {
        parsed = JSON.parse(query);
      } catch {
        return {};
      }
    }
    if (!parsed || typeof parsed !== 'object') return {};
    return this.sanitizeQuery(parsed);
  }

  /** No persistir ni mostrar texto del driver, de SQL ni de la red. */
  private safeBitacoraError(error?: string): string | undefined {
    if (!error) return undefined;
    const text = String(error);
    if (
      /queryfailed|sql syntax|unknown column|duplicate entry|ER_[A-Z0-9_]+|econnreset|econnrefused|sqlstate|deadlock|cannot add or update a child row/i.test(
        text,
      )
    ) {
      return 'Error interno';
    }
    return this.truncate(text, 200);
  }

  private truncate(value: string | null | undefined, max: number): string {
    const text = value ?? '';
    return text.length > max ? text.slice(0, max) : text;
  }

  private isSensitiveKey(key: string): boolean {
    return /password|passhash|cvv|cvc|cardnumber|pan|pin|codigo|token|secret|privatekey|apikey|authorization|cookie|correo|email|telefono|nombre|apellido/i.test(
      key,
    );
  }

  private isAllowedQueryKey(key: string): boolean {
    return /^(id|ids|estatus|monto|accion|rol|cantidad|cantidadPasajes|claveIdempotencia)$/i.test(
      key,
    )
      || /^id[A-Z]/.test(key)
      || /Id$/.test(key)
      || /^numeroSerie/i.test(key)
      || /^clave/i.test(key);
  }

  private pickQueryIds(value: unknown, depth = 0): Record<string, unknown> {
    if (!value || typeof value !== 'object' || depth > 4) return {};
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (
      keys.length === 1 &&
      /dto$/i.test(keys[0]) &&
      obj[keys[0]] &&
      typeof obj[keys[0]] === 'object'
    ) {
      return this.pickQueryIds(obj[keys[0]], depth + 1);
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(obj)) {
      if (this.isSensitiveKey(key)) continue;
      if (this.isAllowedQueryKey(key)) {
        if (child == null || ['string', 'number', 'boolean'].includes(typeof child)) {
          out[key] = child;
        } else if (Array.isArray(child) && child.every((x) => typeof x === 'number' || typeof x === 'string')) {
          out[key] = child.slice(0, 50);
        } else if (typeof child === 'object') {
          const nested = this.pickQueryIds(child, depth + 1);
          if (Object.keys(nested).length) out[key] = nested;
        }
      } else if (child && typeof child === 'object' && !Array.isArray(child)) {
        Object.assign(out, this.pickQueryIds(child, depth + 1));
      }
    }
    return out;
  }

  private sanitizeQuery(query: any): any {
    if (!query || typeof query !== 'object') return {};
    return this.pickQueryIds(query);
  }

  async verifyIntegrity(id: number): Promise<{ id: number; valido: boolean }> {
    const r = await this.bitacoraRepository.findOne({ where: { id } });
    if (!r) {
      throw new NotFoundException(`Bitácora con ID ${id} no encontrada.`);
    }
    const campos = {
      modulo: r.modulo,
      descripcion: r.descripcion,
      accion: r.accion,
      query: coerceBitacoraQuery(r.query),
      estatus: r.estatus,
      error: r.error,
      idUsuario: r.idUsuario,
      idModulo: r.idModulo,
      fechaCreacion: r.fechaCreacion,
    };
    const secret = process.env.BITACORA_HMAC_SECRET as string;
    const encadenado = hmacBitacora(
      bitacoraCanonicalEncadenado(campos, r.hashAnterior),
      secret,
    );
    let valido = hashesIguales(r.hash, encadenado);
    if (!valido && !r.hashAnterior) {
      valido = hashesIguales(r.hash, hmacBitacora(bitacoraCanonical(campos), secret));
    }
    if (valido && r.hashAnterior) {
      const previa: Array<{ Hash?: string | null }> =
        await this.bitacoraRepository.query(
          'SELECT Hash FROM Bitacora WHERE Id < ? ORDER BY Id DESC LIMIT 1',
          [r.id],
        );
      valido = hashesIguales(previa[0]?.Hash ?? null, r.hashAnterior);
    }
    return { id, valido };
  }
}
