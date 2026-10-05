import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Put,
  ParseIntPipe,
} from '@nestjs/common';
import { CatpasajeroService } from './catpasajero.service';
import { CreateCatpasajeroDto } from './dto/create-catpasajero.dto';
import { UpdateCatpasajeroDto } from './dto/update-catpasajero.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { TenantOwnershipGuard } from 'src/common/tenant/tenant-ownership.guard';
import { TenantResource } from 'src/common/tenant/tenant-resource.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/guard/roles.decorator';

@ApiTags('Catálogo tipos pasajeros')
@ApiBearerAuth('bearer-token')
@Roles(1, 2, 3, 9, 11)
@Controller('catpasajero')
export class CatpasajeroController {
  constructor(private readonly catpasajeroService: CatpasajeroService) {}

  @Roles(1, 2)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Post()
  create(@Body() createCatpasajeroDto: CreateCatpasajeroDto, @Request() req) {
    const idUser = req.user.userId;
    return this.catpasajeroService.create(
      +idUser,
      createCatpasajeroDto,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const _idUser = req.user.userId;
    const rol = req.user.rol;
    return this.catpasajeroService.findAllList(+cliente, +rol);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get('clientes/:id')
  @TenantResource({ resolver: 'cliente', idParam: 'id' })
  findAllListClientes(@Param('id', ParseIntPipe) id: number) {
    return this.catpasajeroService.findAllListClientes(id);
  }

  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Get(':id')
  @TenantResource('catTipoPasajero')
  findOne(@Param('id') id: string, @Request() req) {
    return this.catpasajeroService.findOne(
      +id,
      +req.user.cliente,
      +req.user.rol,
    );
  }

  @Roles(1, 2)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Put(':id')
  @TenantResource('catTipoPasajero')
  update(
    @Param('id') id: string,
    @Body() updateCatpasajeroDto: UpdateCatpasajeroDto,
    @Request() req,
  ) {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return this.catpasajeroService.update(+id, +idUser, updateCatpasajeroDto);
  }

  @Roles(1, 2)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Patch('estatus/:id')
  @TenantResource('catTipoPasajero')
  updateEstatus(
    @Param('id') id: string,
    @Body() updateCatpasajeroDto: UpdateCatpasajeroDto,
    @Request() req,
  ) {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return this.catpasajeroService.update(+id, +idUser, updateCatpasajeroDto);
  }

  @Roles(1, 2)
  @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
  @Delete(':id')
  @TenantResource('catTipoPasajero')
  remove(@Param('id') id: string, @Request() req) {
    const _cliente = req.user.cliente;
    const idUser = req.user.userId;
    const _rol = req.user.rol;
    return this.catpasajeroService.remove(+id, +idUser);
  }
}
