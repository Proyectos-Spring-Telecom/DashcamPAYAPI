import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Param,
  ParseIntPipe,
} from "@nestjs/common";
import { BitacoraLoggerService } from "./bitacora.service";
import { CreateBitacoraDto } from "./dto/create-bitacora.dto";
import { JwtAuthGuard } from "src/guard/jwt-auth.guard";
import { ApiResponseCommon } from "src/common/ApiResponse";

@UseGuards(JwtAuthGuard)
@Controller("bitacora")
export class BitacoraController {
  constructor(private readonly bitacoraService: BitacoraLoggerService) {}

  @Post()
  create(@Body() createBitacoraDto: CreateBitacoraDto) {
    return this.bitacoraService.createBitacora(createBitacoraDto);
  }

  @Get("list") //Obseleto
  async findAllListBitacora(): Promise<ApiResponseCommon> {
    return await this.bitacoraService.findAllListBitacora();
  }

  @Get(":page/:limit")
  findAll(
    @Param("page", ParseIntPipe) page: number,
    @Param("limit", ParseIntPipe) limit: number
  ): Promise<ApiResponseCommon> {
    return this.bitacoraService.findAll(page, limit);
  }

  @Get(":id")
  async findOne(@Param("id", ParseIntPipe) id: number) {
    return await this.bitacoraService.findOne(id);
  }
}
