import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUsuariosZonasDto } from './dto/create-usuarioszona.dto';
import { UpdateUsuarioszonaDto } from './dto/update-usuarioszona.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { ApiCrudResponse, ApiResponseCommon, EstatusEnumBitcora } from 'src/common/ApiResponse';
import { UpdateUsuariosZonasEstatusDto } from './dto/update-usuarioszona-estatus.dto';
import { Zonas } from 'src/entities/Zonas';
import { Usuarios } from 'src/entities/Usuarios';

@Injectable()
export class UsuarioszonasService {
  constructor(
    @InjectRepository(UsuariosZonas)
    private readonly usuarioszonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Zonas)
    private readonly zonasRepository: Repository<Zonas>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    private readonly bitacoraLogger: BitacoraLoggerService,
  ) {}

  async create(
    idUser: number,
    createUsuariosZonasDto: CreateUsuariosZonasDto,
  ) {
    try {
      const usuario = await this.usuariosRepository.findOne({
        where: {
          id: createUsuariosZonasDto.idUsuario,
        },
        select: { idCliente: true },
      });
      if (!usuario) {
        throw new NotFoundException(
          `Usuario con ID ${createUsuariosZonasDto.idUsuario} no encontrado`,
        );
      }
      const idUsuarioCliente = usuario.idCliente;

      switch (idUser) {
        case 1:
          break;
          // Usuario administrador - obtiene todas las instalaciones
        default:
          // Usuarios normales - solo sus instalaciones asignadas
          for (const i of createUsuariosZonasDto.idsZonas) {
            const zona = await this.zonasRepository.findOne({
              where: { id: i },
              select: { idCliente: true },
            });
            if (!zona) {
              throw new NotFoundException(`Zona con ID ${i} no encontrada`);
            }
            if (idUsuarioCliente !== zona.idCliente) {
              throw new BadRequestException(
                `La zona ${i} no pertenece al mismo cliente que el usuario`,
              );
            }
          }
          break;
      }

      //Creamos y guardamos el permiso para usuarios en zona del usuario
      if (createUsuariosZonasDto.idsZonas.length > 0) {
        const usuarioszonasPermisos =
          createUsuariosZonasDto.idsZonas.map((idsZonas) =>
            this.usuarioszonasRepository.create({
              idUsuario: createUsuariosZonasDto.idUsuario,
              idZona: idsZonas,
            }),
          );

        const usuarioszonaSave = await this.usuarioszonasRepository.save(
          usuarioszonasPermisos,
        );
      }

      // --- Registro en la bitácora --- SUCCESS
      const querylogger = { createUsuariosZonasDto };
      await this.bitacoraLogger.logToBitacora(
        'Permisos',
        `Se creó el permiso para usuario: ${createUsuariosZonasDto.idUsuario} con Id zona ${createUsuariosZonasDto.idsZonas}`,
        'CREATE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Permiso creado correctamente',
        data: {
          id: Number(createUsuariosZonasDto.idUsuario),
          nombre:
            `Id Usuario: ${createUsuariosZonasDto.idUsuario} Id Zona: ${createUsuariosZonasDto.idsZonas} ` ||
            '',
        },
      };
      return result;
    } catch (error) {
      // --- Registro en la bitácora --- ERROR
      const querylogger = { createUsuariosZonasDto };
      await this.bitacoraLogger.logToBitacora(
        'Permisos',
        `Se creó el permiso para usuario: ${createUsuariosZonasDto.idUsuario} con Id zona ${createUsuariosZonasDto.idsZonas}`,
        'CREATE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al crear permiso para el usuario ${createUsuariosZonasDto.idUsuario} en la zona ${createUsuariosZonasDto.idsZonas}`,
      );
    }
  }

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      //Obtenemos ConteoPasajeros
      const usuarioszonas = await this.usuarioszonasRepository.find({
        where: { estatus: 1 },
      });
      if (usuarioszonas.length === 0) {
        throw new NotFoundException('UsuariosZonas no encontrado');
      }

      //Forzamos a cambiar el id a number
      const data = usuarioszonas.map((item) => ({
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
      throw new InternalServerErrorException({
        message: 'Error al obtener listado UsuariosZonas',
        error,
      });
    }
  }

  async findAll(page: number, limit: number): Promise<ApiResponseCommon> {
    try {
      const [data, total] = await this.usuarioszonasRepository.findAndCount({
        skip: (page - 1) * limit,
        take: limit,
      });

      //Forzamos a cambiar el id a number
      const usuarioszonas = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      //APi response
      const result: ApiResponseCommon = {
        data: usuarioszonas,
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
      const usuarioszonas = await this.usuarioszonasRepository.find({
        where: { idUsuario: id },
      });
      if (!usuarioszonas) {
        throw new NotFoundException('usuarioszonas no encontrado');
      }

      //Forzamos a cambiar el id a number
      const data = usuarioszonas.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      return { data: data };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al obtener UsuariosZonas Por IdUsuario',
        error,
      });
    }
  }

  async findOne(id: number) {
    try {
      const usuarioszonas = await this.usuarioszonasRepository.findOne({
        where: { id: id },
      });
      if (!usuarioszonas) {
        throw new NotFoundException('usuarioszonas no encontrado');
      }

      //cambiamos el id a number
      usuarioszonas.id = Number(usuarioszonas.id);

      return { data: usuarioszonas };
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
    updateUsuarioszonaDto: UpdateUsuarioszonaDto,
  ): Promise<ApiCrudResponse> {
    try {
      // Extraer zonas del DTO
      const { idsZonas, ...usuarioZonaUpdate } = updateUsuarioszonaDto;

      // ----- ACTUALIZACIÓN DE ZONAS -----
      if (idsZonas && Array.isArray(idsZonas)) {
        const nuevaLista: number[] = idsZonas.map(Number); // lista nueva de zonas (ej. [1,2,3])

        // Zonas actuales en BD
        const creadaLista = await this.usuarioszonasRepository.find({
          where: { idUsuario: id },
        });

        const nuevaSet = new Set<number>(nuevaLista);
        const creadaMap = new Map<number, any>(
          creadaLista.map((r) => [Number(r.idZona), r] as const),
        );

        // Unimos todos los ids (de la nueva lista y de la creada)
        const todosIds = new Set<number>([
          ...nuevaSet,
          ...creadaLista.map((r) => Number(r.idZona)),
        ]);

        for (const zonaId of todosIds) {
          const enNueva = nuevaSet.has(zonaId);
          const creado = creadaMap.get(zonaId);

          if (enNueva && creado) {
            if (creado.estatus === 0) {
              // Caso: existe en ambas y en creada estatus=0 → activar
              await this.usuarioszonasRepository.update(creado.id, {
                estatus: 1,
              });
            } else {
              // Caso: existe en ambas y ya está activo → no hacer nada
              continue;
            }
          } else if (enNueva && !creado) {
            // Caso: existe en nueva pero no en creada → crear
            const existe = await this.usuarioszonasRepository.findOne({
              where: { idUsuario: id, idZona: zonaId },
            });
            if (!existe) {
              await this.usuarioszonasRepository.save({
                idUsuario: id,
                idZona: zonaId,
                estatus: 1,
              });
            }
          } else if (!enNueva && creado) {
            if (creado.estatus === 1) {
              // Caso: no está en nueva pero sí en creada activo → desactivar
              await this.usuarioszonasRepository.update(creado.id, {
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
      const querylogger = { updateUsuarioszonaDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se actualizaron las zonas del usuario: con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.SUCCESS,
      );

      // ----- Api response -----
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'Zonas del usuario actualizadas correctamente',
        data: {
          id: id,
          nombre:
            `IdUsuario ${id} Zonas ${updateUsuarioszonaDto.idsZonas}` ||
            '',
        },
      };

      return result;
    } catch (error) {
      // ----- Registro en la bitácora ----- ERROR
      const querylogger = { updateUsuarioszonaDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se actualizaron las zonas del usuario: con ID: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: 'Error al actualizar zonas del usuario',
        error,
      });
    }
  }
  //-----********-----*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*-*
  async updateEstatus(
    id: number,
    idUser: number,
    updateUsuariosZonasEstatusDto: UpdateUsuariosZonasEstatusDto,
  ): Promise<ApiCrudResponse> {
    try {
      const usuariozona = await this.usuarioszonasRepository.findOne({
        where: { id: id },
      });
      if (!usuariozona) {
        throw new NotFoundException(
          `UsuariosZonas con id: ${id} no encontrado`,
        );
      }

      const estatus = updateUsuariosZonasEstatusDto.estatus;

      //Actualizamos datos
      await this.usuarioszonasRepository.update(id, { estatus: estatus });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { updateUsuariosZonasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se actualizo estatus: ${estatus} de usuariozona con id: ${usuariozona.id}`,
        'UPDATE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'UsuariosZonas estatus actualizado correctamente',
        estatus: { estatus: estatus },
        data: {
          id: id,
          nombre:
            `${usuariozona.id} IdUsuario:${usuariozona.idUsuario} IdZona: ${usuariozona.idZona}` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { updateUsuariosZonasEstatusDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se actualizo estatus: ${updateUsuariosZonasEstatusDto.estatus} de usuariozona con id: ${id}`,
        'UPDATE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al actualizar estatus de UsuarioZona con id: ${id}`,
      );
    }
  }

  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const usuariozona = await this.usuarioszonasRepository.findOne({
        where: { id: id },
      });
      if (!usuariozona) {
        throw new NotFoundException(
          `UsuariosZonas con id: ${id} no encontrado`,
        );
      }

      //Actualizamos datos
      await this.usuarioszonasRepository.update(id, { estatus: 0 });

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se elimino usuariozona con id: ${usuariozona.id}`,
        'DELETE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.SUCCESS,
      );

      //Api response
      const result: ApiCrudResponse = {
        status: 'success',
        message: 'UsuariosZonas eliminado correctamente',
        data: {
          id: id,
          nombre:
            `${usuariozona.id} IdUsuario:${usuariozona.idUsuario} IdZona: ${usuariozona.idZona}` ||
            '',
        },
      };
      return result;
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = { id: id, estatus: 0 };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se elimino usuariozona con id: ${id}`,
        'DELETE',
        querylogger,
        idUser,
        7,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        `Error al eliminar de UsuarioZona con id: ${id}`,
      );
    }
  }
}

