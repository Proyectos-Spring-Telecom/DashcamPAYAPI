import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
  Patch,
} from '@nestjs/common';
import { PosicionesService } from './posiciones.service';
import { CreatePosicionesDto } from './dto/create-posicione.dto';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import { TenantResource } from 'src/common/tenant/tenant-resource.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdatePosicionesDto } from './dto/update-posicione.dto';

@ApiTags('Posiciones')
@ApiBearerAuth('bearer-token')
@Roles(1, 2, 3)
@Controller('posiciones')
export class PosicionesController {
  constructor(private readonly posicionesService: PosicionesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles(1, 2, 3)
  create(@Body() createPosicionesDto: CreatePosicionesDto, @Request() req) {
    return this.posicionesService.create(createPosicionesDto, {
      userId: Number(req.user.userId),
      cliente: Number(req.user.cliente),
      rol: Number(req.user.rol),
    });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @TenantResource('posicion')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePosicionesDto: UpdatePosicionesDto,
  ): Promise<ApiCrudResponse> {
    return this.posicionesService.update(id, updatePosicionesDto);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('list')
  async findAllList(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return await this.posicionesService.findAllList(+idUser, +cliente, +rol);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return await this.posicionesService.findAll(
      +idUser,
      +cliente,
      +rol,
      page,
      limit,
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get(':id')
  @TenantResource('posicion')
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.posicionesService.findOne(
      +id,
      Number(req.user.cliente),
      Number(req.user.rol),
    );
  }
}
