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

import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ValidadoresService } from 'src/validadores/validadores.service';
import { CreateValidadorDto } from 'src/validadores/dto/create-validador.dto';
import { UpdateValidadorEstatusDto } from 'src/validadores/dto/update-validador-estatus.dto';
import { UpdateValidadorDto } from 'src/validadores/dto/update-validador.dto';
import { UpdateValidadorEstadoDto } from 'src/validadores/dto/update-validador-estado.dto';

@ApiTags('Validadores')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('validadores')
export class ValidadoresController {
  constructor(private readonly validadoresService: ValidadoresService) {}

  @Post()
  createDispositivo(
    @Body() createDispositivoDto: CreateValidadorDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.validadoresService.createValidador(
      createDispositivoDto,
      +idUser,
    );
  }

  @Get('list')
  findAllListValidadores(@Request() req): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.validadoresService.findAllList(+cliente, +rol);
  }

  @Get('by-cliente/:idCliente')
  async findByCliente(
    @Param('idCliente', ParseIntPipe) idCliente: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.validadoresService.findAllListValidadoresClientes(idCliente, +cliente);
  }

  @Get('clientes/:id')
  async findAllValidadoresClientes(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.validadoresService.findAllListValidadoresClientes(+id, +cliente);
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
    return this.validadoresService.findAll(+cliente, +rol, page, limit);
  }

  @Get(':id')
  findOneDispositivo(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.validadoresService.findOneValidador(+id, +cliente, +rol);
  }

    @Patch('actualizar/estado/:id')
  updateDispositivoEstado(
    @Param('id') id: string,
    @Request() req,
    @Body() updateDispositivoEstadoDto: UpdateValidadorEstadoDto,
  ) {
    const idUser = req.user.userId;
    return this.validadoresService.updateValidadorEstado(
      +id,
      +idUser,
      updateDispositivoEstadoDto,
    );
  }

  @Patch('estatus/:id')
  updateDispositivoEstatus(
    @Param('id') id: string,
    @Request() req,
    @Body() updateDispositivoEstatusDto: UpdateValidadorEstatusDto,
  ) {
    const idUser = req.user.userId;
    return this.validadoresService.updateValidadorEstatus(
      +id,
      +idUser,
      updateDispositivoEstatusDto,
    );
  }

  @Put(':id')
  updateDispositivo(
    @Param('id') id: string,
    @Request() req,
    @Body() updateDispositivoDto: UpdateValidadorDto,
  ) {
    const idUser = req.user.userId;
    return this.validadoresService.updateValidador(
      +id,
      +idUser,
      updateDispositivoDto,
    );
  }

  @Delete(':id')
  removeDispositivo(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.validadoresService.removeValidador(+id, +idUser);
  }
}
