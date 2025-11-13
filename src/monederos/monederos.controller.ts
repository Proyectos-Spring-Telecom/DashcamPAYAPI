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
} from "@nestjs/common";
import { MonederosService } from "./monederos.service";
import { CreateMonederoDto } from "./dto/create-monedero.dto";
import { UpdateMonederoDto } from "./dto/update-monedero.dto";
import { UpdateMonederoEstatusDto } from "./dto/update-monedero-estatus.dto";
import { JwtAuthGuard } from "src/guard/jwt-auth.guard";
import { ApiResponseCommon } from "src/common/ApiResponse";

@UseGuards(JwtAuthGuard)
@Controller("monederos")
export class MonederosController {
  constructor(private readonly monederosService: MonederosService) {}

  @Post()
  createMonedero(@Body() createMonederoDto: CreateMonederoDto, @Request() req) {
    const idUser = req.user.userId;
    return this.monederosService.createMonedero(createMonederoDto, +idUser);
  }

  @Get('list')
  findAllListMonederos(@Request() req): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.monederosService.findAllListMonederos(+ idUser, email, +cliente, +rol);
  }

  @Get(":page/:limit")
  findAllMonederos(
    @Param("page", ParseIntPipe) page: number,
    @Param("limit", ParseIntPipe) limit: number,
    @Request() req
  ): Promise<ApiResponseCommon> {
    const idUser = req.user.userId;
    const email = req.user.email;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.monederosService.findAllPagMonederos(+idUser, email, +cliente, +rol, page, limit);
  }

  @Get(":id")
  findOneMonedero(@Param("id") id: string, @Request() req) {
    return this.monederosService.findOneMonedero(+id);
  }

  @Get("numero/serie/:numeroSerie")
  findOneMonederoBySerie(@Param("numeroSerie") id: string, @Request() req) {
    return this.monederosService.findOneMonederoBySerie(id);
  }

  @Patch("estatus/:id")
  updateMonederoEstatus(
    @Param("id") id: string,
    @Request() req,
    @Body() updateMonederoEstatusDto: UpdateMonederoEstatusDto
  ) {
    const idUser = req.user.userId;
    return this.monederosService.updateMonederoEstatus(
      +id,
      +idUser,
      updateMonederoEstatusDto
    );
  }

  @Put(":id")
  updateMonedero(
    @Param("id") id: string,
    @Request() req,
    @Body() updateMonederoDto: UpdateMonederoDto
  ) {
    const idUser = req.user.userId;
    return this.monederosService.updateMonedero(
      +id,
      +idUser,
      updateMonederoDto
    );
  }

  @Delete(":id")
  removeMonedero(@Param("id") id: string, @Request() req) {
    const idUser = req.user.userId;
    return this.monederosService.removeMonedero(+id, +idUser);
  }
}
