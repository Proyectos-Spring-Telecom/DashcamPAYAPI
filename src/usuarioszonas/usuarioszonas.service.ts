import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateUsuariosZonasDto } from './dto/create-usuarioszonas.dto';
import { UpdateUsuarioszonaDto } from './dto/update-usuarioszonas.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { UsuariosZonas } from 'src/entities/UsuariosZonas';
import { Repository } from 'typeorm';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { ApiCrudResponse, ApiResponseCommon, EstatusEnumBitcora } from 'src/common/ApiResponse';
import { UpdateUsuariosZonasEstatusDto } from './dto/update-usuarioszonas-estatus.dto';
import { Zonas } from 'src/entities/Zonas';
import { Usuarios } from 'src/entities/Usuarios';

@Injectable()
export class UsuariosZonasService {
  constructor(
    @InjectRepository(UsuariosZonas)
    private readonly usuarioZonasRepository: Repository<UsuariosZonas>,
    @InjectRepository(Zonas)
    private readonly ZonasRepository: Repository<Zonas>,
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
            const zona = await this.ZonasRepository.findOne({
              where: { id: i },
              select: { idCliente: true },
            });
            if (!zona) {
              throw new NotFoundException(`Zona con ID ${i} no encontrada`);
            }
            if (idUsuarioCliente !== zona.idCliente) {
              throw new BadRequestException(
                `La Zona ${i} no pertenece al mismo cliente que el usuario`,
              );
            }
          }
          break;
      }

      //Creamos y guardamos el permiso para usuarios en zona del usuario
      if (createUsuariosZonasDto.idsZonas.length > 0) {
        const usuariosZonasPermisos =
          createUsuariosZonasDto.idsZonas.map((idsZonas) =>
            this.usuarioZonasRepository.create({
              idUsuario: createUsuariosZonasDto.idUsuario,
              idZona: idsZonas,
            }),
          );

        const usuariosZonasave = await this.usuarioZonasRepository.save(
          usuariosZonasPermisos,
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
            `Id Usuario: ${createUsuariosZonasDto.idUsuario} Id zona: ${createUsuariosZonasDto.idsZonas} ` ||
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
      const usuariosZonas = await this.usuarioZonasRepository.find({
        where: { estatus: 1 },
      });
      if (usuariosZonas.length === 0) {
        throw new NotFoundException('UsuariosZonas no encontrado');
      }

      //Forzamos a cambiar el id a number
      const data = usuariosZonas.map((item) => ({
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
      const [data, total] = await this.usuarioZonasRepository.findAndCount({
        skip: (page - 1) * limit,
        take: limit,
      });

      //Forzamos a cambiar el id a number
      const usuariosZonas = data.map((item) => ({
        ...item,
        id: Number(item.id),
      }));

      //APi response
      const result: ApiResponseCommon = {
        data: usuariosZonas,
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
      const usuariosZonas = await this.usuarioZonasRepository.find({
        where: { idUsuario: id },
      });
      if (!usuariosZonas) {
        throw new NotFoundException('usuariosZonas no encontrado');
      }

      //Forzamos a cambiar el id a number
      const data = usuariosZonas.map((item) => ({
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
      const usuariosZonas = await this.usuarioZonasRepository.findOne({
        where: { id: id },
      });
      if (!usuariosZonas) {
        throw new NotFoundException('usuariosZonas no encontrado');
      }

      //cambiamos el id a number
      usuariosZonas.id = Number(usuariosZonas.id);

      return { data: usuariosZonas };
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
    UpdateUsuarioszonaDto: UpdateUsuarioszonaDto,
  ): Promise<ApiCrudResponse> {
    try {
      // Extraer Zonas del DTO
      const { idsZonas, ...usuariozonaeUpdate } = UpdateUsuarioszonaDto;

      // ----- ACTUALIZACIÓN DE Zonas -----
      if (idsZonas && Array.isArray(idsZonas)) {
        const nuevaLista: number[] = idsZonas.map(Number); // lista nueva de Zonas (ej. [1,2,3])

        // Zonas actuales en BD
        const creadaLista = await this.usuarioZonasRepository.find({
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
              await this.usuarioZonasRepository.update(creado.id, {
                estatus: 1,
              });
            } else {
              // Caso: existe en ambas y ya está activo → no hacer nada
              continue;
            }
          } else if (enNueva && !creado) {
            // Caso: existe en nueva pero no en creada → crear
            const existe = await this.usuarioZonasRepository.findOne({
              where: { idUsuario: id, idZona: zonaId },
            });
            if (!existe) {
              await this.usuarioZonasRepository.save({
                idUsuario: id,
                idzona: zonaId,
                estatus: 1,
              });
            }
          } else if (!enNueva && creado) {
            if (creado.estatus === 1) {
              // Caso: no está en nueva pero sí en creada activo → desactivar
              await this.usuarioZonasRepository.update(creado.id, {
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
      const querylogger = { UpdateUsuarioszonaDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se actualizaron las Zonas del usuario: con ID: ${id}`,
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
            `IdUsuario ${id} Zonas ${UpdateUsuarioszonaDto.idsZonas}` ||
            '',
        },
      };

      return result;
    } catch (error) {
      // ----- Registro en la bitácora ----- ERROR
      const querylogger = { UpdateUsuarioszonaDto };
      await this.bitacoraLogger.logToBitacora(
        'UsuariosZonas',
        `Se actualizaron las Zonas del usuario: con ID: ${id}`,
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
        message: 'Error al actualizar Zonas del usuario',
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
      const usuariozona = await this.usuarioZonasRepository.findOne({
        where: { id: id },
      });
      if (!usuariozona) {
        throw new NotFoundException(
          `UsuariosZonas con id: ${id} no encontrado`,
        );
      }

      const estatus = updateUsuariosZonasEstatusDto.estatus;

      //Actualizamos datos
      await this.usuarioZonasRepository.update(id, { estatus: estatus });

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
            `${usuariozona.id} IdUsuario:${usuariozona.idUsuario} Idzona: ${usuariozona.idZona}` ||
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
        `Error al actualizar estatus de Usuariozona con id: ${id}`,
      );
    }
  }

  async remove(id: number, idUser: number): Promise<ApiCrudResponse> {
    try {
      const usuariozona = await this.usuarioZonasRepository.findOne({
        where: { id: id },
      });
      if (!usuariozona) {
        throw new NotFoundException(
          `UsuarioZonas con id: ${id} no encontrado`,
        );
      }

      //Actualizamos datos
      await this.usuarioZonasRepository.update(id, { estatus: 0 });

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
            `${usuariozona.id} IdUsuario:${usuariozona.idUsuario} Idzona: ${usuariozona.idZona}` ||
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
        `Error al eliminar de Usuariozona con id: ${id}`,
      );
    }
  }
}
