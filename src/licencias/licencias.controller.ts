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
  ParseIntPipe,
  Put,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { LicenciasService } from './licencias.service';
import { CreateLicenciaDto } from './dto/create-licencia.dto';
import { UpdateLicenciaDto } from './dto/update-licencia.dto';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiOperation, ApiBody } from '@nestjs/swagger';

@ApiTags('Licencias')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Controller('licencias')
export class LicenciasController {
  constructor(private readonly licenciasService: LicenciasService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('licencia', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // máximo 10 MB
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
        if (file && !allowedTypes.includes(file.mimetype)) {
          return cb(
            new Error('Solo se permiten PNG, JPG, JPEG o PDF'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Crear una nueva licencia',
    description: 'Crea un nuevo registro de licencia con toda la información. El campo licencia debe ser un archivo (imagen o PDF).',
  })
  @ApiBody({
    type: CreateLicenciaDto,
    description: 'Datos de la licencia a crear (FormData)',
  })
  create(
    @Body() createLicenciaDto: CreateLicenciaDto,
    @UploadedFile() licenciaFile: Express.Multer.File,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.licenciasService.create(idUser, createLicenciaDto, licenciaFile);
  }

  @Get('list')
  findAllList(@Request() req) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.licenciasService.findAllList(+cliente, +rol);
  }

  @Get(':page/:limit')
  findAll(
    @Request() req,
    @Param('page', ParseIntPipe) page: number,
    @Param('limit', ParseIntPipe) limit: number,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.licenciasService.findAll(+cliente, +rol, page, limit);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.licenciasService.findOne(+id, +cliente, +rol );
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateLicenciaDto: UpdateLicenciaDto,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.licenciasService.update(+id, +idUser, updateLicenciaDto);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Request() req,
  ) {
    const idUser = req.user.userId;
    const cliente = req.user.cliente;
    const rol = req.user.rol;
    return this.licenciasService.remove(+id, +idUser);
  }
}
