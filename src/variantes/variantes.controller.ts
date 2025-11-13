import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  ParseIntPipe,
  Put,
} from '@nestjs/common';
import { VariantesService } from './variantes.service'; 
import { CreateVariantesDto } from './dto/create-variantes.dto';
import { UpdateVariantesDto } from './dto/update-variantes.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdateVariantesEstatusDto } from './dto/update-variantes-estatus.dto';

@UseGuards(JwtAuthGuard)
@Controller('variantes')
export class VariantesController {
  constructor(private readonly VariantesService: VariantesService) {}

  @Post()
  create(@Body() createVariantesDto: CreateVariantesDto, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.create(+idUser, +cliente, +rol, createVariantesDto);
  }

  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.findAllList(+idUser, +cliente, +rol);
  }

  @Get(':page/:limit')
  findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.findAll(+idUser, +cliente, +rol, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.findOne(+id, +idUser, +cliente, +rol);
  }

  @Patch('estatus/:id')
  updateEstatus(
    @Param('id') id: string,
    @Body() updateVariantesEstatusDto: UpdateVariantesEstatusDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.updateEstatus(+id, +idUser, +cliente, +rol, updateVariantesEstatusDto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateVariantesDto: UpdateVariantesDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.update(+id, +idUser, +cliente, +rol, updateVariantesDto);
  }

  @Delete('eliminado/total/:id')
  removeTotal(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.removeTotal(+id, +idUser, +cliente, +rol);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.VariantesService.remove(+id, +idUser, +cliente, +rol);
  }

}
