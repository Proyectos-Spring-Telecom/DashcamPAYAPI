import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Put,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { PermisosService } from './permisos.service';
import { CreatePermisoDto } from './dto/create-permiso.dto';
import { UpdatePermisoDto } from './dto/update-permiso.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { UpdatePermisoEstatusDto } from './dto/update-permiso-estatus.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';

@Controller('permisos')
@UseGuards(JwtAuthGuard)
export class PermisosController {
  constructor(private readonly permisosService: PermisosService) {}

  @Post()
  async createPermioso(
    @Body() createPermiso: CreatePermisoDto,
    @Req() req,
  ): Promise<ApiCrudResponse> {
    const idUsuario = req.user.userId;
    return this.permisosService.createPermiso(createPermiso, idUsuario);
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ): Promise<ApiResponseCommon> {
    return await this.permisosService.findAll(page, limit);
  }

  @Get('list')
  async findAllList(): Promise<ApiResponseCommon> {
    return await this.permisosService.findAllList();
  }

  @Get('permisosAgrupados')
  async findAllAgrupado(@Req() req): Promise<any[]> {
    const idUser = req.user.userId;
    const permiso =
      await this.permisosService.obtenerPermisosAgrupados(+idUser);
    return permiso;
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.permisosService.findOne(+id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePermisoDto: UpdatePermisoDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.permisosService.update(id, updatePermisoDto, idUser);
  }

  @Patch(':id/estatus')
  async updatePermisoEstatus(
    @Param('id') id: string,
    @Request() req,
    @Body() updatePermisoEstatusDto: UpdatePermisoEstatusDto,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return await this.permisosService.updateEstatus(
      +id,
      idUser,
      updatePermisoEstatusDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.permisosService.remove(+id, idUser);
  }
}
