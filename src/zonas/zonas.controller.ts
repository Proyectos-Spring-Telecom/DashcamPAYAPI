import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ZonasService } from './zonas.service';
import { CreateZonasDto } from './dto/create-zonas.dto';
import { UpdateZonasDto } from './dto/update-zonas.dto';
import { UpdateZonasEstatusDto } from './dto/update-zonas-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('zonas')
export class ZonasController {
  constructor(private readonly ZonasService: ZonasService) {}

  @Post()
  create(@Body() createZonasDto: CreateZonasDto, @Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.ZonasService.create(
      +idUser,
      +cliente,
      +rol,
      createZonasDto,
    );
  }

  @Get('list')
  async findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.ZonasService.findAllList(+cliente, +idUser, +rol);
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
    return this.ZonasService.findAll(+cliente, +idUser, +rol, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.ZonasService.findOne(+idUser, +id, +cliente, +rol);
  }

  @Patch('estatus/:id')
  async updateEstatus(
    @Param('id') id: string,
    @Body() updateZonasEstatusDto: UpdateZonasEstatusDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return await this.ZonasService.updateEstatus(
      +id,
      +idUser,
      +cliente,
      +rol,
      updateZonasEstatusDto,
    );
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateZonaDto: UpdateZonasDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.ZonasService.update(
      +id,
      +cliente,
      +idUser,
      +rol,
      updateZonaDto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.ZonasService.remove(+id, +cliente, +idUser, +rol);
  }
}
