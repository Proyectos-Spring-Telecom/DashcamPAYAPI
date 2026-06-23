import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CatTipoCombustible } from 'src/entities/CatTipoCombustible';
import { Repository } from 'typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@Injectable()
export class CatcombustibleService {
  constructor(
    @InjectRepository(CatTipoCombustible)
    private readonly catPasajeroRepository: Repository<CatTipoCombustible>,
  ) {}



  // ========================================
  // 🔹 OBTENER UN LISTADO DE TIPOS COMBUSTIBLES
  // ========================================
  async findAllList() {
    try {
      const catTipoCombustible = await this.catPasajeroRepository.query(
        `
SELECT 
	ctc.Id AS idTipoCombustible,
    ctc.Nombre AS nombreTipoCombustible
FROM CatTipoCombustible ctc;       
            `,
      );

      //Forzamos los BigInt a number
      const data = catTipoCombustible.map((item) => ({
        ...item,
        idTipoCombustible: Number(item.idTipoCombustible),
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
        'Se produjo un error al obtener el listado de tipos de combustible.',
      );
    }
  }
}
