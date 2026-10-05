import { nowDb } from 'src/common/clock';
import { clienteHijosDesdeSp } from 'src/common/tenant/ownership-resolvers';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateConteoPasajerosDto } from './dto/create-conteopasajero.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ConteoPasajeros } from 'src/entities/ConteoPasajeros';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { Usuarios } from 'src/entities/Usuarios';
import { Clientes } from 'src/entities/Clientes';
import { Contadores } from 'src/entities/Contadores';
import { Viajes } from 'src/entities/Viajes';
import { Instalaciones } from 'src/entities/Instalaciones';
import { InstalacionContadores } from 'src/entities/InstalacionContadores';
import { Turnos } from 'src/entities/Turnos';
import { UpdateConteoPasajerosDto } from './dto/update-conteopasajero.dto';
import { EnumModulos, EstatusConteo } from 'src/common/estatus.enum';
import { assertIsoDate, dateTimeBounds } from 'src/common/sql-date';

@Injectable()
export class ConteopasajerosService {
  constructor(
    @InjectRepository(ConteoPasajeros)
    private readonly conteopasajeroRepository: Repository<ConteoPasajeros>,
    @InjectRepository(Contadores)
    private readonly contadoresRepository: Repository<Contadores>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(InstalacionContadores)
    private readonly instalacionContadoresRepository: Repository<InstalacionContadores>,
    @InjectRepository(Turnos)
    private readonly turnosRepository: Repository<Turnos>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  // ========================================
  // 🔹 CREAR DATOS DE CONTEOPASAJEROS
  // ========================================
  async create(
    createConteopasajeroDto: CreateConteoPasajerosDto,
    idUser: number,
    cliente = 0,
    rol = 1,
  ): Promise<ApiCrudResponse> {
    try {
      // Validar que el contador existe
      const contador = await this.contadoresRepository.findOne({
        where: { numeroSerie: createConteopasajeroDto.numeroSerieContador },
      });

      if (!contador) {
        throw new NotFoundException(
          `El contador con número de serie '${createConteopasajeroDto.numeroSerieContador}' no existe.`,
        );
      }

      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (
        series &&
        !series.includes(createConteopasajeroDto.numeroSerieContador)
      ) {
        throw new NotFoundException(
          `El contador con número de serie '${createConteopasajeroDto.numeroSerieContador}' no existe.`,
        );
      }

      // Obtener la instalación relacionada con el contador a través de InstalacionContadores
      const instalacionContador =
        await this.instalacionContadoresRepository.findOne({
          where: {
            idContador: contador.id,
            estatus: 1,
          },
          relations: ['instalacion'],
        });

      if (!instalacionContador || !instalacionContador.instalacion) {
        throw new NotFoundException(
          `No se encontró una instalación activa para el contador con número de serie '${createConteopasajeroDto.numeroSerieContador}'.`,
        );
      }

      const instalacion = instalacionContador.instalacion;

      // Verificar que la instalación esté activa y pertenezca al cliente
      if (
        instalacion.estatus !== 1 ||
        instalacion.idCliente !== contador.idCliente
      ) {
        throw new NotFoundException(
          `No se encontró una instalación activa para el contador con número de serie '${createConteopasajeroDto.numeroSerieContador}'.`,
        );
      }

      // Obtener el turno activo relacionado con la instalación
      const turno = await this.turnosRepository.findOne({
        where: {
          idInstalacion: instalacion.id,
          idCliente: contador.idCliente,
          estatus: 1, // Solo turnos activos
        },
        order: {
          inicio: 'DESC', // Obtener el turno más reciente
        },
      });
      if (!turno) {
        throw new NotFoundException(
          `No se encontró un turno activo para la instalación del contador '${createConteopasajeroDto.numeroSerieContador}'.`,
        );
      }

      // Obtener el viaje activo relacionado con el turno
      const viaje = await this.viajesRepository.findOne({
        where: {
          idTurno: turno.id,
          idCliente: contador.idCliente,
          estatus: 1, // Solo viajes activos
        },
        order: {
          inicio: 'DESC', // Obtener el viaje más reciente
        },
      });

      if (!viaje) {
        throw new NotFoundException(
          `No se encontró un viaje activo para el turno de la instalación del contador '${createConteopasajeroDto.numeroSerieContador}'.`,
        );
      }

      // Preparar los datos para crear con idViaje y numeroSerieContador
      // Usar valores por defecto para campos requeridos
      const fechaHora = nowDb();

      const dataToCreate: any = {
        numeroSerieContador: createConteopasajeroDto.numeroSerieContador,
        idViaje: viaje.id,
        diferencia: 0, // Valor por defecto
        fechaHora: fechaHora, // Fecha actual con desfase
        entradas: 0, // Valor por defecto
        salidas: 0, // Valor por defecto
        estatus: EstatusConteo.ACTIVO, // Establecer como activo
      };

      const newConteoPasajero =
        this.conteopasajeroRepository.create(dataToCreate);

      // Guardar el registro
      const saveResult =
        await this.conteopasajeroRepository.save(newConteoPasajero);
      const conteoPasajeroSave = Array.isArray(saveResult)
        ? saveResult[0]
        : saveResult;

      // Verificar que el registro realmente se guardó en la base de datos
      if (!conteoPasajeroSave || !conteoPasajeroSave.id) {
        throw new InternalServerErrorException(
          'Error al guardar el registro de ConteoPasajero. El registro no se creó correctamente.',
        );
      }

      // Preparar respuesta exitosa
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El registro de ConteoPasajero se realizó con éxito.',
        data: {
          id: Number(conteoPasajeroSave.id),
          nombre:
            `${conteoPasajeroSave.id} ${conteoPasajeroSave.numeroSerieContador}` ||
            '',
        },
      };

      // Registro en la bitácora SUCCESS
      try {
        const querylogger = { createConteopasajeroDto };
        await this.bitacoraLogger.logToBitacora(
          'ConteoPasajeros',
          `Se creó un ConteoPasajeros con Numero de serie Contador: ${createConteopasajeroDto.numeroSerieContador} y Viaje ID: ${viaje.id}`,
          'CREATE',
          querylogger,
          idUser,
          23,
          EstatusEnumBitcora.SUCCESS,
        );
      } catch (_bitacoraError) {
        // Log del error de bitácora pero no afectar la respuesta
      }

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createConteopasajeroDto };
      await this.bitacoraLogger.logToBitacora(
        'ConteoPasajeros',
        `Error al crear ConteoPasajeros con Numero de serie Contador: ${createConteopasajeroDto.numeroSerieContador}`,
        'CREATE',
        querylogger,
        idUser,
        23,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      // Detectar errores de foreign key y proporcionar mensaje más claro
      if (
        error.message &&
        error.message.includes('foreign key constraint fails')
      ) {
        if (error.message.includes('FK_ConteoPasajeros_Contadores')) {
          throw new NotFoundException(
            `El contador con número de serie '${createConteopasajeroDto.numeroSerieContador}' no existe.`,
          );
        }
        if (error.message.includes('IdViaje')) {
          throw new NotFoundException(
            `No se pudo asociar el viaje al conteo de pasajeros. Verifique que existe un viaje activo para el contador '${createConteopasajeroDto.numeroSerieContador}'.`,
          );
        }
      }

      throw new InternalServerErrorException({
        message: 'Error al crear ConteoPasajeros',
      });
    }
  }

