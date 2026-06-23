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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Catálogo tipos pasajeros')
@ApiBearerAuth('bearer-token')
@Controller('catpasajero')
export class CatpasajeroController {
  constructor(private readonly catpasajeroService: CatpasajeroService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() createCatpasajeroDto: CreateCatpasajeroDto, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.catpasajeroService.create(+idUser, createCatpasajeroDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('list')
  findAllList(@Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.catpasajeroService.findAllList(+cliente, +rol);
  }

  @UseGuards(JwtAuthGuard)
  @Get('clientes/:id')
  findAllListClientes(@Param('id', ParseIntPipe) id: number) {
    return this.catpasajeroService.findAllListClientes(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.catpasajeroService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateCatpasajeroDto: UpdateCatpasajeroDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.catpasajeroService.update(+id, +idUser, updateCatpasajeroDto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('estatus/:id')
  updateEstatus(
    @Param('id') id: string,
    @Body() updateCatpasajeroDto: UpdateCatpasajeroDto,
    @Request() req,
  ) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.catpasajeroService.update(+id, +idUser, updateCatpasajeroDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const cliente = req.user.cliente;
    const idUser = req.user.userId;
    const rol = req.user.rol;
    return this.catpasajeroService.remove(+id, +idUser);
  }
}
