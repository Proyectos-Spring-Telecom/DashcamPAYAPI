import { HttpException, InternalServerErrorException } from '@nestjs/common';

export { safeClientMessage } from './client-message';

/** Relanza HttpException de negocio; el resto se convierte en 500 genérico. */
export function rethrowOrInternal(error: unknown, message: string): never {
  if (error instanceof HttpException) {
    throw error;
  }
  throw new InternalServerErrorException(message);
}
