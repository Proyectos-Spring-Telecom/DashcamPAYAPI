import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ownershipResolvers, ROL_SUPER_ADMIN } from './ownership-resolvers';

type Recurso = keyof typeof ownershipResolvers;

/**
 * N-07: toda FK padre que llega en un create/update (instalación, taller,
 * zona…) debe pertenecer al tenant del actor. Reutiliza los mismos resolvers
 * que TenantOwnershipGuard; 404 si no, igual que un id inexistente.
 */
export async function assertPadresEnTenant(
  ds: DataSource,
  actor: { cliente: number; rol: number; userId?: number },
  padres: Partial<Record<Recurso, number | string | null | undefined>>,
): Promise<void> {
  if (Number(actor.rol) === ROL_SUPER_ADMIN) return;
  const user = {
    userId: Number(actor.userId ?? 0),
    cliente: Number(actor.cliente),
    rol: Number(actor.rol),
  };
  for (const [recurso, id] of Object.entries(padres)) {
    if (id === undefined || id === null || id === '') continue;
    const resolver = ownershipResolvers[recurso as Recurso];
    if (!resolver || !(await resolver(ds, id, user))) {
      throw new NotFoundException(`${recurso} no encontrado.`);
    }
  }
}
