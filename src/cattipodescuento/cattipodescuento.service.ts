import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { CatTipoDescuento } from 'src/entities/CatTipoDescuento';
import { Repository } from 'typeorm';

@Injectable()
export class CattipodescuentoService {
  constructor(
    @InjectRepository(CatTipoDescuento)
    private readonly cattipodescuentoRepository: Repository<CatTipoDescuento>,
  ) {}

  async findAllList() {
    try {
      const cattipodescuento = await this.cattipodescuentoRepository.query(
        `
    SELECT 
  Id AS idCatTipoDescuento,
  Nombre AS nombreCatTipoDescuento
FROM CatTipoDescuento
ORDER BY Id DESC;
      
                `,
      );

      //Forzamos los BigInt a number
      const data = cattipodescuento.map((item) => ({
        ...item,
        idCatTipoDescuento: Number(item.idCatTipoDescuento),
      }));

      const result: ApiResponseCommon = {
        data: data,
      };
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadRequestException(
        'Se produjo un error al obtener el listado de tipos de descuentos.',
      );
    }
  }
}
