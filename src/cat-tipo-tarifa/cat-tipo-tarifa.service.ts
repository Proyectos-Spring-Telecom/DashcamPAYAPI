import {
  HttpException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CatTipoTarifa } from 'src/entities/CatTipoTarifa';
import { Repository } from 'typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@Injectable()
export class CatTipoTarifaService {
  constructor(
    @InjectRepository(CatTipoTarifa)
    private readonly catTipoTarifaRepository: Repository<CatTipoTarifa>,
  ) {}

  async findAllList(): Promise<ApiResponseCommon> {
    try {
      const tiposTarifa = await this.catTipoTarifaRepository.find({
        order: { nombre: 'ASC' },
      });

      // Forzamos ids a number
      const data = tiposTarifa.map((item) => ({
        id: Number(item.id),
        nombre: item.nombre,
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
        'Se produjo un error al obtener el listado de tipos de tarifa.',
      );
    }
  }
}
