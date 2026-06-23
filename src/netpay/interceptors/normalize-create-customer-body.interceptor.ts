import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Se ejecuta ANTES del ValidationPipe global: copia alias (nombre, apellidos, telefono)
 * a firstName, lastName y phone en el body para que la validación no falle.
 */
@Injectable()
export class NormalizeCreateCustomerBodyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const b = req.body;

    if (b && typeof b === 'object' && !Array.isArray(b)) {
      const trimStr = (v: unknown): string =>
        v === undefined || v === null ? '' : String(v).trim();

      if (!trimStr(b.firstName) && trimStr(b.nombre)) {
        b.firstName = trimStr(b.nombre);
      }

      if (!trimStr(b.lastName)) {
        const joined = [trimStr(b.apellidoPaterno), trimStr(b.apellidoMaterno)]
          .filter(Boolean)
          .join(' ')
          .trim();
        if (joined) {
          b.lastName = joined;
        }
      }

      if (!trimStr(b.phone) && trimStr(b.telefono)) {
        b.phone = trimStr(b.telefono);
      }
    }

    return next.handle();
  }
}
