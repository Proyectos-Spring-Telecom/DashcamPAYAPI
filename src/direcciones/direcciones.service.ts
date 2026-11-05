import {
  BadRequestException,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Injectable()
export class DireccionesService {
  private readonly apiUrl: string =
    'https://tecsautilities.mx/api-sepomex/api-sepomex/codigos-postales/';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async findByCodigoPostal(cp: string): Promise<any> {
    if (!/^\d{5}$/.test(String(cp ?? '').trim())) {
      throw new BadRequestException('Código postal inválido');
    }
    const codigo = String(cp).trim();
    try {
      const url = `${this.apiUrl}${codigo}`;

      const response = await firstValueFrom(
        this.httpService.get<any>(url).pipe(
          map((response) => response.data),
          catchError(() => {
            return throwError(
              () =>
                new HttpException(
                  'No se pudo consultar el código postal',
                  HttpStatus.BAD_GATEWAY,
                ),
            );
          }),
        ),
      );

      return response;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error al consultar direcciones por código postal',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
