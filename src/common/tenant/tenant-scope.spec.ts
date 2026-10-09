import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { invalidateClientesPermitidos } from './ownership-resolvers';
import { assertPadresEnTenant } from './tenant-scope';

/**
 * N-07: las FK padre de un create/update deben ser del tenant del actor.
 * El DataSource simulado responde al SP de jerarquía (cliente 10 -> [10, 11])
 * y a los SELECT de los resolvers según el id pedido.
 */
function fakeDs(duenos: Record<string, number | null>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const ds = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.startsWith('CALL spGetClientes')) {
        return [[{ Id: 10 }, { Id: 11 }]];
      }
      const id = String(params?.[0]);
      if (!(id in duenos)) return [];
      return [{ IdCliente: duenos[id] }];
    },
  };
  return { ds: ds as unknown as DataSource, calls };
}

describe('assertPadresEnTenant', () => {
  beforeEach(() => invalidateClientesPermitidos());

  it('Super Admin (rol 1) no consulta nada', async () => {
    const { ds, calls } = fakeDs({});
    await expect(
      assertPadresEnTenant(ds, { cliente: 10, rol: 1 }, { operador: 999 }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('ignora FK ausentes (undefined/null/vacío)', async () => {
    const { ds, calls } = fakeDs({});
    await expect(
      assertPadresEnTenant(
        ds,
        { cliente: 10, rol: 2 },
        { operador: undefined, instalacion: null, taller: '' },
      ),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it('acepta FK del propio cliente o de un descendiente', async () => {
    const { ds } = fakeDs({ '5': 10, '6': 11 });
    await expect(
      assertPadresEnTenant(
        ds,
        { cliente: 10, rol: 2 },
        { operador: 5, instalacion: 6 },
      ),
    ).resolves.toBeUndefined();
  });

  it('404 si la FK es de otro tenant (mismo resultado que inexistente)', async () => {
    const { ds } = fakeDs({ '7': 99 });
    await expect(
      assertPadresEnTenant(ds, { cliente: 10, rol: 2 }, { operador: 7 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      assertPadresEnTenant(ds, { cliente: 10, rol: 2 }, { operador: 8 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404 si el recurso no tiene resolver registrado', async () => {
    const { ds } = fakeDs({ '5': 10 });
    await expect(
      assertPadresEnTenant(
        ds,
        { cliente: 10, rol: 2 },
        {
          noExiste: 5,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
