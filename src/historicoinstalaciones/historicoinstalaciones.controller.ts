import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { HistoricoinstalacionesService } from './historicoinstalaciones.service';
import { UpdateHistoricoinstalacioneDto } from './dto/update-historicoinstalacione.dto';

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

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateHistoricoinstalacioneDto: UpdateHistoricoinstalacioneDto) {
    return this.historicoinstalacionesService.update(+id, updateHistoricoinstalacioneDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.historicoinstalacionesService.remove(+id);
  }
}
