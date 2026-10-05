import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

const MAX_LIMIT = 100;
const MAX_PAGE = 10000;

function clamp(raw: unknown, min: number, max: number): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < min) return String(min);
  if (n > max) return String(max);
  return String(n);
}

/** Evita listados con limit enorme (DoS). No cambia el contrato si ya piden ≤ 100. */
@Injectable()
export class ClampPageLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (req?.params?.limit !== undefined) {
      const nextLimit = clamp(req.params.limit, 1, MAX_LIMIT);
      if (nextLimit !== undefined) req.params.limit = nextLimit;
    }
    if (req?.params?.page !== undefined) {
      const nextPage = clamp(req.params.page, 1, MAX_PAGE);
      if (nextPage !== undefined) req.params.page = nextPage;
    }
    if (req?.query && req.query.limit !== undefined) {
      const nextLimit = clamp(req.query.limit, 1, MAX_LIMIT);
      if (nextLimit !== undefined) req.query.limit = nextLimit;
    }
    return next.handle();
  }
}
