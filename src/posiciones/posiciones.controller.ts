import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PosicionesService } from './posiciones.service';
import { CreatePosicionesDto } from './dto/create-posicione.dto';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('posiciones')
export class PosicionesController {
  constructor(private readonly posicionesService: PosicionesService) {}

  @Post()
  create(@Body() createPosicionesDto: CreatePosicionesDto, @Request() req) {
    const idUser = req.user.userId;
    return this.posicionesService.create(idUser, createPosicionesDto);
  }

  @Get('list')
  async findAllList(): Promise<ApiResponseCommon> {
    return await this.posicionesService.findAllList();
  }

  @Get(':page/:limit')
  async findAll(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ): Promise<ApiResponseCommon> {
    return await this.posicionesService.findAll(page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.posicionesService.findOne(+id);
  }


}
