import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CatCategoriaLicencia } from 'src/entities/CatCategoriaLicencia';
import { Repository } from 'typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@Injectable()
export class CatcategorialicenciaService {
  constructor(
    @InjectRepository(CatCategoriaLicencia)
    private readonly catcategorialicenciaRepository: Repository<CatCategoriaLicencia>,
  ) {}

  async findAllList() {
    try {
      let catcategorialicencia;
      catcategorialicencia = await this.catcategorialicenciaRepository.query(
        `
    SELECT 
  Id AS idCategoriaLicencia,
  Nombre AS nombreCategoriaLicencia
FROM CatCategoriaLicencia
ORDER BY Nombre ASC;
      
                `,
      );

      //Forzamos los BigInt a number
      const data = catcategorialicencia.map((item) => ({
        ...item,
        idCategoriaLicencia: Number(item.idCategoriaLicencia),
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
        'Se produjo un error al obtener el listado de categoria de licencia.',
      );
    }
  }
}