  //funcion para obtener los clientes hijos
  private async clienteHijos(cliente: number) {
    return clienteHijosDesdeSp(this.clienteRepository.manager, cliente);
  }

  /** null = SuperAdmin (sin filtro). [] = sin series en alcance. */
  private async seriesContadoresPermitidas(
    rol: number,
    cliente: number,
  ): Promise<string[] | null> {
    if (Number(rol) === 1) return null;
    const hijos = await this.clienteHijos(cliente);
    const ids: number[] = Array.isArray((hijos as any).ids)
      ? (hijos as any).ids
      : [];
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = await this.contadoresRepository.query(
      `SELECT NumeroSerie AS serie FROM Contadores WHERE IdCliente IN (${placeholders})`,
      ids,
    );
    return rows.map((r: any) => r.serie).filter(Boolean);
  }

  private async consultarConteoPasajerosPaginado(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
SELECT
    cp.Id AS id,
    cp.Entradas AS entradas,
    cp.Salidas AS salidas,
    cp.Diferencia AS diferencia,
    cp.FechaHora AS fechaHora,
    cp.FHRegistro AS fhRegistro,
    cp.NumeroSerieContador AS NumeroSerieContador,
    bv.Marca AS marcaContador,
    bv.Modelo AS modeloContador,
    c.Id AS idCliente,
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY cp.Id DESC
LIMIT ? OFFSET ?;
    `;
    return this.conteopasajeroRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalConteoPasajerosPaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.conteopasajeroRepository.query(query, [...ids]);
  }

  private async consultarConteoPasajerosPaginadoCL(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const query = `
SELECT
    cp.Id AS id,
    cp.Entradas AS entradas,
    cp.Salidas AS salidas,
    cp.Diferencia AS diferencia,
    cp.FechaHora AS fechaHora,
    cp.FHRegistro AS fhRegistro,
    cp.NumeroSerieContador AS NumeroSerieContador,
    bv.Marca AS marcaContador,
    bv.Modelo AS modeloContador,
    c.Id AS idCliente,
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id

WHERE c.Id = ?   -- 🔹 aquí colocas el ID del cliente que quieres consultar

ORDER BY cp.Id DESC
LIMIT ? OFFSET ?;
    `;
    return this.conteopasajeroRepository.query(query, [cliente, limit, offset]);
  }

  private async consultarTotalConteoPasajerosPaginadosCl(cliente: number) {
    const query = `  
    SELECT COUNT(*) AS total
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id

WHERE c.Id = ?   -- 🔹 aquí colocas el ID del cliente que quieres consultar
`;
    return await this.conteopasajeroRepository.query(query, [cliente]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      let conteoPasajeros;
      const offset = (page - 1) * limit;
      let totalResult;
      switch (rol) {
        case 1:
          conteoPasajeros = await this.conteopasajeroRepository.query(
            `
SELECT
    cp.Id AS id,
    cp.Entradas AS entradas,
    cp.Salidas AS salidas,
    cp.Diferencia AS diferencia,
    cp.FechaHora AS fechaHora,
    cp.FHRegistro AS fhRegistro,
    cp.NumeroSerieContador AS NumeroSerieContador,
    bv.Marca AS marcaContador,
    bv.Modelo AS modeloContador,
    c.Id AS idCliente,
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id

ORDER BY cp.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.conteopasajeroRepository.query(
            `
  SELECT COUNT(*) AS total
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id

  `,
          );
          break;

        case 3:
        default:
          // Cualquier otro rol (actual o nuevo): filtrar por idCliente + hijos
          conteoPasajeros = await this.consultarConteoPasajerosPaginado(
            cliente,
            limit,
            offset,
          );
          totalResult =
            await this.consultarTotalConteoPasajerosPaginados(cliente);
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      const data = conteoPasajeros.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      const result: ApiResponseCommon = {
        data: data,
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
        message: 'Error al obtener conteo pasajeros',
      });
    }
  }

  private async consultarConteoPasajerosPaginadoRango(
    fechaInicio: string,
    fechaFin: string,
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
-- Parámetros:
-- :fechaInicio -> '2025-11-01'
-- :fechaFin -> '2025-11-14'
-- :limit -> cantidad de registros por página
-- :offset -> (page - 1) * limit

SELECT
    cp.Id AS id,
    cp.Entradas AS entradas,
    cp.Salidas AS salidas,
    cp.Diferencia AS diferencia,
    cp.FechaHora AS fechaHora,
    cp.FHRegistro AS fhRegistro,
    cp.NumeroSerieContador AS NumeroSerieContador,
    bv.Marca AS marcaContador,
    bv.Modelo AS modeloContador,
    c.Id AS idCliente,
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id
WHERE cp.FechaHora BETWEEN ? AND ?
AND c.Id IN (${placeholders})

ORDER BY cp.FechaHora DESC
LIMIT ? OFFSET ?;
    `;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return this.conteopasajeroRepository.query(query, [
      from,
      to,
      ...ids,
      limit,
      offset,
    ]);
  }

  private async consultarTotalConteoPasajerosPaginadosRango(
    fechaInicio: string,
    fechaFin: string,
    cliente: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id
WHERE cp.FechaHora BETWEEN ? AND ?
AND c.Id IN (${placeholders})
`;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return await this.conteopasajeroRepository.query(query, [from, to, ...ids]);
  }

  private async consultarConteoPasajerosPaginadoRangoCL(
    fechaInicio: string,
    fechaFin: string,
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const query = `
-- Parámetros:
-- :fechaInicio -> '2025-11-01'
-- :fechaFin -> '2025-11-14'
-- :limit -> cantidad de registros por página
-- :offset -> (page - 1) * limit

SELECT
    cp.Id AS id,
    cp.Entradas AS entradas,
    cp.Salidas AS salidas,
    cp.Diferencia AS diferencia,
    cp.FechaHora AS fechaHora,
    cp.FHRegistro AS fhRegistro,
    cp.NumeroSerieContador AS NumeroSerieContador,
    bv.Marca AS marcaContador,
    bv.Modelo AS modeloContador,
    c.Id AS idCliente,
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id
WHERE cp.FechaHora BETWEEN ? AND ?
AND c.Id = ?

ORDER BY cp.FechaHora DESC
LIMIT ? OFFSET ?;
    `;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return this.conteopasajeroRepository.query(query, [
      from,
      to,
      cliente,
      limit,
      offset,
    ]);
  }

  private async consultarTotalConteoPasajerosPaginadosRangoCl(
    fechaInicio: string,
    fechaFin: string,
    cliente: number,
  ) {
    const query = `  
    SELECT COUNT(*) AS total
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id
WHERE cp.FechaHora BETWEEN ? AND ?
AND c.Id = ?
`;
    const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
    return await this.conteopasajeroRepository.query(query, [
      from,
      to,
      cliente,
    ]);
  }

  async findAllList(cliente: number, rol: number): Promise<ApiResponseCommon> {
    try {
      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (series && series.length === 0) {
        return { data: [] };
      }
      const conteopasajero = await this.conteopasajeroRepository.find({
        where: series ? { numeroSerieContador: In(series) } : {},
        order: { fechaHora: 'DESC' },
      });
      if (conteopasajero.length === 0) {
        throw new NotFoundException('ConteoPasajeros no encontrado');
      }

      const data = conteopasajero.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros',
      });
    }
  }

  // ========================================
  // 🔹 OBTENER UN DATO CONTEOPASAJEROS
  // ========================================
  async findOne(id: number, cliente = 0, rol = 1) {
    try {
      const conteopasajero = await this.conteopasajeroRepository.findOne({
        where: { id: id },
      });
      if (!conteopasajero) {
        throw new NotFoundException('ConteoPasajeros no encontrado');
      }

      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (
        series &&
        !series.includes(String(conteopasajero.numeroSerieContador))
      ) {
        throw new NotFoundException('ConteoPasajeros no encontrado');
      }

      conteopasajero.id = Number(conteopasajero.id);
      return { data: conteopasajero };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros',
      });
    }
  }

  // MÉTODOS CON PAGINACIÓN
  async findByDatePaginated(
    fecha: string,
    page: number,
    limit: number,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      const day = assertIsoDate(fecha, 'fecha');
      const startDate = new Date(`${day}T00:00:00`);
      const endDate = new Date(`${day}T23:59:59`);
      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (series && series.length === 0) {
        return {
          data: [],
          paginated: { total: 0, page, lastPage: 0 },
        };
      }

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: {
          fechaHora: Between(startDate, endDate),
          ...(series ? { numeroSerieContador: In(series) } : {}),
        },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros por fecha',
      });
    }
  }

  // ========================================
  // 🔹 OBTENER DATOS DE UN RANGO DE FECHAS
  // ========================================
  async findByDateRangePaginated(
    idUser: number,
    cliente: number,
    rol: number,
    fechaInicio: string,
    fechaFin: string,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      let conteoPasajeros;
      const offset = (page - 1) * limit;
      let totalResult;
      const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
      switch (rol) {
        case 1:
          conteoPasajeros = await this.conteopasajeroRepository.query(
            `
-- Parámetros:
-- :fechaInicio -> '2025-11-01'
-- :fechaFin -> '2025-11-14'
-- :limit -> cantidad de registros por página
-- :offset -> (page - 1) * limit

SELECT
    cp.Id AS id,
    cp.Entradas AS entradas,
    cp.Salidas AS salidas,
    cp.Diferencia AS diferencia,
    cp.FechaHora AS fechaHora,
    cp.FHRegistro AS fhRegistro,
    cp.NumeroSerieContador AS NumeroSerieContador,
    bv.Marca AS marcaContador,
    bv.Modelo AS modeloContador,
    c.Id AS idCliente,
    CONCAT(
        c.Nombre,
        IFNULL(CONCAT(' ', c.ApellidoPaterno), ''),
        IFNULL(CONCAT(' ', c.ApellidoMaterno), '')
    ) AS NombreCompletoCliente
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id
WHERE cp.FechaHora BETWEEN ? AND ?

ORDER BY cp.FechaHora DESC
LIMIT ? OFFSET ?;
        `,
            [from, to, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.conteopasajeroRepository.query(
            `
  SELECT COUNT(*) AS total
FROM ConteoPasajeros cp
INNER JOIN Contadores bv
    ON cp.NumeroSerieContador = bv.NumeroSerie
INNER JOIN Clientes c
    ON bv.IdCliente = c.Id
WHERE cp.FechaHora BETWEEN ? AND ?

  `,
            [from, to],
          );
          break;

        case 3:
        default:
          // Cualquier otro rol (actual o nuevo): filtrar por idCliente + hijos
          conteoPasajeros = await this.consultarConteoPasajerosPaginadoRango(
            fechaInicio,
            fechaFin,
            cliente,
            limit,
            offset,
          );
          totalResult = await this.consultarTotalConteoPasajerosPaginadosRango(
            fechaInicio,
            fechaFin,
            cliente,
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);

      const data = conteoPasajeros.map((item) => ({
        ...item,
        id: Number(item.id),
        idCliente: Number(item.idCliente),
      }));

      const result: ApiResponseCommon = {
        data: data,
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
        message: 'Error al obtener conteo pasajeros',
      });
    }
  }

  // ⏰ 3. OBTENER DATOS DE UNA HORA ESPECÍFICA
  async findByDateTimePaginated(
    fecha: string,
    hora: string,
    page: number,
    limit: number,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      const day = assertIsoDate(fecha, 'fecha');
      if (!/^\d{2}$/.test(String(hora))) {
        throw new BadRequestException('hora debe tener formato HH');
      }
      const dateTime = new Date(`${day}T${hora}:00`);
      const endDateTime = new Date(`${day}T${hora}:59`);
      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (series && series.length === 0) {
        return {
          data: [],
          paginated: { total: 0, page, lastPage: 0 },
        };
      }

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: {
          fechaHora: Between(dateTime, endDateTime),
          ...(series ? { numeroSerieContador: In(series) } : {}),
        },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros por fecha y hora',
      });
    }
  }

  // 📊 4. OBTENER DATOS DE HOY
  async findTodayPaginated(
    page: number,
    limit: number,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));
      const endOfDay = new Date(today.setHours(23, 59, 59, 999));
      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (series && series.length === 0) {
        return {
          data: [],
          paginated: { total: 0, page, lastPage: 0 },
        };
      }

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: {
          fechaHora: Between(startOfDay, endOfDay),
          ...(series ? { numeroSerieContador: In(series) } : {}),
        },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros de hoy',
      });
    }
  }

  // 📅 5. OBTENER DATOS DE LA ÚLTIMA SEMANA
  async findLastWeekPaginated(
    page: number,
    limit: number,
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      const today = new Date();
      const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (series && series.length === 0) {
        return {
          data: [],
          paginated: { total: 0, page, lastPage: 0 },
        };
      }

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: {
          fechaHora: MoreThanOrEqual(lastWeek),
          ...(series ? { numeroSerieContador: In(series) } : {}),
        },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros de la última semana',
      });
    }
  }

  // 🔍 6. BUSCAR CON FILTROS ESPECÍFICOS + FECHA
  async findByContadorAndDatePaginated(
    numeroSerie: string,
    fechaInicio: string,
    fechaFin: string,
    page: number,
    limit: number,
    cliente = 0,
    rol = 1,
  ): Promise<ApiResponseCommon> {
    try {
      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (series && !series.includes(String(numeroSerie))) {
        throw new NotFoundException('ConteoPasajeros no encontrado');
      }

      const { from, to } = dateTimeBounds(fechaInicio, fechaFin);
      const startDate = new Date(from);
      const endDate = new Date(to);

      const [data, total] = await this.conteopasajeroRepository.findAndCount({
        where: {
          numeroSerieContador: numeroSerie,
          fechaHora: Between(startDate, endDate),
        },
        skip: (page - 1) * limit,
        take: limit,
        order: { fechaHora: 'DESC' },
      });

      const conteoPasajeros = data.map((item) => ({
        id: Number(item.id),
        entradas: item.entradas,
        salidas: item.salidas,
        diferencia: item.diferencia,
        fechaHora: item.fechaHora,
        fhRegistro: item.fhRegistro,
        numeroSerieContador: item.numeroSerieContador,
        idViaje: item.idViaje != null ? Number(item.idViaje) : null,
        estatus: item.estatus,
      }));

      return {
        data: conteoPasajeros,
        paginated: {
          total: total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener conteo pasajeros por Contador y fecha',
      });
    }
  }

  // 📈 7. OBTENER RESUMEN POR HORAS DE UN DÍA
  async getHourlySummary(
    fecha: string,
    cliente: number,
    rol: number,
  ): Promise<any[]> {
    const day = assertIsoDate(fecha, 'fecha');
    const startDate = `${day} 00:00:00`;
    const endDate = `${day} 23:59:59`;
    const series = await this.seriesContadoresPermitidas(rol, cliente);
    if (series && series.length === 0) return [];

    const qb = this.conteopasajeroRepository
      .createQueryBuilder('cp')
      .select([
        'HOUR(cp.fechaHora) as hora',
        'SUM(cp.entradas) as totalEntradas',
        'SUM(cp.salidas) as totalSalidas',
        'SUM(cp.diferencia) as totalDiferencia',
        'COUNT(*) as registros',
      ])
      .where('cp.fechaHora BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    if (series) {
      qb.andWhere('cp.numeroSerieContador IN (:...series)', { series });
    }
    return qb.groupBy('HOUR(cp.fechaHora)').orderBy('hora', 'ASC').getRawMany();
  }

  // 📊 8. OBTENER RESUMEN DIARIO DE UN MES
  async getDailySummary(
    year: number,
    month: number,
    cliente: number,
    rol: number,
  ): Promise<any[]> {
    const series = await this.seriesContadoresPermitidas(rol, cliente);
    if (series && series.length === 0) return [];

    const qb = this.conteopasajeroRepository
      .createQueryBuilder('cp')
      .select([
        'DATE(cp.fechaHora) as fecha',
        'SUM(cp.entradas) as totalEntradas',
        'SUM(cp.salidas) as totalSalidas',
        'SUM(cp.diferencia) as totalDiferencia',
        'COUNT(*) as registros',
      ])
      .where('YEAR(cp.fechaHora) = :year AND MONTH(cp.fechaHora) = :month', {
        year,
        month,
      });
    if (series) {
      qb.andWhere('cp.numeroSerieContador IN (:...series)', { series });
    }
    return qb.groupBy('DATE(cp.fechaHora)').orderBy('fecha', 'ASC').getRawMany();
  }

  // ========================================
  // 🔹 ACTUALIZAR CONTEOPASAJERO
  // ========================================
  async update(
    updateConteoPasajerosDto: UpdateConteoPasajerosDto,
    idUser: number,
    cliente = 0,
    rol = 1,
  ) {
    try {
      const series = await this.seriesContadoresPermitidas(rol, cliente);
      if (
        series &&
        !series.includes(String(updateConteoPasajerosDto.numeroSerieContador))
      ) {
        throw new NotFoundException(
          `No se encontró un conteo activo para el contador con número de serie '${updateConteoPasajerosDto.numeroSerieContador}'.`,
        );
      }

      // Buscar el conteo activo por numeroSerieContador (el más reciente)
      const conteoPasajero = await this.conteopasajeroRepository.findOne({
        where: {
          numeroSerieContador: updateConteoPasajerosDto.numeroSerieContador,
          estatus: EstatusConteo.ACTIVO,
        },
        order: {
          fechaHora: 'DESC', // Obtener el más reciente
        },
      });

      if (!conteoPasajero) {
        throw new NotFoundException(
          `No se encontró un conteo activo para el contador con número de serie '${updateConteoPasajerosDto.numeroSerieContador}'.`,
        );
      }

      // Obtener valores actuales
      let nuevasEntradas = conteoPasajero.entradas || 0;
      let nuevasSalidas = conteoPasajero.salidas || 0;

      // Verificar si subidas o bajadas tienen valores válidos (diferentes de null, undefined y 0)
      const tieneSubidas =
        updateConteoPasajerosDto.subidas !== null &&
        updateConteoPasajerosDto.subidas !== undefined &&
        updateConteoPasajerosDto.subidas !== 0;

      const tieneBajadas =
        updateConteoPasajerosDto.bajadas !== null &&
        updateConteoPasajerosDto.bajadas !== undefined &&
        updateConteoPasajerosDto.bajadas !== 0;

      // Lógica de actualización
      if (tieneSubidas && updateConteoPasajerosDto.subidas !== undefined) {
        // Si viene subidas con valor, sumarlo
        nuevasEntradas += updateConteoPasajerosDto.subidas;
      }

      if (tieneBajadas && updateConteoPasajerosDto.bajadas !== undefined) {
        // Si viene bajadas con valor, sumarlo
        nuevasSalidas += updateConteoPasajerosDto.bajadas;
      }

      // Si subidas y bajadas NO tienen valores válidos, usar el flag esSubida
      if (
        !tieneSubidas &&
        !tieneBajadas &&
        updateConteoPasajerosDto.esSubida !== null &&
        updateConteoPasajerosDto.esSubida !== undefined
      ) {
        // Si viene el flag esSubida, usar ese flujo
        if (updateConteoPasajerosDto.esSubida === true) {
          nuevasEntradas += 1;
        } else {
          nuevasSalidas += 1;
        }
      }

      // Calcular la diferencia
      const nuevaDiferencia = nuevasEntradas - nuevasSalidas;

      // Actualizar los datos usando save() para asegurar que se actualice correctamente
      conteoPasajero.entradas = nuevasEntradas;
      conteoPasajero.salidas = nuevasSalidas;
      conteoPasajero.diferencia = nuevaDiferencia;

      const conteoActualizado =
        await this.conteopasajeroRepository.save(conteoPasajero);

      // Verificar que se actualizó correctamente
      if (!conteoActualizado || !conteoActualizado.id) {
        throw new InternalServerErrorException(
          'No se pudo actualizar el registro de ConteoPasajero.',
        );
      }

      // Obtener el contador para la bitácora
      const contador = await this.contadoresRepository.findOne({
        where: { numeroSerie: updateConteoPasajerosDto.numeroSerieContador },
      });

      if (contador) {
        const _usuario = await this.usuariosRepository.findOne({
          where: { idCliente: contador.idCliente, idRol: 2 },
        });

        // Registro en la bitácora SUCCESS
        const querylogger = { updateConteoPasajerosDto };
        await this.bitacoraLogger.logToBitacora(
          'ConteoPasajeros',
          `Se actualizó un ConteoPasajeros con ID ${conteoPasajero.id}, Numero de serie Contador: ${updateConteoPasajerosDto.numeroSerieContador}`,
          'UPDATE',
          querylogger,
          idUser,
          EnumModulos.CONTEOPASAJEROS,
          EstatusEnumBitcora.SUCCESS,
        );
      }

      // API response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'ConteoPasajero fue actualizada correctamente',
        data: {
          id: conteoPasajero.id,
          nombre: `ConteoPasajero ${conteoPasajero.id} `,
        },
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar conteopasajero',
      });
    }
  }

  // ========================================
  // 🔹 OBTENER CONTEOS AGRUPADOS POR VIAJE EN RANGO DE FECHAS
  // ========================================
  async findByDateRangeAgrupadoPorViaje(
    idUser: number,
    cliente: number,
    rol: number,
    fechaInicio: string,
    fechaFin: string,
  ): Promise<ApiResponseCommon> {
    try {
      let resultados;
      const { from, to } = dateTimeBounds(fechaInicio, fechaFin);

      switch (rol) {
        case 1:
          // Rol 1 (SuperAdministrador) puede ver todo
          resultados = await this.conteopasajeroRepository.query(
            `
            SELECT 
              cp.IdViaje AS idViaje,
              SUM(cp.Diferencia) AS diferencia,
              SUM(cp.Entradas) AS subidas,
              SUM(cp.Salidas) AS bajadas,
              COUNT(*) AS cantidadRegistros
            FROM ConteoPasajeros cp
            WHERE cp.FechaHora BETWEEN ? AND ?
              AND cp.IdViaje IS NOT NULL
            GROUP BY cp.IdViaje
            ORDER BY cp.IdViaje DESC
            `,
            [from, to],
          );
          break;

        case 3:
        default:
          // Cualquier otro rol (actual o nuevo): filtrar por idCliente + hijos
          const { ids, placeholders } = await this.clienteHijos(cliente);
          if (ids.length === 0) {
            return { data: [] };
          }

          resultados = await this.conteopasajeroRepository.query(
            `
            SELECT 
              cp.IdViaje AS idViaje,
              SUM(cp.Diferencia) AS diferencia,
              SUM(cp.Entradas) AS subidas,
              SUM(cp.Salidas) AS bajadas,
              COUNT(*) AS cantidadRegistros
            FROM ConteoPasajeros cp
            INNER JOIN Contadores bv ON cp.NumeroSerieContador = bv.NumeroSerie
            INNER JOIN Clientes c ON bv.IdCliente = c.Id
            WHERE cp.FechaHora BETWEEN ? AND ?
              AND cp.IdViaje IS NOT NULL
              AND c.Id IN (${placeholders})
            GROUP BY cp.IdViaje
            ORDER BY cp.IdViaje DESC
            `,
            [from, to, ...ids],
          );
          break;
      }

      // Formatear los resultados
      const data = resultados.map((item: any) => ({
        idViaje: Number(item.idViaje),
        diferencia: Number(item.diferencia || 0),
        subidas: Number(item.subidas || 0),
        bajadas: Number(item.bajadas || 0),
        cantidadRegistros: Number(item.cantidadRegistros || 0),
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
        message: 'Error al obtener conteos agrupados por viaje',
      });
    }
  }
}
