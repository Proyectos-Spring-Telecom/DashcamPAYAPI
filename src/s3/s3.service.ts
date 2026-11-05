import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
  Logger,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';
import { BitacoraLoggerService } from 'src/bitacora/bitacora.service';
import { EstatusEnumBitcora } from 'src/common/ApiResponse';
import {
  detectAllowedUploadKind,
  extensionForUploadKind,
} from 'src/common/magic-bytes';
import { buildS3ObjectKey, S3FolderNotAllowedError } from './s3-key';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket: string;

  constructor(private readonly bitacoraLogger: BitacoraLoggerService) {
    this.client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET!;
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string,
    idUser: number,
    idModule: number,
    idCliente = 0,
  ) {
    try {
      if (!file) throw new BadRequestException('Archivo requerido');

      // Validar tipo de archivo
      const allowedMimeTypes = [
        'image/png',
        'image/jpg',
        'image/jpeg',
        'application/pdf',
      ];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException('Solo se permiten PNG, JPG, JPEG o PDF');
      }

      const kind = detectAllowedUploadKind(file.buffer);
      if (!kind) {
        throw new BadRequestException('Solo se permiten PNG, JPG, JPEG o PDF');
      }

      if (file.size >= Number(process.env.UPLOAD_MAX_SIZE)) {
        throw new BadRequestException('Archivo demasiado grande');
      }

      const extension = extensionForUploadKind(kind);

      let key: string;
      try {
        key = buildS3ObjectKey(folder, idCliente, idUser, uuid(), extension);
      } catch (err) {
        if (err instanceof S3FolderNotAllowedError) {
          throw new BadRequestException('Carpeta de carga no permitida');
        }
        throw err;
      }

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'private', // sigue siendo privado
        }),
      );

      const publicUrl = `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = {
        data: `INSERT INTO ${folder} (...) VALUES (...) -> bucket:  ${this.bucket} url: ${publicUrl}`,
      };
      await this.bitacoraLogger.logToBitacora(
        `${folder}`,
        `Se subio archivo al bucket: ${this.bucket}`,
        'CREATE',
        querylogger,
        idUser,
        idModule,
        EstatusEnumBitcora.SUCCESS,
      );

      return { url: publicUrl };
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = {
        data: `INSERT INTO ${folder} (...) VALUES (...) -> bucket:  ${this.bucket}`,
      };
      await this.bitacoraLogger.logToBitacora(
        `${folder}`,
        `Se subio archivo al bucket: ${this.bucket}`,
        'CREATE',
        querylogger,
        idUser,
        idModule,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Error subiendo el archivo a S3');
    }
  }

  async getPresignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
  }

  async deleteFile(
    url: string,
    idUser: number,
    idModule: number,
  ): Promise<void> {
    try {
      if (!url) return;

      // Extraer la key de la URL
      // Formato: https://bucket.s3.region.amazonaws.com/folder/filename.ext
      const urlPattern = new RegExp(
        `https://${this.bucket}\\.s3\\.${process.env.AWS_REGION}\\.amazonaws\\.com/(.+)`,
      );
      const match = url.match(urlPattern);

      if (!match || !match[1]) {
        this.logger.warn('No se pudo extraer la key de la URL');
        return;
      }

      const key = match[1];

      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      //-----Registro en la bitacora----- SUCCESS
      const querylogger = {
        data: `DELETE FROM S3 -> bucket: ${this.bucket} key: ${key}`,
      };
      await this.bitacoraLogger.logToBitacora(
        'S3',
        `Se eliminó archivo del bucket: ${this.bucket}`,
        'DELETE',
        querylogger,
        idUser,
        idModule,
        EstatusEnumBitcora.SUCCESS,
      );
    } catch (error) {
      //-----Registro en la bitacora----- ERROR
      const querylogger = {
        data: `DELETE FROM S3 -> bucket: ${this.bucket} url: ${url}`,
      };
      await this.bitacoraLogger.logToBitacora(
        'S3',
        `Error al eliminar archivo del bucket: ${this.bucket}`,
        'DELETE',
        querylogger,
        idUser,
        idModule,
        EstatusEnumBitcora.ERROR,
        error.message,
      );
      // No lanzar error para que no falle la actualización si no se puede eliminar el archivo anterior
      this.logger.error('Error eliminando archivo de S3');
    }
  }
}
