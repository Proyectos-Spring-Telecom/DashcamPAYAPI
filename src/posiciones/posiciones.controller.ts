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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpdatePosicionesDto } from './dto/update-posicione.dto';

@ApiTags('Posiciones')
@ApiBearerAuth('bearer-token')
@Controller('posiciones')
export class PosicionesController {
  constructor(private readonly posicionesService: PosicionesService) {}

  @Post()
  create(@Body() createPosicionesDto: CreatePosicionesDto) {
    return this.posicionesService.create(createPosicionesDto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePosicionesDto: UpdatePosicionesDto,
  ): Promise<ApiCrudResponse> {
    return this.posicionesService.update(id, updatePosicionesDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('list')
  async findAllList(@Request() req): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    const idUser = req.user.userId;
    return await this.posicionesService.findAllList(+idUser, +cliente, +rol);
  }

  @UseGuards(JwtAuthGuard)
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

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.posicionesService.findOne(+id);
  }
}
