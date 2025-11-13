import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ValidadoresService } from './validadores.service'; 
import { CreateValidadoresDto } from './dto/create-validadores.dto';
import { UpdateValidadoresDto } from './dto/update-validadores.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdateValidadoresEstatusDto } from './dto/update-validadores-estatus.dto';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdateValidadoresEstadoDto } from './dto/update-validadores-estado.dto';

@UseGuards(JwtAuthGuard)
@Controller('validadores')
export class ValidadoresController {
  constructor(private readonly ValidadoresService: ValidadoresService) {}

  @Post()
  createValidadores(
    @Body() createValidadoresDto: CreateValidadoresDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.createValidadores(
      createValidadoresDto,
      +idUser,
    );
  }

  @Get('list')
  findAllListValidadores(@Request() req): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.ValidadoresService.findAllList(+cliente, +rol);
  }

  @Get('clientes/:id')
  async findAllValidadoresClientes(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.ValidadoresService.findAllListValidadoresClientes(+id, +cliente);
  }

  @Get(':page/:limit')
  async findAllValidadores(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.ValidadoresService.findAll(+cliente, +rol, page, limit);
  }

  @Get(':id')
  findOneValidadores(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.ValidadoresService.findOneValidadores(+id, +cliente, +rol);
  }

  @Patch('actualizar/estado/:id')
  updateValidadorEstado(
    @Param('id') id: string,
    @Request() req,
    @Body() updateValidadoresEstadoDto: UpdateValidadoresEstadoDto,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.updateValidadorEstado(
      +id,
      +idUser,
      updateValidadoresEstadoDto,
    );
  }

  @Patch('estatus/:id')
  updateValidadoresEstatus(
    @Param('id') id: string,
    @Request() req,
    @Body() updateValidadoresEstatusDto: UpdateValidadoresEstatusDto,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.updateValidadoresEstatus(
      +id,
      +idUser,
      updateValidadoresEstatusDto,
    );
  }

  @Put(':id')
  updateValidadores(
    @Param('id') id: string,
    @Request() req,
    @Body() updateValidadoresDto: UpdateValidadoresDto,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.updateValidadores(
      +id,
      +idUser,
      updateValidadoresDto,
    );
  }

  @Delete(':id')
  removeValidadores(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.ValidadoresService.removeValidadores(+id, +idUser);
  }
}
