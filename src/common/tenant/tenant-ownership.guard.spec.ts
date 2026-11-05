import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { TenantOwnershipGuard } from './tenant-ownership.guard';
import {
  TENANT_EXEMPT_KEY,
  TENANT_RESOURCE_KEY,
} from './tenant-resource.decorator';

function ctx(params: Record<string, string>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        params,
        method: 'GET',
        route: { path: '/x/:id' },
        user: { rol: 2, cliente: 7 },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('TenantOwnershipGuard (fail-closed)', () => {
  let reflector: Reflector;
  let guard: TenantOwnershipGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new TenantOwnershipGuard(reflector, {} as DataSource);
  });

  function meta(resource?: unknown, exempt?: string) {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === TENANT_RESOURCE_KEY) return resource;
      if (key === TENANT_EXEMPT_KEY) return exempt;
      return undefined;
    });
  }

  it('niega una ruta con :id sin @TenantResource ni @TenantExempt', async () => {
    meta();
    await expect(guard.canActivate(ctx({ id: '5' }))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deja pasar una ruta con :id y @TenantExempt', async () => {
    meta(undefined, 'Catálogo global sin IdCliente');
    await expect(guard.canActivate(ctx({ id: '5' }))).resolves.toBe(true);
  });

  it('deja pasar una ruta sin parámetro de objeto', async () => {
    meta();
    await expect(
      guard.canActivate(ctx({ page: '1', limit: '10' })),
    ).resolves.toBe(true);
  });

  it('rechaza un id con formato inválido antes de consultar', async () => {
    meta({ resolver: 'monedero' });
    await expect(
      guard.canActivate(ctx({ id: '1 OR 1' })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
