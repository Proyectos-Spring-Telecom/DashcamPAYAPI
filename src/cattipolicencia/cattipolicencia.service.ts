import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { CatTipoLicencia } from 'src/entities/CatTipoLicencia';
import { Repository } from 'typeorm';

@Injectable()
export class CattipolicenciaService {
  constructor(
    @InjectRepository(CatTipoLicencia)
    private readonly catcatipolicenciaRepository: Repository<CatTipoLicencia>,
  ) {}

  async findAllList() {
    try {
      let cattipolicencia;
      cattipolicencia = await this.catcatipolicenciaRepository.query(
        `
        SELECT 
      Id AS idCatTipoLicencia,
      Nombre AS nombreCatTipoLicencia
    FROM CatTipoLicencia
    ORDER BY Nombre ASC;
          
                    `,
      );

      //Forzamos los BigInt a number
      const data = cattipolicencia.map((item) => ({
        ...item,
        idCatTipoLicencia: Number(item.idCatTipoLicencia),
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
        'Se produjo un error al obtener el listado de tipo de licencia.',
      );
    }
  }
}
