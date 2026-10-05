import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { safeClientMessage } from 'src/common/client-message';

/**
 * Toda respuesta de error sale como texto.
 * Un 500 nunca incluye el mensaje del driver, de SQL ni del stack.
 */
@Catch()
export class HttpStringResponseFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpStringResponseFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(this.safeLog(exception));
        response.status(status).send('Error interno del servidor');
        return;
      }

      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res && 'message' in res
            ? (res as { message: unknown }).message
            : 'Error desconocido';

      response.status(status).send(safeClientMessage(message, status));
      return;
    }

    this.logger.error(this.safeLog(exception));
    response.status(500).send('Error interno del servidor');
  }

  private safeLog(exception: unknown): string {
    if (exception instanceof Error) {
      return `${exception.name}: ${safeClientMessage(exception.message, 500)}`;
    }
    return 'Error no controlado';
  }
}
