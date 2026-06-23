import { Controller, Get, UseGuards } from '@nestjs/common';
import { CatTipoTarifaService } from './cat-tipo-tarifa.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ApiResponseCommon } from 'src/common/ApiResponse';

@ApiTags('Catálogo tipo tarifa')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('cat-tipo-tarifa')
export class CatTipoTarifaController {
  constructor(private readonly catTipoTarifaService: CatTipoTarifaService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtener listado de tipos de tarifa',
    description:
      'Obtiene un listado completo de todos los tipos de tarifa sin paginación.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listado de tipos de tarifa obtenido exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  findAllList(): Promise<ApiResponseCommon> {
    return this.catTipoTarifaService.findAllList();
  }
}
