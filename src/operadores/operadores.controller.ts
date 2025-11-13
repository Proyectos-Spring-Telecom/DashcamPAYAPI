import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Put,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { OperadoresService } from './operadores.service';
import { CreateOperadoreDto } from './dto/create-operadore.dto';
import { UpdateOperadoreDto } from './dto/update-operadore.dto';
import { UpdateOperadorStatusDto } from './dto/update-operadores-estatus.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiCrudResponse, ApiResponseCommon } from 'src/common/ApiResponse';

@UseGuards(JwtAuthGuard)
@Controller('operadores')
export class OperadoresController {
  constructor(private readonly operadoresService: OperadoresService) {}

  @Post()
  createOperador(
    @Body() createOperadoreDto: CreateOperadoreDto,
    @Request() req,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.operadoresService.createOperador(createOperadoreDto, +idUser);
  }

  @Get(':page/:limit')
  findAllOperador(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.operadoresService.findAllOperadores(+cliente, +rol, page, limit);
  }

  @Get('list')
  findAllListOperador(@Request() req,): Promise<ApiResponseCommon> {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.operadoresService.findAllListOperadores(+cliente, +rol,);
  }

  @Get(':id')
  findOneOperador(@Param('id') id: string,@Request() req) {
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.operadoresService.findOneOperador(+id, +cliente, + rol);
  }

  @Patch('estatus/:id')
  updateOperadorEstatus(
    @Param('id') id: string,
    @Request() req,
    @Body() updateOperadorStatusDto: UpdateOperadorStatusDto,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.operadoresService.updateOperadorEstatus(
      +id,
      +idUser,
      updateOperadorStatusDto,
    );
  }

  @Put(':id')
  updateOperador(
    @Param('id') id: string,
    @Request() req,
    @Body() updateOperadoreDto: UpdateOperadoreDto,
  ): Promise<ApiCrudResponse> {
    const idUser = req.user.userId;
    return this.operadoresService.updateOperador(
      +id,
      +idUser,
      updateOperadoreDto,
    );
  }

  @Delete(':id')
  removeOperador(@Param('id') id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.operadoresService.removeOperador(+id, +idUser);
  }
}
