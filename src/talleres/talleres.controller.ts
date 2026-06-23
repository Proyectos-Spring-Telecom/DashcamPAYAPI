import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { TalleresService } from './talleres.service';
import { CreateTallereDto } from './dto/create-tallere.dto';
import { UpdateTallereDto } from './dto/update-tallere.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiResponseCommon } from 'src/common/ApiResponse';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Talleres')
@ApiBearerAuth('bearer-token')
@Controller('talleres')
@UseGuards(JwtAuthGuard)
export class TalleresController {
  constructor(private readonly talleresService: TalleresService) {}

  @Post()
  create(@Body() createTallereDto: CreateTallereDto, @Req() req: any) {
    createTallereDto.idCliente = Number(req.user.cliente);

    return this.talleresService.create(createTallereDto, req.user.userId);
  }

  @Get('list')
  findAll(@Req() req:any) {
    return this.talleresService.findAll(req);
  }

  @Get(':page/:limit')
  findAllPaginated(
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
    @Request() req,
  ): Promise<ApiResponseCommon> {
    return this.talleresService.findAllPaginated(req, page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.talleresService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTallereDto: UpdateTallereDto,@Req() req) {
    return this.talleresService.update(+id, updateTallereDto,req.user.userId);
  }
    @Patch('desactivar/:id')
  remove(@Param('id') id: number,@Req() req:any) {
    return this.talleresService.remove(+id,Number(req.user.userId));
  }
  @Patch('activar/:id')
  activar(@Param('id') id: number,@Req() req:any) {
    return this.talleresService.activar(+id,Number(req.user.userId));
  }
}
