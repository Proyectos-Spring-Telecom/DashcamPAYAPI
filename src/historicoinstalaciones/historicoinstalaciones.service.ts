import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { UpdateHistoricoinstalacioneDto } from "./dto/update-historicoinstalacione.dto";
import { EstatusEnumBitcora } from "src/common/ApiResponse";
import { InjectRepository } from "@nestjs/typeorm";
import { HistoricoInstalaciones } from "src/entities/HistoricoInstalaciones";
import { IsNull, Repository } from "typeorm";
import { BitacoraLoggerService } from "src/bitacora/bitacora.service";

@Injectable()
export class HistoricoinstalacionesService {
  constructor(
    @InjectRepository(HistoricoInstalaciones)
    private readonly historicoInstalacionesRepository: Repository<HistoricoInstalaciones>,
    private readonly bitacoraLogger: BitacoraLoggerService
  ) {}

  findAll() {
    return `This action returns all historicoinstalaciones`;
  }

  findOne(id: number) {
    return `This action returns a #${id} historicoinstalacione`;
  }

  update(
    id: number,
    updateHistoricoinstalacioneDto: UpdateHistoricoinstalacioneDto
  ) {
    return `This action updates a #${id} historicoinstalacione`;
  }

  remove(id: number) {
    return `This action removes a #${id} historicoinstalacione`;
  }

  //Crear un historico
  async createHistorico(
    idInstalacion: number,
    idValidador: number,
    idContador: number,
    idVehiculo: number,
    idCliente: number,
    idUser: number
  ) {
    try {
      const historico = {
        idInstalacion: idInstalacion,
        idValidador: idValidador,
        idContador: idContador,
        idVehiculo: idVehiculo,
        idCliente: idCliente,
      };

      const createHistorico =
        await this.historicoInstalacionesRepository.create(historico);
      const historicoSave =
        await this.historicoInstalacionesRepository.save(createHistorico);

      // Registro en la bitácora SUCCESS
      const querylogger = { historico };
      await this.bitacoraLogger.logToBitacora(
        "HistoricoInstalaciones",
        `El historico de la instalacion ${idInstalacion} ha sido creada exitosamente.`,
        "CREATE",
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.SUCCESS
      );
    } catch (error) {
      // Registro en la bitácora SUCCESS
      const querylogger = {
        instalacion: idInstalacion,
        Validador: idValidador,
        Contadors: idContador,
        vehiculo: idVehiculo,
        cliente: idCliente,
      };
      await this.bitacoraLogger.logToBitacora(
        "HistoricoInstalaciones",
        `El historico de la instalacion ${idInstalacion} ha sido creada exitosamente.`,
        "CREATE",
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.ERROR,
        error.message
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException({
        message: `Ocurrió un problema al intentar crear historico de la instalación con ID: ${idInstalacion}.`,
        error: error.message,
      });
    }
  }

  async updateHistorico(
    instalacion: UpdateHistoricoinstalacioneDto,
    idValidadorUp: number,
    idContadorUp: number,
    idVehiculoUp: number,
    idClienteUp: number,
    idUser: number,
    comentario?: string,
  ) {
    try {
      // Buscar el histórico activo (sin fechaBaja) para esta instalación
      const historicoActivo =
        await this.historicoInstalacionesRepository.findOne({
          where: {
            idInstalacion: instalacion.idInstalacion,
            fechaBaja: IsNull(),
          },
        });

      const mismoValidador =
        historicoActivo?.idValidador === idValidadorUp;
      const mismoContador = historicoActivo?.idContador === idContadorUp;

      // 🚫 Si no hay cambios reales, no hacer nada
      if (historicoActivo && mismoValidador && mismoContador) {
        return;
      }

      // ✅ Si existe un registro activo con datos distintos, cerrarlo
      if (historicoActivo) {
        await this.historicoInstalacionesRepository.update(historicoActivo.id, {
          fechaBaja: new Date(),
          comentario: comentario,
        });
      }

      // 🆕 Insertar nuevo histórico con los datos actualizados
      const historico = this.historicoInstalacionesRepository.create({
        idInstalacion: instalacion.idInstalacion,
        idValidador: idValidadorUp,
        idContador: idContadorUp,
        idVehiculo: idVehiculoUp, // el vehículo no cambia, pero se registra
        idCliente: idClienteUp,
      });

      const historicoSave =
        await this.historicoInstalacionesRepository.save(historico);

      // 📝 Registrar en bitácora
      const querylogger = { historico };
      await this.bitacoraLogger.logToBitacora(
        'HistoricoInstalaciones',
        `Histórico de la instalación ${historicoSave.id} actualizado correctamente.`,
        'CREATE',
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.SUCCESS,
      );
    } catch (error) {
      // Registro en la bitácora de errores
      const querylogger = {
        instalacion: instalacion.idInstalacion,
        Validador: idValidadorUp,
        Contadors: idContadorUp,
        vehiculo: idVehiculoUp,
        cliente: idClienteUp,
      };
      await this.bitacoraLogger.logToBitacora(
        'HistoricoInstalaciones',
        `Error al actualizar el histórico de la instalación ${instalacion.idInstalacion}.`,
        'CREATE',
        querylogger,
        idUser,
        26,
        EstatusEnumBitcora.ERROR,
        error.message,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        message: `Error al actualizar el histórico de la instalación con ID: ${instalacion.idInstalacion}.`,
        error: error.message,
      });
    }
  }
}
