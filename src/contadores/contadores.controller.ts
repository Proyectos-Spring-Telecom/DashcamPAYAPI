import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  ParseIntPipe,
  UseGuards,
  Put,
} from '@nestjs/common';
import { ContadoresService } from './contadores.service';
import { CreateContadoresDto } from './dto/create-contadores.dto';
import { UpdateContadoresDto } from './dto/update-contadores.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdateContadoresEstatusDto } from './dto/update-contadores-estatus.dto';
import { UpdateContadoresEstadoDto } from './dto/update-contadores.estado.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Contadores')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('contadores')
export class ContadoresController {
  constructor(private readonly contadoresService: ContadoresService) {}

  @Post()
  async create(
    @Body() createContadoresDto: CreateContadoresDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.contadoresService.create(+idUser, createContadoresDto);
  }

  @Get('list')
  async findAllList(@Request() req,): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.contadoresService.findAllList(+cliente, +rol);
  }

  @Get('clientes/:id')
  async findAllContadoresClientes(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return await this.contadoresService.findAllListClientes(id, +cliente);
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.contadoresService.findAll(+cliente, +rol, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req,) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.contadoresService.findOne(+id, +cliente, +rol);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Request() req,
    @Body() updateContadorDto: UpdateContadoresDto,
  ) {
    const idUser = req.user.userId;
    return this.contadoresService.update(+id, +idUser, updateContadorDto);
  }

    @Patch('actualizar/estado/:id')
  updateEstado(
    @Param('id') id: string,
    @Body() updateContadorEstadoDto: UpdateContadoresEstadoDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.contadoresService.updateEstado(
      +id,
      +idUser,
      updateContadorEstadoDto,
    );
  }

  @Patch('estatus/:id')
  updateEstatus(
    @Param('id') id: string,
    @Body() updateContadorEstatusDto: UpdateContadoresEstatusDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    return this.contadoresService.updateEstatus(
      +id,
      +idUser,
      updateContadorEstatusDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.contadoresService.remove(+id, +idUser);
  }
}

