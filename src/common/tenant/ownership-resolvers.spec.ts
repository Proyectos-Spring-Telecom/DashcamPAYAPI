import {
  clienteHijosDesdeSp,
  clientesPermitidos,
  invalidateClientesPermitidos,
} from './ownership-resolvers';

describe('clientesPermitidos', () => {
  beforeEach(() => {
    invalidateClientesPermitidos();
  });

  it('deduplica, incluye al cliente y cachea el SP', async () => {
    let calls = 0;
    const ds = {
      query: async () => {
        calls += 1;
        return [[{ Id: 10 }, { Id: 10 }, { Id: 20 }]];
      },
    };

    const first = await clientesPermitidos(ds, 10);
    const second = await clientesPermitidos(ds, 10);
    expect(first).toEqual([10, 20]);
    expect(second).toEqual([10, 20]);
    expect(calls).toBe(1);
  });

  it('invalida el cache al crear/editar clientes', async () => {
    let calls = 0;
    const ds = {
      query: async () => {
        calls += 1;
        return [[{ Id: 1 }]];
      },
    };
    await clientesPermitidos(ds, 1);
    invalidateClientesPermitidos(1);
    await clientesPermitidos(ds, 1);
    expect(calls).toBe(2);
  });

  it('arma placeholders para los listados', async () => {
    const ds = {
      query: async () => [[{ Id: 5 }, { Id: 6 }]],
    };
    const result = await clienteHijosDesdeSp(ds, 5);
    expect(result.ids).toEqual([5, 6]);
    expect(result.placeholders).toBe('?, ?');
  });

  it('sin cliente válido usa sentinel -1 para evitar IN ()', async () => {
    invalidateClientesPermitidos();
    const ds = {
      query: async () => {
        throw new Error('no debe llamar al SP');
      },
    };
    const result = await clienteHijosDesdeSp(ds, 0);
    expect(result.ids).toEqual([-1]);
    expect(result.placeholders).toBe('?');
  });
});
