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
import { UsuarioszonasService } from './usuarioszonas.service';
import { CreateUsuariosZonasDto } from './dto/create-usuarioszona.dto';
import { UpdateUsuarioszonaDto } from './dto/update-usuarioszona.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { UpdateUsuariosZonasEstatusDto } from './dto/update-usuarioszona-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Usuarios Zonas')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('usuarioszonas')
export class UsuarioszonasController {
  constructor(private readonly usuarioszonasService: UsuarioszonasService) {}

  @Post()
  async create(
    @Body() createUsuariosZonasDto: CreateUsuariosZonasDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuarioszonasService.create(
      +idUser,
      createUsuariosZonasDto,
    );
  }

  @Get('list')
  async findAllList(): Promise<ApiResponseCommon> {
    return await this.usuarioszonasService.findAllList();
  }

  @Get('usuario/:idUsuario')
  async findOneUsuario(@Param('idUsuario', ParseIntPipe) id: number) {
    return await this.usuarioszonasService.findOneUsuario(id);
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() _req,
  ): Promise<ApiResponseCommon> {
    return await this.usuarioszonasService.findAll(page, limit);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.usuarioszonasService.findOne(+id);
  }

  @Patch('estatus/:id')
  async updateEstatus(
    @Param('id') id: string,
    @Body() updateUsuariosZonasEstatusDto: UpdateUsuariosZonasEstatusDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuarioszonasService.updateEstatus(
      +id,
      idUser,
      updateUsuariosZonasEstatusDto,
    );
  }

  @Put(':idUsuario')
  async update(
    @Param('idUsuario') id: string,
    @Body() updateUsuarioszonaDto: UpdateUsuarioszonaDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.usuarioszonasService.update(+id, idUser, updateUsuarioszonaDto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.usuarioszonasService.remove(+id, idUser);
  }
}
