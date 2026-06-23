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
import { CreateValidadorDto } from './dto/create-validador.dto';
import { UpdateValidadorDto } from './dto/update-validador.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdateValidadorEstatusDto } from './dto/update-validador-estatus.dto';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdateValidadorEstadoDto } from './dto/update-validador-estado.dto';

@UseGuards(JwtAuthGuard)
@Controller('validadores')
export class ValidadoresController {
  constructor(private readonly ValidadoresService: ValidadoresService) {}

  @Post()
  createValidador(
    @Body() createValidadorDto: CreateValidadorDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.createValidador(
      createValidadorDto,
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

  @Get('/clientes/:id')
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
  findOneValidador(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.ValidadoresService.findOneValidador(+id, +cliente, +rol);
  }

    @Patch('actualizar/estado/:id')
  updateValidadorEstado(
    @Param('id') id: string,
    @Request() req,
    @Body() updateValidadorEstadoDto: UpdateValidadorEstadoDto,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.updateValidadorEstado(
      +id,
      +idUser,
      updateValidadorEstadoDto,
    );
  }

  @Patch('estatus/:id')
  updateValidadorEstatus(
    @Param('id') id: string,
    @Request() req,
    @Body() updateValidadorEstatusDto: UpdateValidadorEstatusDto,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.updateValidadorEstatus(
      +id,
      +idUser,
      updateValidadorEstatusDto,
    );
  }

  @Put(':id')
  updateValidador(
    @Param('id') id: string,
    @Request() req,
    @Body() updateValidadorDto: UpdateValidadorDto,
  ) {
    const idUser = req.user.userId;
    return this.ValidadoresService.updateValidador(
      +id,
      +idUser,
      updateValidadorDto,
    );
  }

  @Delete(':id')
  removeValidador(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.ValidadoresService.removeValidador(+id, +idUser);
  }
}
