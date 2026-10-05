import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
  NotFoundException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { clientesPermitidos } from 'src/common/tenant/ownership-resolvers';
import { keyFromStoredUrl, parseTenantObjectKey } from './s3-key';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { S3Service } from './s3.service';
import { JwtAuthGuard } from 'src/guard/jwt-auth.guard';
import { Roles } from 'src/guard/roles.decorator';
import { UploadDto } from './dto/update-s3.dto';
import { PresignUrlDto } from './dto/presign-url.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('S3 - archivos')
@ApiBearerAuth('bearer-token')
@UseGuards(JwtAuthGuard)
@Roles(1, 2, 3, 9, 11)
@Controller('s3')
export class S3Controller {
  constructor(
    private readonly s3Service: S3Service,
    private readonly dataSource: DataSource,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // máximo 10 MB
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
        if (!allowedTypes.includes(file.mimetype)) {
          return cb(new Error('Solo se permiten PNG, JPG, JPEG o PDF'), false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadDto,
    @Request() req,
  ) {
    const { folder, idModule } = body;
    const idUser = req.user.userId;
    const idCliente = Number(req.user.cliente) || 0;

    if (!file) throw new BadRequestException('Archivo requerido');

    return this.s3Service.uploadFile(
      file,
      folder,
      idUser,
      Number(idModule),
      idCliente,
    );
  }

  @Post('url-firmada')
  async firmarUrl(@Body() body: PresignUrlDto, @Request() req) {
    const key = keyFromStoredUrl(
      body.url,
      process.env.AWS_S3_BUCKET || '',
      process.env.AWS_REGION || '',
    );
    const parsed = key ? parseTenantObjectKey(key) : null;
    if (!key || !parsed) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    if (Number(req.user?.rol) !== 1) {
      const permitidos = await clientesPermitidos(
        this.dataSource,
        Number(req.user?.cliente) || 0,
      );
      if (!permitidos.includes(parsed.idCliente)) {
        throw new NotFoundException('Recurso no encontrado.');
      }
    }

    const url = await this.s3Service.getPresignedUrl(key, 300);
    return { url, expiresIn: 300 };
  }
}
