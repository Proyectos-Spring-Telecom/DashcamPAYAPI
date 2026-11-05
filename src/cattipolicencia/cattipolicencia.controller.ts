import { Controller, Get, UseGuards } from '@nestjs/common';
import { CattipolicenciaService } from './cattipolicencia.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Catálogo tipo licencia')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Roles(1, 2, 3, 11)
@Controller('cattipolicencia')
export class CattipolicenciaController {
  constructor(
    private readonly cattipolicenciaService: CattipolicenciaService,
  ) {}

  @Get('list')
  findAllList() {
    return this.cattipolicenciaService.findAllList();
  }
}
