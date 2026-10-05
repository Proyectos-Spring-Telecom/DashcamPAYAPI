import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

function ctx(user?: { rol?: number }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const original = process.env.ENFORCE_ROLES_DENY_DEFAULT;
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ENFORCE_ROLES_DENY_DEFAULT;
    } else {
      process.env.ENFORCE_ROLES_DENY_DEFAULT = original;
    }
  });

  it('deja pasar rutas @Public', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return true;
      return undefined;
    });
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('niega sin usuario', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctx())).toBe(false);
  });

  it('deny-by-default: sin @Roles → 403', () => {
    delete process.env.ENFORCE_ROLES_DENY_DEFAULT;
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return undefined;
      return undefined;
    });
    expect(guard.canActivate(ctx({ rol: 2 }))).toBe(false);
  });

  it('ENFORCE_ROLES_DENY_DEFAULT=false permite rol conocido sin @Roles', () => {
    process.env.ENFORCE_ROLES_DENY_DEFAULT = 'false';
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return undefined;
      return undefined;
    });
    expect(guard.canActivate(ctx({ rol: 2 }))).toBe(true);
  });

  it('exige el rol listado en @Roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === ROLES_KEY) return [1, 2];
      return undefined;
    });
    expect(guard.canActivate(ctx({ rol: 3 }))).toBe(false);
    expect(guard.canActivate(ctx({ rol: 2 }))).toBe(true);
  });
});
