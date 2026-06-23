import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { HistoricoinstalacionesService } from './historicoinstalaciones.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Histórico instalaciones')
@Controller('historicoinstalaciones')
export class HistoricoinstalacionesController {
  constructor(private readonly historicoinstalacionesService: HistoricoinstalacionesService) {}



  @Get()
  findAll() {
    return this.historicoinstalacionesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.historicoinstalacionesService.findOne(+id);
  }


}
