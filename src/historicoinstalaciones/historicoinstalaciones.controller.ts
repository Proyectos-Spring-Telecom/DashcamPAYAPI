import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { HistoricoinstalacionesService } from './historicoinstalaciones.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import { TenantResource } from 'src/common/tenant/tenant-resource.decorator';

@ApiTags('Histórico instalaciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard, TenantOwnershipGuard)
@Roles(1, 2, 3, 11)
@TenantResource('historicoInstalacion')
@Controller('historicoinstalaciones')
export class HistoricoinstalacionesController {
  constructor(
    private readonly historicoinstalacionesService: HistoricoinstalacionesService,
  ) {}

  @Get()
  findAll() {
    return this.historicoinstalacionesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.historicoinstalacionesService.findOne(+id);
  }
}
