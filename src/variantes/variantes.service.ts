import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateVarianteDto } from './dto/create-variante.dto';
import { UpdateVarianteDto } from './dto/update-variante.dto';
import { generarRecorridoDetallado } from '../utils/recorrido.utils';
import {
  ApiResponseCommon,
  ApiVarianteResponse,
  EstatusEnumBitcora,
} from '../common/ApiResponse';
import { InjectRepository } from '@nestjs/typeorm';
import { Rutas } from 'src/entities/Rutas';
import { Repository } from 'typeorm';
import { Variantes } from 'src/entities/Variantes';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { UpdateVariantesEstatusDto } from './dto/update-variante-estatus.dto';
import { Clientes } from 'src/entities/Clientes';
import { CatTipoVariante } from 'src/entities/CatTipoVariante';

@Injectable()
export class VariantesService {
  constructor(
    @InjectRepository(Rutas)
    private readonly rutasRepository: Repository<Rutas>,
    @InjectRepository(UsuariosZonas)
    private readonly usuarioszonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Variantes)
    private readonly variantesRepository: Repository<Variantes>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(CatTipoVariante)
    private readonly catTipoVarianteRepository: Repository<CatTipoVariante>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    cliente: number,
    rol: number,
    createVarianteDto: CreateVarianteDto,
  ) {
    try {
      const { recorridoDetallado: puntos } = createVarianteDto;

      // Si no viene idTipoVariante, asignar 1 por defecto
      const idTipoVariante = createVarianteDto.idTipoVariante || 1;

      const newVariante = await this.variantesRepository.create({
        ...createVarianteDto,
        idTipoVariante: idTipoVariante,
      });

      // Aplicamos interpolación
      const { recorridoDetallado, distanciaKm: _distanciaKm } =
        await generarRecorridoDetallado(puntos as any);

      newVariante.recorridoInterpolar = recorridoDetallado;

      const varianteSave = await this.variantesRepository.save(newVariante);

      // Si registraRegreso es true, crear la variante de regreso
      if (createVarianteDto.registraRegreso === true) {
        // Hacer una copia del recorridoDetallado y aplicar reverse
        const recorridoDetalladoRegreso = [...puntos].reverse();

        // Crear datos de la variante de regreso
        const varianteRegresoData = {
          nombre: `${createVarianteDto.nombre} Regreso`,
          puntoInicio: createVarianteDto.puntoFin || null,
          puntoFin: createVarianteDto.puntoInicio || null,
          recorridoDetallado: recorridoDetalladoRegreso,
          distanciaKm: createVarianteDto.distanciaKm || null,
          estatus: createVarianteDto.estatus || 1,
          idRuta: createVarianteDto.idRuta,
          idVarianteIda: varianteSave.id,
          idTipoVariante: idTipoVariante,
        };

        const newVarianteRegreso =
          await this.variantesRepository.create(varianteRegresoData);

        // Aplicar interpolación a la variante de regreso
        const {
          recorridoDetallado: recorridoInterpolarRegreso,
          distanciaKm: distanciaKmRegreso,
        } = await generarRecorridoDetallado(recorridoDetalladoRegreso as any);

        newVarianteRegreso.recorridoInterpolar = recorridoInterpolarRegreso;
        if (distanciaKmRegreso) {
          newVarianteRegreso.distanciaKm = distanciaKmRegreso;
        }

        const varianteRegresoSave =
          await this.variantesRepository.save(newVarianteRegreso);

        // La variante original mantiene idVarianteIda en null
        // Solo la variante de regreso tiene idVarianteIda apuntando a la original

        // Registro en la bitácora SUCCESS para ambas variantes
        const querylogger = {
          createVarianteDto,
          varianteRegreso: varianteRegresoData,
        };
        await this.bitacoraLogger.logToBitacora(
          'Variantes',
          `Se creó un Variante con nombre: ${varianteSave.nombre} (Id: ${varianteSave.id}) y su variante de regreso: ${varianteRegresoSave.nombre} (Id: ${varianteRegresoSave.id})`,
          'CREATE',
          querylogger,
          idUser,
          18,
          EstatusEnumBitcora.SUCCESS,
        );

        // API response
        const result: any = {
          status: 'succes',
          message: 'Se creo correctamente Variante y variante de regreso',
          id: Number(varianteSave.id),
          nombre: varianteSave.nombre,
          distancia: Number(varianteSave.distanciaKm),
          estatus: varianteSave.estatus,
          idVarianteIda: Number(varianteRegresoSave.id),
          nombreVarianteRegreso: varianteRegresoSave.nombre,
          distanciaVarianteRegreso: Number(varianteRegresoSave.distanciaKm),
        };

        return result;
      }

      // Registro en la bitácora SUCCESS
      const querylogger = { createVarianteDto };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se creó un Variante con nombre: ${varianteSave.nombre} y Id: ${varianteSave.id}`,
        'CREATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiVarianteResponse = {
        status: 'succes',
        message: 'Se creo correctamente Variante',
        id: Number(varianteSave.id),
        nombre: varianteSave.nombre,
        distancia: Number(varianteSave.distanciaKm),
        estatus: varianteSave.estatus,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { createVarianteDto };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se creó un Variante con nombre: ${createVarianteDto.nombre}`,
        'CREATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al crear Variante',
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

  private async consultarVariantePaginado(
    cliente: number,
    limit: number,
    offset: number,
  ) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
  SELECT 
    -- Datos del Variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zona de inicio
    r.Id AS idZonaInicio,
    r.Nombre AS nombreZonaInicio,
    r.Descripcion AS descripcionZonaInicio,
    r.FechaCreacion AS fechaCreacionZonaInicio,
    r.FechaActualizacion AS fechaActualizacionZonaInicio,
    r.Estatus AS estatusZonaInicio,

    -- Zona de fin
    rf.Id AS idZonaFin,
    rf.Nombre AS nombreZonaFin,
    rf.Descripcion AS descripcionZonaFin,
    rf.FechaCreacion AS fechaCreacionZonaFin,
    rf.FechaActualizacion AS fechaActualizacionZonaFin,
    rf.Estatus AS estatusZonaFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas

ORDER BY d.Id DESC

  LIMIT ? OFFSET ?;
    `;
    return this.usuarioszonasRepository.query(query, [...ids, limit, offset]);
  }

  private async consultarTotalVariantePaginados(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `  
    SELECT COUNT(*) AS total
FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas
`;
    return await this.usuarioszonasRepository.query(query, [...ids]);
  }

  async findAll(
    idUser: number,
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
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
    -- Datos del Variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zona de inicio
    r.Id AS idZonaInicio,
    r.Nombre AS nombreZonaInicio,
    r.Descripcion AS descripcionZonaInicio,
    r.FechaCreacion AS fechaCreacionZonaInicio,
    r.FechaActualizacion AS fechaActualizacionZonaInicio,
    r.Estatus AS estatusZonaInicio,

    -- Zona de fin
    rf.Id AS idZonaFin,
    rf.Nombre AS nombreZonaFin,
    rf.Descripcion AS descripcionZonaFin,
    rf.FechaCreacion AS fechaCreacionZonaFin,
    rf.FechaActualizacion AS fechaActualizacionZonaFin,
    rf.Estatus AS estatusZonaFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas

ORDER BY d.Id DESC

  LIMIT ? OFFSET ?;
  `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioszonasRepository.query(
            `
SELECT COUNT(*) AS total
FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1  
  `,
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          data = await this.consultarVariantePaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalVariantePaginados(cliente);
          break;

        case 3:
          // Consulta de datos paginados Usuario Operador
          data = await this.consultarVariantePaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalVariantePaginados(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarVariantePaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalVariantePaginados(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          data = await this.consultarVariantePaginado(cliente, limit, offset);

          // Query para total (sin paginación)
          totalResult = await this.consultarTotalVariantePaginados(cliente);
          break;

        default:
          // Consulta de datos paginados Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          data = await this.usuarioszonasRepository.query(
            `
  SELECT 
    -- Datos del Variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zona de inicio
    r.Id AS idZonaInicio,
    r.Nombre AS nombreZonaInicio,
    r.Descripcion AS descripcionZonaInicio,
    r.FechaCreacion AS fechaCreacionZonaInicio,
    r.FechaActualizacion AS fechaActualizacionZonaInicio,
    r.Estatus AS estatusZonaInicio,

    -- Zona de fin
    rf.Id AS idZonaFin,
    rf.Nombre AS nombreZonaFin,
    rf.Descripcion AS descripcionZonaFin,
    rf.FechaCreacion AS fechaCreacionZonaFin,
    rf.FechaActualizacion AS fechaActualizacionZonaFin,
    rf.Estatus AS estatusZonaFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

  FROM Variantes d
  INNER JOIN Rutas ru ON d.IdRuta = ru.Id
  INNER JOIN Zonas r ON ru.IdZona = r.Id
  LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
  INNER JOIN Clientes c ON r.IdCliente = c.Id
  INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

  WHERE ur.IdUsuario = ?
    AND ur.Estatus = 1
    AND r.Estatus = 1
    AND ru.Estatus = 1
    AND c.Id = IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar

  ORDER BY d.Id DESC
  LIMIT ? OFFSET ?
  `,
            [idUser, ...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.usuarioszonasRepository.query(
            `
SELECT COUNT(*) AS total
FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id
WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND r.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  `,
            [idUser, ...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total ?? 0);

      const Variantes = data.map((item) => ({
        ...item,
        id: Number(item.id),
        idRuta: Number(item.idRuta),
        idZonaInicio: Number(item.idZonaInicio),
        idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      // Transformación de resultados
      const result: ApiResponseCommon = {
        data: Variantes,
        paginated: {
          total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Error al obtener paginado Variantes',
        error: error.message,
      });
    }
  }

  private async consultarVarianteListado(cliente: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
  SELECT 
    -- Datos del Variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zona de inicio
    r.Id AS idZonaInicio,
    r.Nombre AS nombreZonaInicio,
    r.Descripcion AS descripcionZonaInicio,
    r.FechaCreacion AS fechaCreacionZonaInicio,
    r.FechaActualizacion AS fechaActualizacionZonaInicio,
    r.Estatus AS estatusZonaInicio,

    -- Zona de fin
    rf.Id AS idZonaFin,
    rf.Nombre AS nombreZonaFin,
    rf.Descripcion AS descripcionZonaFin,
    rf.FechaCreacion AS fechaCreacionZonaFin,
    rf.FechaActualizacion AS fechaActualizacionZonaFin,
    rf.Estatus AS estatusZonaFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND c.Estatus = 1
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas
  AND d.Estatus = 1

ORDER BY d.Id DESC;
    `;
    return this.usuarioszonasRepository.query(query, [...ids]);
  }

  async findAllList(idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuarioszonasRepository.query(
            `
  SELECT 
    -- Datos del Variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zona de inicio
    r.Id AS idZonaInicio,
    r.Nombre AS nombreZonaInicio,
    r.Descripcion AS descripcionZonaInicio,
    r.FechaCreacion AS fechaCreacionZonaInicio,
    r.FechaActualizacion AS fechaActualizacionZonaInicio,
    r.Estatus AS estatusZonaInicio,

    -- Zona de fin
    rf.Id AS idZonaFin,
    rf.Nombre AS nombreZonaFin,
    rf.Descripcion AS descripcionZonaFin,
    rf.FechaCreacion AS fechaCreacionZonaFin,
    rf.FechaActualizacion AS fechaActualizacionZonaFin,
    rf.Estatus AS estatusZonaFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas
  AND d.Estatus = 1
  AND c.Estatus = 1

ORDER BY d.Id DESC;
      `,
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          data = await this.consultarVarianteListado(cliente);
          break;

        case 3:
          // Consulta de datos paginados Usuario Operador
          data = await this.consultarVarianteListado(cliente);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarVarianteListado(cliente);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          data = await this.consultarVarianteListado(cliente);
          break;

        default:
          // Consulta de datos paginados Usuario
          const { ids, placeholders: _placeholders } =
            await this.clienteHijos(cliente);
          data = await this.usuarioszonasRepository.query(
            `
      SELECT 
  -- Datos del Variante (datos principales)
  d.Id AS id,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.RecorridoDetallado AS recorridoDetallado,
  d.DistanciaKm AS distanciaKm,
  d.FechaCreacion AS fechaCreacionVariante,
  d.Estatus AS estatusVariante,

  -- Datos de la ruta asociada
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio AS nombreInicio,
  ru.NombreFin AS nombreFin,
  ru.FechaCreacion AS fechaCreacionRuta,
  ru.Estatus AS estatusRuta,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,
  r.Descripcion AS descripcionZonaInicio,
  r.FechaCreacion AS fechaCreacionZonaInicio,
  r.FechaActualizacion AS fechaActualizacionZonaInicio,
  r.Estatus AS estatusZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- Cliente relacionado
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

WHERE 
 ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND c.Estatus = 1
   

ORDER BY d.Id DESC;
      `,
            [idUser, ids], // parámetro seguro
          );
          break;
      }

      const Variantes = data.map((item) => ({
        ...item,
        id: Number(item.id),
        idRuta: Number(item.idRuta),
        idZonaInicio: Number(item.idZonaInicio),
        idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      // Transformación de resultados
      const result: ApiResponseCommon = {
        data: Variantes,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Error al obtener listado Variantes',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER VARIANTES POR RUTA
  // ========================================
  async findByRuta(idRuta: number, _idUser: number, _rol: number) {
    try {
      // Consulta directa de variantes por ruta (solo la ruta especificada)
      const variantes = await this.variantesRepository.query(
        `
SELECT 
  -- Datos del variante (datos principales)
  d.Id AS id,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.RecorridoDetallado AS recorridoDetallado,
  d.DistanciaKm AS distanciaKm,
  d.FechaCreacion AS fechaCreacionVariante,
  d.Estatus AS estatusVariante,

  -- Datos de la ruta asociada
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio AS nombreInicio,
  ru.NombreFin AS nombreFin,
  ru.FechaCreacion AS fechaCreacionRuta,
  ru.Estatus AS estatusRuta,

  -- Región de inicio
  r.Id AS idRegionInicio,
  r.Nombre AS nombreRegionInicio,
  r.Descripcion AS descripcionRegionInicio,
  r.FechaCreacion AS fechaCreacionRegionInicio,
  r.FechaActualizacion AS fechaActualizacionRegionInicio,
  r.Estatus AS estatusRegionInicio,

  -- Región de fin
  rf.Id AS idRegionFin,
  rf.Nombre AS nombreRegionFin,
  rf.Descripcion AS descripcionRegionFin,
  rf.FechaCreacion AS fechaCreacionRegionFin,
  rf.FechaActualizacion AS fechaActualizacionRegionFin,
  rf.Estatus AS estatusRegionFin,

  -- Cliente relacionado
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE 
  d.IdRuta = ?
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Estatus = 1
  AND c.Estatus = 1

ORDER BY d.Id DESC
        `,
        [idRuta],
      );

      // Mapeo de resultados con conversión de tipos
      const data = variantes.map((item) => ({
        ...item,
        id: Number(item.id),
        idRuta: Number(item.idRuta),
        idRegionInicio: Number(item.idRegionInicio),
        idRegionFin: item.idRegionFin ? Number(item.idRegionFin) : null,
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      // API response
      const result: ApiResponseCommon = {
        data: data,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener variantes por ruta',
        error: error.message,
      });
    }
  }

  private async consultarVarianteByRuta(cliente: number, id: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
  SELECT 
    -- Datos del Variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zona de inicio
    r.Id AS idZonaInicio,
    r.Nombre AS nombreZonaInicio,
    r.Descripcion AS descripcionZonaInicio,
    r.FechaCreacion AS fechaCreacionZonaInicio,
    r.FechaActualizacion AS fechaActualizacionZonaInicio,
    r.Estatus AS estatusZonaInicio,

    -- Zona de fin
    rf.Id AS idZonaFin,
    rf.Nombre AS nombreZonaFin,
    rf.Descripcion AS descripcionZonaFin,
    rf.FechaCreacion AS fechaCreacionZonaFin,
    rf.FechaActualizacion AS fechaActualizacionZonaFin,
    rf.Estatus AS estatusZonaFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas
  AND d.Estatus = 1
  AND d.Id = ?

ORDER BY d.Id DESC;
    `;
    return this.usuarioszonasRepository.query(query, [...ids, id]);
  }

  private async consultarVarianteOne(cliente: number, id: number) {
    const { ids, placeholders } = await this.clienteHijos(cliente);
    const query = `
  SELECT 
    -- Datos del Variante (datos principales)
    d.Id AS id,
    d.Nombre AS nombreVariante,
    d.PuntoInicio AS puntoInicio,
    d.PuntoFin AS puntoFin,
    d.RecorridoDetallado AS recorridoDetallado,
    d.DistanciaKm AS distanciaKm,
    d.FechaCreacion AS fechaCreacionVariante,
    d.Estatus AS estatusVariante,

    -- Datos de la ruta asociada
    ru.Id AS idRuta,
    ru.Nombre AS nombreRuta,
    ru.NombreInicio AS nombreInicio,
    ru.NombreFin AS nombreFin,
    ru.FechaCreacion AS fechaCreacionRuta,
    ru.Estatus AS estatusRuta,

    -- Zona de inicio
    r.Id AS idZonaInicio,
    r.Nombre AS nombreZonaInicio,
    r.Descripcion AS descripcionZonaInicio,
    r.FechaCreacion AS fechaCreacionZonaInicio,
    r.FechaActualizacion AS fechaActualizacionZonaInicio,
    r.Estatus AS estatusZonaInicio,

    -- Zona de fin
    rf.Id AS idZonaFin,
    rf.Nombre AS nombreZonaFin,
    rf.Descripcion AS descripcionZonaFin,
    rf.FechaCreacion AS fechaCreacionZonaFin,
    rf.FechaActualizacion AS fechaActualizacionZonaFin,
    rf.Estatus AS estatusZonaFin,

    -- Cliente relacionado
    c.Id AS idCliente,
    c.Nombre AS nombreCliente,
    c.ApellidoPaterno AS apellidoPaternoCliente,
    c.ApellidoMaterno AS apellidoMaternoCliente,
    c.Estatus AS estatusCliente,
    CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id

WHERE c.Id IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
  AND ru.Estatus = 1         -- Solo rutas activas
  AND r.Estatus = 1          -- Solo zonas activas
  AND d.Estatus = 1
  AND d.Id = ?

ORDER BY d.Id DESC;
    `;
    return this.usuarioszonasRepository.query(query, [...ids, id]);
  }

  async findOne(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let data;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          data = await this.usuarioszonasRepository.query(
            `
    SELECT 
  -- Datos del Variante (datos principales)
  d.Id AS id,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.RecorridoDetallado AS recorridoDetallado,
  d.RecorridoInterpolar AS recorridoInterpolar,
  d.DistanciaKm AS distanciaKm,
  d.FechaCreacion AS fechaCreacionVariante,
  d.FechaActualizacion AS fechaActualizacion,
  d.Estatus AS estatusVariante,

  -- Datos de la ruta asociada
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio AS nombreInicio,
  ru.NombreFin AS nombreFin,
  ru.FechaCreacion AS fechaCreacionRuta,
  ru.Estatus AS estatusRuta,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,
  r.Descripcion AS descripcionZonaInicio,
  r.FechaCreacion AS fechaCreacionZonaInicio,
  r.FechaActualizacion AS fechaActualizacionZonaInicio,
  r.Estatus AS estatusZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- Cliente relacionado
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Id = ? -- Id del Variante
      `,
            [idUser, id], // parámetro seguro
          );
          break;

        case 2:
          // Consulta de datos paginados Usuario Administrador
          data = await this.consultarVarianteOne(cliente, id);
          break;

        case 3:
          // Consulta de datos paginados Usuario Operador
          data = await this.consultarVarianteOne(cliente, id);
          break;

        case 8:
          // Consulta de datos paginados Usuario Reportes
          data = await this.consultarVarianteOne(cliente, id);
          break;

        case 10:
          // Consulta de datos paginados Usuario Capturista
          data = await this.consultarVarianteOne(cliente, id);
          break;

        default:
          // Consulta de datos paginados Usuario
          const { ids, placeholders } = await this.clienteHijos(cliente);
          data = await this.usuarioszonasRepository.query(
            `
    SELECT 
  -- Datos del Variante (datos principales)
  d.Id AS id,
  d.Nombre AS nombreVariante,
  d.PuntoInicio AS puntoInicio,
  d.PuntoFin AS puntoFin,
  d.RecorridoDetallado AS recorridoDetallado,
  d.RecorridoInterpolar AS recorridoInterpolar,
  d.DistanciaKm AS distanciaKm,
  d.FechaCreacion AS fechaCreacionVariante,
  d.FechaActualizacion AS fechaActualizacion,
  d.Estatus AS estatusVariante,

  -- Datos de la ruta asociada
  ru.Id AS idRuta,
  ru.Nombre AS nombreRuta,
  ru.NombreInicio AS nombreInicio,
  ru.NombreFin AS nombreFin,
  ru.FechaCreacion AS fechaCreacionRuta,
  ru.Estatus AS estatusRuta,

  -- Zona de inicio
  r.Id AS idZonaInicio,
  r.Nombre AS nombreZonaInicio,
  r.Descripcion AS descripcionZonaInicio,
  r.FechaCreacion AS fechaCreacionZonaInicio,
  r.FechaActualizacion AS fechaActualizacionZonaInicio,
  r.Estatus AS estatusZonaInicio,

  -- Zona de fin
  rf.Id AS idZonaFin,
  rf.Nombre AS nombreZonaFin,
  rf.Descripcion AS descripcionZonaFin,
  rf.FechaCreacion AS fechaCreacionZonaFin,
  rf.FechaActualizacion AS fechaActualizacionZonaFin,
  rf.Estatus AS estatusZonaFin,

  -- Cliente relacionado
  c.Id AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  c.Estatus AS estatusCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', c.ApellidoMaterno) AS nombreCompletoCliente

FROM Variantes d
INNER JOIN Rutas ru ON d.IdRuta = ru.Id
INNER JOIN Zonas r ON ru.IdZona = r.Id
LEFT JOIN Zonas rf ON ru.IdZonaFin = rf.Id
INNER JOIN Clientes c ON r.IdCliente = c.Id
INNER JOIN UsuariosZonas ur ON ur.IdZona = r.Id

WHERE ur.IdUsuario = ?
  AND ur.Estatus = 1
  AND r.Estatus = 1
  AND ru.Estatus = 1
  AND d.Id = ? -- Id del Variante
  AND c.Id = IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
      `,
            [idUser, id, ids], // parámetro seguro
          );
          break;
      }

      if (data.length === 0) {
        throw new NotFoundException('Variante no encontradas');
      }

      const variantes = data.map((item) => ({
        ...item,
        id: Number(item.id),
        idRuta: Number(item.idRuta),
        idZonaInicio: Number(item.idZonaInicio),
        idZonaFin: item.idZonaFin ? Number(item.idZonaFin) : null,
        idCliente: Number(item.idCliente),
        distanciaKm: Number(item.distanciaKm),
      }));

      return { data: variantes };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Error al obtener Variantes por ID',
        error: error.message,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateVariantesEstatusDto: UpdateVariantesEstatusDto,
  ) {
    try {
      const variante = await this.variantesRepository.findOne({
        where: { id: id },
      });
      if (!variante) throw new NotFoundException('Variante no encontrado');

      //actualizacion de estatus
      const estatus = updateVariantesEstatusDto.estatus;
      await this.variantesRepository.update(id, { estatus: estatus });

      // Registro en la bitácora SUCCESS
      const querylogger = { updateVariantesEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se actualizo estatus a ${updateVariantesEstatusDto.estatus} de un Variante con nombre: ${variante.nombre}  y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiVarianteResponse = {
        status: 'success',
        message: 'Se actualizo correctamente estatus del Variante',
        id: Number(variante.id),
        nombre: variante.nombre,
        distancia: Number(variante.distanciaKm),
        estatus: estatus,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateVariantesEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se actualizo estatus a ${updateVariantesEstatusDto.estatus} de un Variante con ID: ${id} y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Error al actualizar estatus Variantes',
        error: error.message,
      });
    }
  }

  async update(
    id: number,
    idUser: number,
    cliente: number,
    rol: number,
    updateVarianteDto: UpdateVarianteDto,
  ) {
    try {
      const newVariante = this.variantesRepository.create(updateVarianteDto);

      if (
        Array.isArray(updateVarianteDto.recorridoDetallado) &&
        updateVarianteDto.recorridoDetallado.length > 0
      ) {
        const puntos = updateVarianteDto.recorridoDetallado;

        const {
          recorridoDetallado: nuevoRecorrido,
          distanciaKm: _distanciaKm,
        } = await generarRecorridoDetallado(puntos as any);

        newVariante.recorridoInterpolar = nuevoRecorrido;
      }

      await this.variantesRepository.update(id, newVariante);

      // Obtenemos la variante actualizada
      const varianteActualizada = await this.variantesRepository.findOne({
        where: { id: id },
      });

      if (!varianteActualizada) {
        throw new NotFoundException(`Variante con id: ${id} no encontrada`);
      }

      // Registro en la bitácora SUCCESS
      const querylogger = { updateVarianteDto };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se actualizo un Variante con nombre: ${varianteActualizada.nombre} y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiVarianteResponse = {
        status: 'succes',
        message: 'Se actualizo correctamente Variante',
        id: id,
        nombre: varianteActualizada.nombre,
        distancia: Number(varianteActualizada.distanciaKm),
        estatus: varianteActualizada.estatus,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora ERROR
      const querylogger = { updateVarianteDto };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se actualizo un Variante con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar Variante',
        error: error.message,
      });
    }
  }

  async remove(id: number, idUser: number, _cliente: number, _rol: number) {
    try {
      const variante = await this.variantesRepository.findOne({
        where: { id: id },
      });
      if (!variante) throw new NotFoundException('Variante no encontrado');

      //eliminado logico
      await this.variantesRepository.update(id, { estatus: 0 });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se elimino estatus a ${0} de un Variante con nombre: ${variante.nombre} y Id ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiVarianteResponse = {
        status: 'succes',
        message: 'Se elimino correctamente el Variante',
        id: Number(variante.id),
        nombre: variante.nombre,
        distancia: Number(variante.distanciaKm),
        estatus: 0,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se elimino a estatus a ${0} de un Variante con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Error al eliminado logico Variantes',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER TIPOS DE VARIANTE
  // ========================================
  async findAllTiposVariante(): Promise<ApiResponseCommon> {
    try {
      const tiposVariante = await this.catTipoVarianteRepository.find({
        where: { estatus: 1 },
        order: { nombre: 'ASC' },
      });

      const data = tiposVariante.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
        fhRegistro: item.fhRegistro,
        estatus: Number(item.estatus),
      }));

      const result: ApiResponseCommon = {
        data: data,
      };

      return result;
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Error al obtener tipos de variante',
        error: error.message,
      });
    }
  }

  async removeTotal(id: number, idUser: number, cliente: number, rol: number) {
    try {
      let variante;
      switch (rol) {
        case 1:
        case 2:
          // Usuario SuperAdministrador y Administrador
          variante = await this.variantesRepository.findOne({
            where: { id: id },
          });
          if (!variante) throw new NotFoundException('Variante no encontrado');
          break;

        default:
          throw new BadRequestException(`Acceso denegado`);
          break;
      }

      //eliminado completo
      await this.variantesRepository.delete({ id: id });

      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se elimino  un Variante con nombre: ${variante.nombre} y Id ${id}`,
        'DELETE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.SUCCESS,
      );

      //API response
      const result: ApiVarianteResponse = {
        status: 'succes',
        message: 'Se elimino correctamente el Variante',
        id: Number(variante.id),
        nombre: variante.nombre,
        distancia: Number(variante.distanciaKm),
        estatus: 0,
      };

      return result;
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Variantes',
        `Se elimino Variante con ID: ${id}`,
        'DELETE',
        querylogger,
        idUser,
        18,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) throw error;

      throw new InternalServerErrorException({
        message: 'Error al eliminado total Variantes',
        error: error.message,
      });
    }
  }
}
