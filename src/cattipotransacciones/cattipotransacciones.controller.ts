import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CattipotransaccionesService } from './cattipotransacciones.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Catálogo tipo transacciones')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('cattipotransacciones')
export class CattipotransaccionesController {
  constructor(private readonly cattipotransaccionesService: CattipotransaccionesService) {}

  @Get('list')
  findAllList() {
    return this.cattipotransaccionesService.findAllList();
  }
}
