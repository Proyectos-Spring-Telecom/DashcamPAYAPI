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
  Put,
  UseGuards,
} from '@nestjs/common';
import { UsuariosZonasService } from './usuarioszonas.service';
import { CreateUsuariosZonasDto } from './dto/create-usuarioszonas.dto';
import { UpdateUsuarioszonaDto } from './dto/update-usuarioszonas.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdateUsuariosZonasEstatusDto } from './dto/update-usuarioszonas-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('usuarioszonas')
export class UsuariosZonasController {
  constructor(
    private readonly usuariosZonasService: UsuariosZonasService,
  ) {}

  @Post()
  async create(
    @Body() createUsuariosZonasDto: CreateUsuariosZonasDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosZonasService.create(
      +idUser,
      createUsuariosZonasDto,
    );
  }

  @Get('list')
  async findAllList(): Promise<ApiResponseCommon> {
    return await this.usuariosZonasService.findAllList();
  }

  @Get('usuario/:idUsuario')
  async findOneUsuario(@Param('idUsuario',ParseIntPipe) id: number) {
    return await this.usuariosZonasService.findOneUsuario(id);
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    return await this.usuariosZonasService.findAll(page, limit);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.usuariosZonasService.findOne(+id);
  }

  @Patch('estatus/:id')
  async updateEstatus(
    @Param('id') id: string,
    @Body() updateUsuariosZonasEstatusDto: UpdateUsuariosZonasEstatusDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosZonasService.updateEstatus(
      +id,
      idUser,
      updateUsuariosZonasEstatusDto,
    );
  }

  @Put(':idUsuario')
  async update(
    @Param('idUsuario') id: string,
    @Body() UpdateUsuarioszonaDto: UpdateUsuarioszonaDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.usuariosZonasService.update(
      +id,
      idUser,
      UpdateUsuarioszonaDto,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Request() req): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuariosZonasService.remove(+id, idUser);
  }
}
