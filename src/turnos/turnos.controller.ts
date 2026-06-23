import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TurnosService } from './turnos.service';
import { CreateTurnoDto } from './dto/create-turno.dto';
import { UpdateTurnoDto } from './dto/update-turno.dto';
import { UpdateTurnosEstatusDto } from './dto/update-turno-estatus.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Turnos')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('turnos')
export class TurnosController {
  constructor(private readonly turnosService: TurnosService) {}

  @Post()
  async create(
    @Body() createTurnoDto: CreateTurnoDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    const idOperador = req.user.idOperador;
    return await this.turnosService.create(
      +idUser,
      +cliente,
      +idOperador,
      createTurnoDto,
    );
  }

  @Get('list')
  async findAllList(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.turnosService.findAllList(+idUser, +cliente, +rol);
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.turnosService.findAll(
      +idUser,
      +cliente,
      +rol,
      page,
      limit,
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.turnosService.findOne(+id, +idUser, +cliente, +rol);
  }

  @Patch('estatus/:id')
  async updateEstatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTurnosEstatusDto: UpdateTurnosEstatusDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return await this.turnosService.updateEstatus(
      id,
      +idUser,
      updateTurnosEstatusDto,
    );
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTurnoDto: UpdateTurnoDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    const idOperador = req.user.idOperador;
    return await this.turnosService.update(
      id,
      +idUser,
      +cliente,
      +idOperador,
      updateTurnoDto,
    );
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return await this.turnosService.remove(id, +idUser);
  }
}
