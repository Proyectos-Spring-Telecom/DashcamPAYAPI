import { NotFoundException } from '@nestjs/common';

/** Impide cambiar idCliente (u otra FK de tenant) en un update. Compatible: el mismo valor se ignora. */
export function forbidTenantMove(
  currentId: unknown,
  dto: Record<string, any> | null | undefined,
  field = 'idCliente',
  message = 'Recurso no encontrado',
) {
  if (!dto || dto[field] === undefined || dto[field] === null) {
    if (dto) delete dto[field];
    return;
  }
  if (Number(dto[field]) !== Number(currentId)) {
    throw new NotFoundException(message);
  }
  delete dto[field];
}
