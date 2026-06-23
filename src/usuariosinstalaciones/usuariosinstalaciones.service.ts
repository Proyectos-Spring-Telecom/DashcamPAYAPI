import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUsuariosInstalacionesDto } from './dto/create-usuariosinstalacione.dto';
import { UpdateUsuariosinstalacioneDto } from './dto/update-usuariosinstalacione.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { UsuariosInstalaciones } from 'src/entities/UsuariosInstalaciones';
import { Repository } from 'typeorm';
import { Instalaciones } from 'src/entities/Instalaciones';
import { Usuarios } from 'src/entities/Usuarios';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import {
  ApiCrudResponse,
  ApiResponseCommon,
  EstatusEnumBitcora,
} from 'src/common/ApiResponse';
import { UpdateUsuariosInstalacionesEstatusDto } from './dto/update-usuariosinstalacione-estatus.dto';

@Injectable()
export class UsuariosinstalacionesService {
  constructor(
    @InjectRepository(UsuariosInstalaciones)
    private readonly usuariosinstalacionesRepository: Repository<UsuariosInstalaciones>,
    @InjectRepository(Instalaciones)
    private readonly instalacionesRepository: Repository<Instalaciones>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    createUsuariosInstalacionesDto: CreateUsuariosInstalacionesDto,
  ): Promise<ApiCrudResponse> {
    try {
      const usuario = await this.usuariosRepository.findOne({
        where: {
          id: createUsuariosInstalacionesDto.idUsuario,
        },
        select: { idCliente: true },
      });
      if (!usuario) {
        throw new NotFoundException(
          `Usuario con ID ${createUsuariosInstalacionesDto.idUsuario} no encontrado`,
        );
      }
      const idUsuarioCliente = usuario.idCliente;

      switch (idUser) {
        case 1:
          // Usuario administrador - obtiene todas las instalaciones
          break;

        default:
          // Usuarios normales - solo sus instalaciones asignadas
          for (const i of createUsuariosInstalacionesDto.idsInstalaciones) {
            const instalacion = await this.instalacionesRepository.findOne({
              where: { id: i },
              select: { idCliente: true },
            });
            if (!instalacion) {
              throw new NotFoundException(
                `Instalación con ID ${i} no encontrada`,
              );
            }
            if (idUsuarioCliente !== instalacion.idCliente) {
              throw new BadRequestException(
                `La instalacion ${i} no pertenece al mismo cliente que el usuario`,
              );
            }
          }
          break;
      }

      // Crear y guardar permisos para usuarios en instalaciones
      if (createUsuariosInstalacionesDto.idsInstalaciones.length > 0) {
        const usuariosinstalacionesPermisos =
          createUsuariosInstalacionesDto.idsInstalaciones.map((idInstalacion) =>
            this.usuariosinstalacionesRepository.create({
              idUsuario: createUsuariosInstalacionesDto.idUsuario,
              idInstalacion: idInstalacion,
            }),
          );

        await this.usuariosinstalacionesRepository.save(
          usuariosinstalacionesPermisos,
        );
      }

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { createUsuariosInstalacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se crearon permisos para usuario: ${createUsuariosInstalacionesDto.idUsuario} con instalaciones: ${createUsuariosInstalacionesDto.idsInstalaciones.join(', ')}`,
        'CREATE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.SUCCESS,
      );

      // Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Permisos de instalaciones creados correctamente',
        data: {
          id: Number(createUsuariosInstalacionesDto.idUsuario),
          nombre:
            `Id Usuario: ${createUsuariosInstalacionesDto.idUsuario} Id Instalación: ${createUsuariosInstalacionesDto.idsInstalaciones} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { createUsuariosInstalacionesDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se crearon permisos para usuario: ${createUsuariosInstalacionesDto.idUsuario} con instalaciones: ${createUsuariosInstalacionesDto.idsInstalaciones.join(', ')}`,
        'CREATE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al crear permisos de instalaciones para el usuario ${createUsuariosInstalacionesDto.idUsuario}`,
      );
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const usuariosinstalaciones =
        await this.usuariosinstalacionesRepository.find({
          where: { estatus: 1 },
        });

      //Forzamos a cambiar el id a number
      const data = usuariosinstalaciones.map((item) => ({
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
      throw new InternalServerErrorException(
        `Error al obtener el listado de permisos de UsuariosInstalaciones `,
      );
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const [data, total] =
        await this.usuariosinstalacionesRepository.findAndCount({
          skip: (page - 1) * limit,
          take: limit,
        });

      //Forzamos a cambiar el id a number
      const usuariosinstalaciones = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      //APi response
      const result: ApiResponseCommon = {
        data: usuariosinstalaciones,
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
        message: 'Error al obtener Paginado UsuariosZonas',
        error,
      });
    }
  }

  async findOneUsuario(id: number) {
    try {
      const usuarioinstalacion =
        await this.usuariosinstalacionesRepository.find({
          where: { idUsuario: id },
        });
      if (usuarioinstalacion.length === 0) {
        throw new NotFoundException('usuarioinstalacion no encontrado');
      }
      //Forzamos a cambiar el id a number
      const data = usuarioinstalacion.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener UsuariosInstalaciones Por IdUsuario',
        error,
      });
    }
  }

  async findOne(id: number) {
    try {
      const usuarioinstalacion =
        await this.usuariosinstalacionesRepository.findOne({
          where: { id: id },
        });
      if (!usuarioinstalacion) {
        throw new NotFoundException('usuarioinstalacion no encontrado');
      }
      //cambiamos el id a number
      usuarioinstalacion.id = Number(usuarioinstalacion.id);

      return { data: usuarioinstalacion };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener UsuariosZonas Por ID',
        error,
      });
    }
  }

  async update(
    id: number,
    idUser: number,
    updateUsuariosinstalacioneDto: UpdateUsuariosinstalacioneDto,
  ): Promise<ApiCrudResponse> {
    try {
      // Extraer instalaciones del DTO
      const { idsInstalaciones, ..._usuarioInstalacionUpdate } =
        updateUsuariosinstalacioneDto;

      // ----- ACTUALIZACIÓN DE INSTALACIONES -----
      if (idsInstalaciones && Array.isArray(idsInstalaciones)) {
        const nuevaLista: number[] = idsInstalaciones.map(Number); // lista nueva de instalaciones (ej. [1,2,3])

        // Instalaciones actuales en BD
        const creadaLista = await this.usuariosinstalacionesRepository.find({
          where: { idUsuario: id },
        });

        const nuevaSet = new Set<number>(nuevaLista);
        const creadaMap = new Map<number, any>(
          creadaLista.map((i) => [Number(i.idInstalacion), i] as const),
        );

        // Unimos todos los ids (de la nueva lista y de la creada)
        const todosIds = new Set<number>([
          ...nuevaSet,
          ...creadaLista.map((i) => Number(i.idInstalacion)),
        ]);

        for (const instalacionId of todosIds) {
          const enNueva = nuevaSet.has(instalacionId);
          const creado = creadaMap.get(instalacionId);

          if (enNueva && creado) {
            if (creado.estatus === 0) {
              // Caso: existe en ambas y en creada estatus=0 → activar
              await this.usuariosinstalacionesRepository.update(creado.id, {
                estatus: 1,
              });
            } else {
              // Caso: existe en ambas y ya está activo → no hacer nada
              continue;
            }
          } else if (enNueva && !creado) {
            // Caso: existe en nueva pero no en creada → crear
            const existe = await this.usuariosinstalacionesRepository.findOne({
              where: { idUsuario: id, idInstalacion: instalacionId },
            });
            if (!existe) {
              await this.usuariosinstalacionesRepository.save({
                idUsuario: id,
                idInstalacion: instalacionId,
                estatus: 1,
              });
            }
          } else if (!enNueva && creado) {
            if (creado.estatus === 1) {
              // Caso: no está en nueva pero sí en creada activo → desactivar
              await this.usuariosinstalacionesRepository.update(creado.id, {
                estatus: 0,
              });
            } else {
              // Caso: ya estaba inactivo → nada que hacer
              continue;
            }
          } else {
            // Caso: no existe ni en nueva ni en creada → nada que hacer
            continue;
          }
        }
      }

      // ----- Registro en la bitácora ----- SUCCESS
      const querylogger = { updateUsuariosinstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se actualizaron las instalaciones del usuario: con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Instalaciones del usuario actualizadas correctamente',
        data: {
          id: id,
          nombre:
            `IdUsuario ${id} Instalaciones ${updateUsuariosinstalacioneDto.idsInstalaciones}` ||
            '',
        },
      };

      return result;
    } catch (error) {
      // ----- Registro en la bitácora ----- ERROR
      const querylogger = { updateUsuariosinstalacioneDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se actualizaron las instalaciones del usuario: con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar instalaciones del usuario',
        error,
      });
    }
  }

  async updateEstatus(
    id: number,
    idUser: number,
    updateUsuariosInstalacionesEstatusDto: UpdateUsuariosInstalacionesEstatusDto,
  ): Promise<ApiCrudResponse> {
    try {
      const usuarioinstalacion =
        await this.usuariosinstalacionesRepository.findOne({
          where: { id: id },
        });
      if (!usuarioinstalacion) {
        throw new NotFoundException(
          `UsuariosZonas con id: ${id} no encontrado`,
        );
      }

      const estatus = updateUsuariosInstalacionesEstatusDto.estatus;

      //Actualizamos datos
      await this.usuariosinstalacionesRepository.update(id, {
        estatus: estatus,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateUsuariosInstalacionesEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se actualizo estatus: ${estatus} de usuarioinstalacion con id: ${usuarioinstalacion.id}`,
        'UPDATE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'UsuariosInstalacion estatus actualizado correctamente',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre:
            `${usuarioinstalacion.id} IdUsuario:${usuarioinstalacion.idUsuario} IdInstalacion: ${usuarioinstalacion.idInstalacion}` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateUsuariosInstalacionesEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se actualizo estatus: ${updateUsuariosInstalacionesEstatusDto.estatus} de usuarioinstalacion con id: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al actualizar estatus de UsuarioInstalacion con id: ${id}`,
      );
    }
  }

  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const usuarioinstalacion =
        await this.usuariosinstalacionesRepository.findOne({
          where: { id: id },
        });
      if (!usuarioinstalacion) {
        throw new NotFoundException(
          `UsuariosZonas con id: ${id} no encontrado`,
        );
      }

      //Actualizamos datos
      await this.usuariosinstalacionesRepository.update(id, {
        estatus: 0,
      });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se elimino usuarioinstalacion con id: ${usuarioinstalacion.id}`,
        'DELETE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'UsuariosInstalacion eliminado correctamente',
        data: {
          id: id,
          nombre:
            `${usuarioinstalacion.id} IdUsuario:${usuarioinstalacion.idUsuario} IdInstalacion: ${usuarioinstalacion.idInstalacion}` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosInstalaciones',
        `Se elimino usuarioinstalacion con id: ${id}`,
        'DELETE',
        querylogger,
        idUser,
        8,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al actualizar estatus de UsuarioInstalacion con id: ${id}`,
      );
    }
  }
}
