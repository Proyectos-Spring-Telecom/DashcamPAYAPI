import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateOperadoreDto } from './dto/create-operadore.dto';
import { UpdateOperadoreDto } from './dto/update-operadore.dto';
import { UpdateOperadorStatusDto } from './dto/update-operadores-estatus.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Operadores } from 'src/entities/Operadores';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { Clientes } from 'src/entities/Clientes';
import { Licencias } from 'src/entities/Licencias';
import { Usuarios } from 'src/entities/Usuarios';
import { EnumModulos, EstatusEnum } from 'src/common/estatus.enum';

@Injectable()
export class OperadoresService {
  constructor(
    @InjectRepository(Operadores)
    private readonly operadoresRepository: Repository<Operadores>,
    @InjectRepository(Clientes)
    private readonly clienteRepository: Repository<Clientes>,
    @InjectRepository(Licencias)
    private readonly licenciasRepository: Repository<Licencias>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  // ========================================
  // 🔹 CREAR UN OPERADOR
  // ========================================
  async createOperador(
    createOperadoreDto: CreateOperadoreDto,
    idUser: number,
  ): Promise<ApiCrudResponse> {
    try {
      const operadorExistente = await this.licenciasRepository.findOne({
        where: { numeroLicencia: createOperadoreDto.numeroLicencia },
      });
      if (operadorExistente) {
        throw new BadRequestException(
          `El operador con licencia número: ${createOperadoreDto.numeroLicencia} ya se encuentra registrado.`,
        );
      }
      const usuarioOperador = await this.operadoresRepository.findOne({
        where: { idUsuario: createOperadoreDto.idUsuario },
      });
      if (usuarioOperador) {
        throw new BadRequestException(
          `El usuario con ID ${createOperadoreDto.idUsuario} ya se encuentra registrado.`,
        );
      }

      //extraemos los valores para crear al operador
      const bodyOperador = {
        fechaNacimiento: createOperadoreDto.fechaNacimiento,
        identificacion: createOperadoreDto.identificacion,
        licencia: createOperadoreDto.licencia,
        numeroLicencia: createOperadoreDto.numeroLicencia,
        comprobanteDomicilio: createOperadoreDto.comprobanteDomicilio,
        certificadoMedico: createOperadoreDto.certificadoMedico,
        antecedentesNoPenales: createOperadoreDto.antecedentesNoPenales,
        estatus: EstatusEnum.ACTIVO,
        idUsuario: createOperadoreDto.idUsuario,
      };

      //creamos al operador
      const newOperador = await this.operadoresRepository.create(bodyOperador);
      const operador = await this.operadoresRepository.save(newOperador);

      //Creamos la licencia con la cual se registra
      const bodyLicencia = {
        licencia: createOperadoreDto.licencia,
        numeroLicencia: createOperadoreDto.numeroLicencia,
        fechaExpedicion: createOperadoreDto.fechaExpedicion,
        fechaVencimiento: createOperadoreDto.fechaVencimiento,
        idTipoLicencia: createOperadoreDto.idTipoLicencia,
        idCategoriaLicencia: createOperadoreDto.idCategoriaLicencia,
        idOperador: operador.id,
      };

      //Guardamos la licencia
      const licenciaCreate =
        await this.licenciasRepository.create(bodyLicencia);

      const _licencia = await this.licenciasRepository.save(licenciaCreate);

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { createOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `El operador ha sido creado correctamente con el número de licencia: ${createOperadoreDto.numeroLicencia}.`,
        'CREATE',
        querylogger,
        Number(idUser),
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'El operador ha sido creado correctamente.',
        data: {
          id: Number(operador.id),
          nombre: `ID de usuario: ${operador.idUsuario} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { createOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `El operador ha sido creado correctamente con el número de licencia: ${createOperadoreDto.numeroLicencia}.`,
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
        message: `Ha ocurrido un error durante el proceso de creación del operador.`,
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
  // 🔹 OBTENER PAGINADO DE OPERADORES
  // ========================================
  async findAllOperadores(
    cliente: number,
    rol: number,
    page: number,
    limit: number,
  ): Promise<ApiResponseCommon> {
    try {
      const offset = (page - 1) * limit;
      let totalResult;
      let operadores;
      switch (rol) {
        case 1:
          // Consulta de datos paginados Usuario SuperAdministrador
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.CertificadoMedico AS certificadoMedico,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacionOperador,
  o.FechaActualizacion AS fechaActualizacionOperador,
  o.Estatus AS estatusOperador,

  -- Datos Del Clientes
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.FotoPerfil AS fotoPerfil,
  u.IdRol AS idRol,
  u.IdCliente AS idCliente,

  -- Agrupamos las licencias del operador en un JSON
  JSON_ARRAYAGG(
    JSON_OBJECT(
      'idLicencia', l.Id,
      'licencia', l.Licencia,
      'numeroLicencia', l.NumeroLicencia,
      'fechaExpedicion', l.FechaExpedicion,
      'fechaVencimiento', l.FechaVencimiento,
      'idTipoLicencia', l.IdTipoLicencia,
      'nombreTipoLicencia', ctl.Nombre,
      'idCategoriaLicencia', l.IdCategoriaLicencia,
      'nombreCategoriaLicencia', ccl.Nombre
    )
  ) AS licencias

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Clientes c ON u.IdCliente = c.Id
LEFT JOIN Licencias l ON l.IdOperador = o.Id
LEFT JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
LEFT JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id

-- WHERE o.Id = @idOperador   -- filtra un operador específico

GROUP BY
  o.Id,
  o.FechaNacimiento,
  o.Identificacion,
  o.ComprobanteDomicilio,
  o.CertificadoMedico,
  o.AntecedentesNoPenales,
  o.FechaCreacion,
  o.FechaActualizacion,
  o.Estatus,
  u.Id,
  u.UserName,
  u.Nombre,
  u.ApellidoPaterno,
  u.ApellidoMaterno,
  u.Telefono,
  u.FotoPerfil,
  u.IdRol,
  u.IdCliente

ORDER BY o.Id DESC
LIMIT ? OFFSET ?;
        `,
            [limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.operadoresRepository.query(
            `
  SELECT COUNT(*) AS total
FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

  `,
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          // Consulta de datos paginados resto Usuario
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.CertificadoMedico AS certificadoMedico,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacionOperador,
  o.FechaActualizacion AS fechaActualizacionOperador,
  o.Estatus AS estatusOperador,

  -- Datos Del Clientes
  c.Nombre As nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.FotoPerfil AS fotoPerfil,
  u.IdRol AS idRol,
  u.IdCliente AS idCliente,

  -- Agrupamos las licencias del operador en un JSON
  JSON_ARRAYAGG(
    JSON_OBJECT(
      'idLicencia', l.Id,
      'licencia', l.Licencia,
      'numeroLicencia', l.NumeroLicencia,
      'fechaExpedicion', l.FechaExpedicion,
      'fechaVencimiento', l.FechaVencimiento,
      'idTipoLicencia', l.IdTipoLicencia,
      'nombreTipoLicencia', ctl.Nombre,
      'idCategoriaLicencia', l.IdCategoriaLicencia,
      'nombreCategoriaLicencia', ccl.Nombre
    )
  ) AS licencias

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Clientes c ON u.IdCliente = c.Id
LEFT JOIN Licencias l ON l.IdOperador = o.Id
LEFT JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
LEFT JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id

WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND u.Estatus = 1

GROUP BY
  o.Id,
  o.FechaNacimiento,
  o.Identificacion,
  o.ComprobanteDomicilio,
  o.CertificadoMedico,
  o.AntecedentesNoPenales,
  o.FechaCreacion,
  o.FechaActualizacion,
  o.Estatus,
  u.Id,
  u.UserName,
  u.Nombre,
  u.ApellidoPaterno,
  u.ApellidoMaterno,
  u.Telefono,
  u.FotoPerfil,
  u.IdRol,
  u.IdCliente

ORDER BY o.Id DESC
LIMIT ? OFFSET ?;
        `,
            [...ids, limit, offset],
          );

          // Query para total (sin paginación)
          totalResult = await this.operadoresRepository.query(
            `
   SELECT COUNT(*) AS total
FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id

WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND u.Estatus = 1
  `,
            [...ids],
          );
          break;
      }

      const total = Number(totalResult[0]?.total || 0);
      //Forzamos a cambiar el id a number
      const data = operadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idRol: Number(item.idRol),
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
        message: 'Error al obtener la paginación de los operadores.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER LISTADO DE OPERADORES
  // ========================================
  async findAllListOperadores(
    cliente: number,
    rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      let operadores;
      switch (rol) {
        case 1:
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.CertificadoMedico AS certificadoMedico,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS validadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente
  

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE o.Estatus = 1
AND u.Estatus = 1
ORDER BY o.Id DESC;
        `,
          );
          break;

        default:
          const { ids, placeholders } = await this.clienteHijos(cliente);
          operadores = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.CertificadoMedico AS certificadoMedico,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS validadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacion,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente
  


FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
WHERE u.IdCliente IN (${placeholders})   -- 🔹 aquí colocas el ID del cliente que quieres consultar
AND o.Estatus = 1
AND u.Estatus = 1
ORDER BY o.Id DESC;
        `,
            [...ids],
          );
          break;
      }

      //Forzamos a cambiar el id a number
      const data = operadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idRol: Number(item.idRol),
        idCliente: Number(item.idCliente),
        idLicencia: Number(item.idLicencia),
        idTipoLicencia: Number(item.idTipoLicencia),
        idCategoriaLicencia: Number(item.idCategoriaLicencia),
      }));

      const _result: ApiResponseCommon = {
        data: data,
      };
      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener el listado de los operadores.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER OPERADORES POR ID DE CLIENTE
  // ========================================
  async findByCliente(
    idCliente: number,
    _idUser: number,
    _rol: number,
  ): Promise<ApiResponseCommon> {
    try {
      // Consulta directa de operadores por cliente (solo el cliente especificado)
      const operadores = await this.operadoresRepository.query(
        `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.CertificadoMedico AS certificadoMedico,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacion,
  o.FechaActualizacion AS fechaActualizacion,
  o.Estatus AS estatus,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.ValidadorId AS validadorId,
  u.FotoPerfil AS fotoPerfil,
  u.FechaCreacion AS fechaCreacionUsuario,
  u.FechaActualizacion AS fechaActualizacionUsuario,
  u.Estatus AS estatusUsuario,
  u.IdRol AS idRol,

  -- Datos del Cliente
  u.IdCliente AS idCliente,
  c.Nombre AS nombreCliente,
  c.ApellidoPaterno AS apellidoPaternoCliente,
  c.ApellidoMaterno AS apellidoMaternoCliente,
  CONCAT(c.Nombre, ' ', c.ApellidoPaterno, ' ', IFNULL(c.ApellidoMaterno, '')) AS nombreCompletoCliente

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
INNER JOIN Clientes c ON u.IdCliente = c.Id

WHERE 
  u.IdCliente = ?
  AND o.Estatus = 1
  AND u.Estatus = 1
  AND c.Estatus = 1

ORDER BY o.Id DESC
        `,
        [idCliente],
      );

      // Forzamos a cambiar el id a number
      const data = operadores.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idRol: Number(item.idRol),
        idCliente: Number(item.idCliente),
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
        message: 'Error al obtener operadores por cliente',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 OBTENER OPERADORES POR ID
  // ========================================
  async findOneOperador(id: number, cliente: number, rol: number) {
    try {
      let operador;
      switch (rol) {
        case 1:
          // Consulta de datos paginados resto Usuario
          operador = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.CertificadoMedico AS certificadoMedico,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacionOperador,
  o.FechaActualizacion AS fechaActualizacionOperador,
  o.Estatus AS estatusOperador,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.FotoPerfil AS fotoPerfil,
  u.IdRol AS idRol,
  u.IdCliente AS idCliente,

  -- Agrupamos las licencias del operador en un JSON
  JSON_ARRAYAGG(
    JSON_OBJECT(
      'idLicencia', l.Id,
      'licencia', l.Licencia,
      'numeroLicencia', l.NumeroLicencia,
      'fechaExpedicion', l.FechaExpedicion,
      'fechaVencimiento', l.FechaVencimiento,
      'idTipoLicencia', l.IdTipoLicencia,
      'nombreTipoLicencia', ctl.Nombre,
      'idCategoriaLicencia', l.IdCategoriaLicencia,
      'nombreCategoriaLicencia', ccl.Nombre
    )
  ) AS licencias

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN Licencias l ON l.IdOperador = o.Id
LEFT JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
LEFT JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id

WHERE o.Id = ?   -- filtra un operador específico

GROUP BY
  o.Id,
  o.FechaNacimiento,
  o.Identificacion,
  o.ComprobanteDomicilio,
  o.CertificadoMedico,
  o.AntecedentesNoPenales,
  o.FechaCreacion,
  o.FechaActualizacion,
  o.Estatus,
  u.Id,
  u.UserName,
  u.Nombre,
  u.ApellidoPaterno,
  u.ApellidoMaterno,
  u.Telefono,
  u.FotoPerfil,
  u.IdRol,
  u.IdCliente

ORDER BY o.Id DESC
        `,
            [id],
          );
          break;

        default:
          const { ids, placeholders: _placeholders } =
            await this.clienteHijos(cliente);
          // Consulta de datos paginados resto Usuario
          operador = await this.operadoresRepository.query(
            `
SELECT
  -- Datos del Operador
  o.Id AS id,
  o.FechaNacimiento AS fechaNacimiento,
  o.Identificacion AS identificacion,
  o.Licencia AS licencia,
  o.ComprobanteDomicilio AS comprobanteDomicilio,
  o.CertificadoMedico AS certificadoMedico,
  o.AntecedentesNoPenales AS antecedentesNoPenales,
  o.FechaCreacion AS fechaCreacionOperador,
  o.FechaActualizacion AS fechaActualizacionOperador,
  o.Estatus AS estatusOperador,

  -- Datos del Usuario
  u.Id AS idUsuario,
  u.UserName AS userNameUsuario,
  u.Nombre AS nombreUsuario,
  u.ApellidoPaterno AS apellidoPaternoUsuario,
  u.ApellidoMaterno AS apellidoMaternoUsuario,
  u.Telefono AS telefonoUsuario,
  u.FotoPerfil AS fotoPerfil,
  u.IdRol AS idRol,
  u.IdCliente AS idCliente,

  -- Agrupamos las licencias del operador en un JSON
  JSON_ARRAYAGG(
    JSON_OBJECT(
      'idLicencia', l.Id,
      'licencia', l.Licencia,
      'numeroLicencia', l.NumeroLicencia,
      'fechaExpedicion', l.FechaExpedicion,
      'fechaVencimiento', l.FechaVencimiento,
      'idTipoLicencia', l.IdTipoLicencia,
      'nombreTipoLicencia', ctl.Nombre,
      'idCategoriaLicencia', l.IdCategoriaLicencia,
      'nombreCategoriaLicencia', ccl.Nombre
    )
  ) AS licencias

FROM Operadores o
INNER JOIN Usuarios u ON o.IdUsuario = u.Id
LEFT JOIN Licencias l ON l.IdOperador = o.Id
LEFT JOIN CatTipoLicencia ctl ON l.IdTipoLicencia = ctl.Id
LEFT JOIN CatCategoriaLicencia ccl ON l.IdCategoriaLicencia = ccl.Id

WHERE o.Id = ?   -- filtra un operador específico

GROUP BY
  o.Id,
  o.FechaNacimiento,
  o.Identificacion,
  o.ComprobanteDomicilio,
  o.CertificadoMedico,
  o.AntecedentesNoPenales,
  o.FechaCreacion,
  o.FechaActualizacion,
  o.Estatus,
  u.Id,
  u.UserName,
  u.Nombre,
  u.ApellidoPaterno,
  u.ApellidoMaterno,
  u.Telefono,
  u.FotoPerfil,
  u.IdRol,
  u.IdCliente

ORDER BY o.Id DESC
        `,
            [...ids, id],
          );
          break;
      }
      if (operador.length == 0) {
        throw new NotFoundException(`Operador con ID ${id} no encontrado.`);
      }

      //Forzamos a cambiar el id a number
      const data = operador.map((item) => ({
        ...item,
        id: Number(item.id),
        idUsuario: Number(item.idUsuario),
        idRol: Number(item.idRol),
        idCliente: Number(item.idCliente),
      }));

      return {
        data: data,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener operador.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR ESTATUS DEL OPERADOR
  // ========================================
  async updateOperadorEstatus(
    id: number,
    idUser: number,
    updateOperadorStatusDto: UpdateOperadorStatusDto,
  ): Promise<ApiCrudResponse> {
    try {
      const operador = await this.operadoresRepository.findOne({
        where: { id: id },
      });
      if (!operador) {
        throw new NotFoundException(
          `Operador id: ${id} con rol no encontrado.`,
        );
      }
      const { estatus } = updateOperadorStatusDto;
      await this.operadoresRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateOperadorStatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se cambió el estatus a: ${estatus} del operador con ID: ${id}.`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Estatus del operador actualizado correctamente.',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre: `ID usuario: ${operador.idUsuario}.` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateOperadorStatusDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se cambió el estatus a: ${updateOperadorStatusDto.estatus} del operador con ID: ${id}.`,
        'UPDATE',
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
        message: ' Error al actualizar el estatus al operador.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ACTUALIZAR DATOS DEL OPERADOR
  // ========================================
  async updateOperador(
    id: number,
    idUser: number,
    updateOperadoreDto: UpdateOperadoreDto,
  ) {
    try {
      const operador = await this.operadoresRepository.findOne({
        where: { id: id },
      });
      console.log(operador?.idUsuario, { fotoPerfil: updateOperadoreDto.foto });

      if (!operador) {
        throw new NotFoundException(`Operador con id: ${id} no encontrado`);
      }
      // Asignar solo los campos enviados al operador y guardar (save persiste correctamente)
      if (updateOperadoreDto.fechaNacimiento !== undefined)
        operador.fechaNacimiento = updateOperadoreDto.fechaNacimiento;
      if (updateOperadoreDto.identificacion !== undefined)
        operador.identificacion = updateOperadoreDto.identificacion;
      if (updateOperadoreDto.comprobanteDomicilio !== undefined)
        operador.comprobanteDomicilio = updateOperadoreDto.comprobanteDomicilio;
      if (updateOperadoreDto.certificadoMedico !== undefined)
        operador.certificadoMedico = updateOperadoreDto.certificadoMedico;
      if (updateOperadoreDto.antecedentesNoPenales !== undefined)
        operador.antecedentesNoPenales =
          updateOperadoreDto.antecedentesNoPenales;
      if (updateOperadoreDto.foto !== undefined)
        operador.foto = updateOperadoreDto.foto;
      if (updateOperadoreDto.estatus !== undefined)
        operador.estatus = updateOperadoreDto.estatus;
      if (updateOperadoreDto.idUsuario !== undefined)
        operador.idUsuario = updateOperadoreDto.idUsuario;
      await this.operadoresRepository.save(operador);
      // Sincronizar la foto en Usuarios.FotoPerfil usando el idUsuario del operador
      if (
        updateOperadoreDto.foto !== undefined &&
        updateOperadoreDto.foto !== ''
      ) {
        await this.usuariosRepository.update(operador.idUsuario, {
          fotoPerfil: updateOperadoreDto.foto,
        });
      }

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { updateOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se actualizó el Operador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Operador actualizado correctamente',
        data: {
          id: id,
          nombre: `id usuario:${operador.idUsuario}  ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora-----ERROR
      const querylogger = { updateOperadoreDto };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se actualizó el Operador con ID: ${id}`,
        'UPDATE',
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
        message: 'Error al actualizar al operador.',
        error: error.message,
      });
    }
  }

  // ========================================
  // 🔹 ELIMINAR OPERADOR
  // ========================================
  async removeOperador(id: number, idUser: number) {
    try {
      const operador = await this.operadoresRepository.findOne({
        where: { id: id },
      });
      if (!operador) {
        throw new NotFoundException(`Operador con id: ${id} no encontrado`);
      }
      await this.operadoresRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se eliminó el operador con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        EnumModulos.OPERADORES,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Operador eliminado correctamente',
        data: {
          id: id,
          nombre: `id usuario:${operador.idUsuario} ` || '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora-----SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'Operadores',
        `Se eliminó el operador con ID: ${id}`,
        'UPDATE',
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
        message:
          'Ha ocurrido un error durante el proceso de eliminación del operador.',
        error: error.message,
      });
    }
  }
}
