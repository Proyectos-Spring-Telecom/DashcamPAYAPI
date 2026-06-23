import { Controller, Get, UseGuards } from '@nestjs/common';
import { CattipodescuentoService } from './cattipodescuento.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Catálogo tipo descuento')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('cattipodescuento')
export class CattipodescuentoController {
  constructor(private readonly cattipodescuentoService: CattipodescuentoService) {}

  @Get('list')
  findAll() {
    return this.cattipodescuentoService.findAllList();
  }
}
