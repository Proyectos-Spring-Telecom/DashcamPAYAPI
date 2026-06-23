import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DireccionesService } from './direcciones.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Direcciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('direcciones')
export class DireccionesController {
  constructor(private readonly direccionesService: DireccionesService) {}

  @Get('/CP/:cp')
  @ApiOperation({
    summary: 'Buscar direcciones por código postal',
    description: 'Obtiene información de direcciones basada en el código postal proporcionado.',
  })
  @ApiParam({
    name: 'cp',
    type: String,
    description: 'Código postal a consultar',
    example: '01000',
  })
  @ApiResponse({
    status: 200,
    description: 'Direcciones encontradas exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Error en la solicitud o código postal inválido',
  })
  @ApiResponse({
    status: 401,
    description: 'No autorizado',
  })
  async findAll(@Param('cp') cp: string): Promise<any> {
    return this.direccionesService.findByCodigoPostal(cp);
  }
}
