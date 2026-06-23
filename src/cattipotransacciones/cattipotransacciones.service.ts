import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { CatTiposTransacciones } from 'src/entities/CatTiposTransacciones';
import { Repository } from 'typeorm';

@Injectable()
export class CattipotransaccionesService {
  constructor(
    @InjectRepository(CatTiposTransacciones)
    private readonly catcategorialicenciaRepository: Repository<CatTiposTransacciones>,
  ) {}

  async findAllList() {
    try {
      let catcategorialicencia;
      catcategorialicencia = await this.catcategorialicenciaRepository.query(
        `
        SELECT 
      Id AS idCatTiposTransacciones,
      Nombre AS nombreCatTiposTransacciones
    FROM CatTiposTransacciones
    ORDER BY Nombre ASC;
          
                    `,
      );

      //Forzamos los BigInt a number
      const data = catcategorialicencia.map((item) => ({
        ...item,
        idCatTiposTransacciones: Number(item.idCatTiposTransacciones),
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
        'Se produjo un error al obtener el listado tipos de transacciones.',
      );
    }
  }
}
